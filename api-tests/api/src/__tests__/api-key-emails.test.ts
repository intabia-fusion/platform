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

import { loadServerConfig, type ServerConfig } from '@hcengineering/api-client'

import { MAILPIT_URL, rpc, STAND_URL, waitForMail } from './admin.fixtures'

// A param missing from one template makes translate() return the bare key for that part only,
// so the text and HTML parts are checked separately. No clearMail: suites run in parallel and
// share mailpit, so letters are told apart by address and subject.
describe('api-key-emails', () => {
  const stamp = Date.now()
  const email = `apikey-owner-${stamp}@example.com`
  const password = '1234'
  const keyName = `key-${stamp}`

  let config: ServerConfig
  let wsToken: string
  let keyId: string

  async function mailParts (id: string): Promise<{ text: string, html: string }> {
    const res = await fetch(`${MAILPIT_URL}/api/v1/message/${id}`)
    expect(res.ok).toBe(true)
    const body = await res.json()
    return { text: body.Text ?? '', html: body.HTML ?? '' }
  }

  async function expectRendered (id: string): Promise<void> {
    const { text, html } = await mailParts(id)
    for (const part of [text, html]) {
      expect(part).not.toContain('account:string:')
      expect(part).toContain(keyName)
    }
  }

  beforeAll(async () => {
    config = await loadServerConfig(STAND_URL)
    const signedUp = await rpc(config, undefined, 'signUp', { email, password, firstName: 'Key', lastName: 'Owner' })
    expect(signedUp.error).toBeUndefined()

    const created = await rpc(config, signedUp.result.token, 'createWorkspace', { workspaceName: `apikey-${stamp}` })
    expect(created.error).toBeUndefined()

    const selected = await rpc(config, signedUp.result.token, 'selectWorkspace', {
      workspaceUrl: created.result.workspaceUrl,
      kind: 'external'
    })
    expect(selected.error).toBeUndefined()
    wsToken = selected.result.token
  }, 300000)

  it('tells the owners a key was issued', async () => {
    const res = await rpc(config, wsToken, 'createApiKey', { name: keyName, ops: ['issue:create'] })
    expect(res.error).toBeUndefined()
    keyId = res.result.info.keyId

    const mail = await waitForMail(email, 30000, 'New API key issued')
    expect(mail).toBeDefined()
    expect(mail?.Subject).not.toContain('account:string:')
    await expectRendered(mail?.ID ?? '')
  }, 120000)

  it('tells the owners a key was revoked', async () => {
    const res = await rpc(config, wsToken, 'revokeApiKey', { keyId })
    expect(res.error).toBeUndefined()

    const mail = await waitForMail(email, 30000, 'API key revoked')
    expect(mail).toBeDefined()
    expect(mail?.Subject).not.toContain('account:string:')
    await expectRendered(mail?.ID ?? '')
  }, 120000)
})
