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

import { createRestClient, loadServerConfig, type RestClient, type ServerConfig } from '@hcengineering/api-client'
import chunter, { type Channel } from '@hcengineering/chunter'
import core, { generateId, type Ref, systemAccountUuid, type WorkspaceUuid } from '@hcengineering/core'
import { generateToken } from '@hcengineering/server-token'

import { DEV_OTP, rpc, STAND_URL, TRANSACTOR_URL } from './admin.fixtures'

// A workspace key posts into the private channel it lists without being a member.
// A personal key stays within its user's membership.
describe('api-key-private-space', () => {
  const stamp = Date.now()
  const email = `apikey-space-${stamp}@example.com`
  const password = '1234'

  let config: ServerConfig
  let wsToken: string
  let wsUuid: WorkspaceUuid
  let system: RestClient
  let channel: Ref<Channel>

  async function keyToken (params: Record<string, any>): Promise<string> {
    const created = await rpc(config, wsToken, 'createApiKey', { ops: ['chat:post'], spaces: [channel], ...params })
    expect(created.error).toBeUndefined()
    const login = await rpc(config, undefined, 'loginWithApiKey', { key: created.result.key })
    expect(login.error).toBeUndefined()
    return login.result.token
  }

  async function waitActive (adminSession: string, timeoutMs = 240000): Promise<void> {
    const until = Date.now() + timeoutMs
    let last: string | undefined
    while (Date.now() < until) {
      const res = await rpc(config, adminSession, 'listWorkspaces', {})
      last = res.result?.find((it: any) => it.uuid === wsUuid)?.status?.mode
      if (last === 'active') return
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
    throw new Error(`workspace never became active, last: ${last}`)
  }

  async function post (token: string, message: string): Promise<Response> {
    return await fetch(`${TRANSACTOR_URL}/api/v1/ops/chat:post/${wsUuid}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ space: channel, message })
    })
  }

  beforeAll(async () => {
    config = await loadServerConfig(STAND_URL)
    const signedUp = await rpc(config, undefined, 'signUp', { email, password, firstName: 'Key', lastName: 'Space' })
    expect(signedUp.error).toBeUndefined()

    const created = await rpc(config, signedUp.result.token, 'createWorkspace', { workspaceName: `apikey-sp-${stamp}` })
    expect(created.error).toBeUndefined()
    wsUuid = created.result.workspace

    const selected = await rpc(config, signedUp.result.token, 'selectWorkspace', {
      workspaceUrl: created.result.workspaceUrl,
      kind: 'external'
    })
    expect(selected.error).toBeUndefined()
    wsToken = selected.result.token

    // The transactor refuses a session until the workspace is created.
    const login = await rpc(config, undefined, 'login', { email: 'admin', password })
    expect(login.error).toBeUndefined()
    const admin = await rpc(config, login.result.token, 'verifyAdminSession', { otpCode: DEV_OTP })
    expect(admin.error).toBeUndefined()
    await waitActive(admin.result.token)

    // Nobody is a member, the owner included - so only the key's grant can open it.
    system = createRestClient(TRANSACTOR_URL, wsUuid, generateToken(systemAccountUuid, wsUuid, undefined, 'secret'))
    channel = await system.createDoc(chunter.class.Channel, core.space.Space, {
      name: `alerts-${stamp}`,
      description: '',
      private: true,
      archived: false,
      members: [],
      topic: ''
    })
  }, 300000)

  it('workspace key posts into a private channel it was issued for', async () => {
    const message = `workspace-key-${generateId()}`
    const res = await post(await keyToken({ name: `ws-key-${stamp}` }), message)
    expect(res.status).toBe(200)

    const messages = await system.findAll(chunter.class.ChatMessage, { attachedTo: channel })
    expect(messages.some((it) => it.message.includes(message))).toBe(true)
  }, 120000)

  it('personal key does not post into a private channel its user is not a member of', async () => {
    const message = `personal-key-${generateId()}`
    // The owner sees every space, so the channel resolves; the write is what gets refused.
    const res = await post(await keyToken({ name: `personal-key-${stamp}`, personal: true }), message)
    expect(res.status).not.toBe(200)

    const messages = await system.findAll(chunter.class.ChatMessage, { attachedTo: channel })
    expect(messages.some((it) => it.message.includes(message))).toBe(false)
  }, 120000)
})
