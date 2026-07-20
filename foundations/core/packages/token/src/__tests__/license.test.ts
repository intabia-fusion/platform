//
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
//

import { generateKeyPairSync, sign as cryptoSign } from 'crypto'
import { COMMUNITY_MAX_USERS, resolveEdition, resolveMaxUsers, verifyLicense, type License } from '../license'

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
const publicKeyB64 = Buffer.from(publicKeyPem, 'utf8').toString('base64')

function signKey (payload: Partial<License>): string {
  const payloadBytes = Buffer.from(JSON.stringify(payload), 'utf8')
  const sig = cryptoSign('sha256', payloadBytes, privateKey)
  return `${payloadBytes.toString('base64url')}.${sig.toString('base64url')}`
}

const validPayload: License = { maxUsers: 50, canRunPayment: true, issuedTo: 'acme' }

describe('license', () => {
  afterEach(() => {
    delete process.env.LICENSE_PUBLIC_KEY
    delete process.env.LICENSE_KEY
  })

  it('dev build (no public key): edition dev, unlimited, verify null', () => {
    expect(resolveEdition()).toBe('dev')
    expect(resolveMaxUsers()).toBe(0)
    expect(verifyLicense(signKey(validPayload))).toBeNull()
  })

  it('licensed: valid key returns payload, edition licensed, maxUsers from key', () => {
    process.env.LICENSE_PUBLIC_KEY = publicKeyB64
    const key = signKey(validPayload)
    expect(verifyLicense(key)).toEqual(validPayload)
    expect(resolveEdition(key)).toBe('licensed')
    expect(resolveMaxUsers(key)).toBe(50)
  })

  it('community: public key set but no license key -> cap 15', () => {
    process.env.LICENSE_PUBLIC_KEY = publicKeyB64
    expect(verifyLicense(undefined)).toBeNull()
    expect(resolveEdition(undefined)).toBe('community')
    expect(resolveMaxUsers(undefined)).toBe(COMMUNITY_MAX_USERS)
  })

  it('bad signature -> null (community)', () => {
    process.env.LICENSE_PUBLIC_KEY = publicKeyB64
    const key = signKey(validPayload)
    const tampered = key.slice(0, -4) + 'AAAA'
    expect(verifyLicense(tampered)).toBeNull()
    expect(resolveEdition(tampered)).toBe('community')
  })

  it('tampered payload (re-signed maxUsers) fails against our key', () => {
    process.env.LICENSE_PUBLIC_KEY = publicKeyB64
    // Sign with a DIFFERENT private key — simulates a forged key.
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const payloadBytes = Buffer.from(JSON.stringify({ maxUsers: 9999, canRunPayment: true }), 'utf8')
    const sig = cryptoSign('sha256', payloadBytes, other.privateKey)
    const forged = `${payloadBytes.toString('base64url')}.${sig.toString('base64url')}`
    expect(verifyLicense(forged)).toBeNull()
  })

  it('expired key -> null', () => {
    process.env.LICENSE_PUBLIC_KEY = publicKeyB64
    const key = signKey({ ...validPayload, expiresAt: Date.now() - 1000 })
    expect(verifyLicense(key)).toBeNull()
  })

  it('non-expired key with future expiry -> valid', () => {
    process.env.LICENSE_PUBLIC_KEY = publicKeyB64
    const key = signKey({ ...validPayload, expiresAt: Date.now() + 60_000 })
    expect(verifyLicense(key)).not.toBeNull()
  })

  it('malformed key (no dot) -> null', () => {
    process.env.LICENSE_PUBLIC_KEY = publicKeyB64
    expect(verifyLicense('garbage')).toBeNull()
    expect(verifyLicense('')).toBeNull()
  })

  it('licensed unlimited (maxUsers 0)', () => {
    process.env.LICENSE_PUBLIC_KEY = publicKeyB64
    const key = signKey({ maxUsers: 0, canRunPayment: true })
    expect(resolveMaxUsers(key)).toBe(0)
    expect(resolveEdition(key)).toBe('licensed')
  })
})
