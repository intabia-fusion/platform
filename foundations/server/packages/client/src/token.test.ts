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
import { type AccountUuid, type WorkspaceUuid } from '@hcengineering/core'
import { generateToken } from '@hcengineering/server-token'

import { extractToken, extractTokenWithRaw, readToken } from './token'

const ACCOUNT_A = '59eec4ec-c916-47a2-b19c-1fe156e07c87' as AccountUuid
const ACCOUNT_B = '0bb2a7b3-1a5a-4a63-9a37-2f5bb75b0a4f' as AccountUuid
const WORKSPACE = '87a386a9-e662-42fa-8b64-89b1c249999a' as WorkspaceUuid
const OTHER_WORKSPACE = '44f0d558-3261-44bf-936a-114a6a7f31e7' as WorkspaceUuid

describe('extractTokenWithRaw', () => {
  it('returns the raw string the decoded token came from', () => {
    const raw = generateToken(ACCOUNT_A, WORKSPACE, {}, 'secret')
    const extracted = extractTokenWithRaw({ authorization: `Bearer ${raw}` })

    expect(extracted?.token.account).toBe(ACCOUNT_A)
    expect(extracted?.raw).toBe(raw)
  })

  // A browser signed into two accounts carries two token cookies. `extractToken` prefers the one
  // naming a workspace, while `readToken` takes the first - sending that raw to account would ask
  // about another account and cache its workspace list under the wrong key.
  it('pairs a workspace cookie with its own raw, not with the first cookie', () => {
    const first = generateToken(ACCOUNT_A, undefined, {}, 'secret')
    const second = generateToken(ACCOUNT_B, WORKSPACE, {}, 'secret')
    const headers = { cookie: `token-a=${first}; account-metadata-Token=${second}` }

    const extracted = extractTokenWithRaw(headers)

    expect(extracted?.token.account).toBe(ACCOUNT_B)
    expect(extracted?.raw).toBe(second)

    // the reason the raw has to come from the same call
    expect(readToken(headers)).toBe(first)
    expect(extractToken(headers)?.account).toBe(ACCOUNT_B)
  })

  it('keeps the fallback order for cookies without a workspace', () => {
    const first = generateToken(ACCOUNT_A, undefined, {}, 'secret')
    const second = generateToken(ACCOUNT_B, undefined, {}, 'secret')

    const extracted = extractTokenWithRaw({ cookie: `token-a=${first}; token-b=${second}` })

    expect(extracted?.token.account).toBe(ACCOUNT_A)
    expect(extracted?.raw).toBe(first)
  })

  it('ignores an unreadable token and takes the next cookie', () => {
    const valid = generateToken(ACCOUNT_B, WORKSPACE, {}, 'secret')

    const extracted = extractTokenWithRaw({ cookie: `token-a=not-a-jwt; token-b=${valid}` })

    expect(extracted?.raw).toBe(valid)
  })

  it('returns nothing when no token can be decoded', () => {
    expect(extractTokenWithRaw({ cookie: 'token-a=not-a-jwt' })).toBeUndefined()
    expect(extractTokenWithRaw({})).toBeUndefined()
  })

  it('keeps the guest claim of a public link', () => {
    const raw = generateToken(ACCOUNT_A, WORKSPACE, { guest: 'true' }, 'secret')

    const extracted = extractTokenWithRaw({ cookie: `token=${raw}` })

    expect(extracted?.token.extra?.guest).toBe('true')
    expect(extracted?.raw).toBe(raw)
  })

  // Two public links, two tabs: without the asked workspace the token of the other one answers
  it('serves the cookie of the requested workspace, not the first one', () => {
    const first = generateToken(ACCOUNT_A, WORKSPACE, {}, 'secret')
    const second = generateToken(ACCOUNT_B, OTHER_WORKSPACE, {}, 'secret')
    const headers = {
      cookie: `presentation-metadata-Token-${WORKSPACE}=${first}; presentation-metadata-Token-${OTHER_WORKSPACE}=${second}`
    }

    expect(extractTokenWithRaw(headers, OTHER_WORKSPACE)?.raw).toBe(second)
    expect(extractTokenWithRaw(headers, OTHER_WORKSPACE)?.token.account).toBe(ACCOUNT_B)
    expect(extractTokenWithRaw(headers, WORKSPACE)?.raw).toBe(first)
    // nothing asked: the first cookie with a workspace, as before
    expect(extractTokenWithRaw(headers)?.raw).toBe(first)
  })

  it('falls back to a workspace cookie when the asked one is absent', () => {
    const only = generateToken(ACCOUNT_A, WORKSPACE, {}, 'secret')
    const headers = { cookie: `presentation-metadata-Token=${only}` }

    // a token of another workspace still beats no token: the middleware refuses it itself
    expect(extractTokenWithRaw(headers, OTHER_WORKSPACE)?.raw).toBe(only)
    expect(extractToken(headers, OTHER_WORKSPACE)?.workspace).toBe(WORKSPACE)
  })
})
