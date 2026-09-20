/**
  Copyright © 2026 Intabia Fusion.

  Licensed under the Eclipse Public License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License. You may
  obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.

  See the License for the specific language governing permissions and
  limitations under the License.
*/

import { loadServerConfig, type ServerConfig } from '@hcengineering/api-client'
import { type AccountUuid, type WorkspaceUuid } from '@hcengineering/core'

import { DEV_OTP, isForbidden, isRefused, rpc, statusCode, STAND_URL } from './admin.fixtures'

/**
 * An admin can keep a person out without deleting anything: `blocked_on` is refused by every path
 * that hands out a token. Covers the block itself, what it costs the person, and the way back.
 */
describe('account-blocking', () => {
  const email = `blocked-${Date.now()}@example.com`
  const password = '1234'

  let config: ServerConfig
  let adminSession: string
  let adminAccount: AccountUuid
  let userToken: string
  let userAccount: AccountUuid
  let wsUuid: WorkspaceUuid
  let wsUrl: string

  beforeAll(async () => {
    config = await loadServerConfig(STAND_URL)
    const login = await rpc(config, undefined, 'login', { email: 'admin', password })
    expect(login.error).toBeUndefined()
    adminAccount = login.result.account
    const session = await rpc(config, login.result.token, 'verifyAdminSession', { otpCode: DEV_OTP })
    expect(session.error).toBeUndefined()
    adminSession = session.result.token
  }, 60000)

  async function adminOp (method: string, params: Record<string, any>): Promise<any> {
    await rpc(config, adminSession, 'requestAdminOperationOtp', {})
    return await rpc(config, adminSession, method, { ...params, otpCode: DEV_OTP })
  }

  async function setBlocked (blocked: boolean): Promise<any> {
    return await adminOp('adminSetAccountBlocked', { accountUuid: userAccount, blocked })
  }

  async function accountRow (filter: Record<string, any> = {}): Promise<any> {
    const res = await rpc(config, adminSession, 'listAccounts', { search: email, limit: 10, filter })
    return res.result?.find((it: any) => it.uuid === userAccount)
  }

  async function auditActions (action: string): Promise<any[]> {
    const res = await rpc(config, adminSession, 'listAdminActions', { action, limit: 50 })
    return res.result?.actions ?? []
  }

  async function waitMode (uuid: WorkspaceUuid, mode: string, timeoutMs = 180000): Promise<void> {
    const until = Date.now() + timeoutMs
    let last: string | undefined
    while (Date.now() < until) {
      const res = await rpc(config, adminSession, 'listWorkspaces', {})
      last = res.result?.find((it: any) => it.uuid === uuid)?.status?.mode
      if (last === mode) return
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
    throw new Error(`workspace ${uuid} never reached mode '${mode}', last: ${last}`)
  }

  it('signs up a person with a workspace of their own', async () => {
    const signedUp = await rpc(config, undefined, 'signUp', { email, password, firstName: 'Block', lastName: 'Me' })
    expect(signedUp.error).toBeUndefined()
    userToken = signedUp.result.token
    userAccount = signedUp.result.account

    const created = await rpc(config, userToken, 'createWorkspace', { workspaceName: `blocked-${Date.now()}` })
    expect(created.error).toBeUndefined()
    wsUuid = created.result.workspace
    wsUrl = created.result.workspaceUrl
    await waitMode(wsUuid, 'active')

    // The workspace opens before the block - that is what makes the refusal below meaningful.
    const selected = await rpc(config, userToken, 'selectWorkspace', { workspaceUrl: wsUrl, kind: 'external' })
    expect(selected.error).toBeUndefined()
  }, 240000)

  it('blocks the account and writes it to the audit trail', async () => {
    const res = await setBlocked(true)
    expect(res.error).toBeUndefined()

    const row = await accountRow()
    expect(row.blockedOn).toBeGreaterThan(0)

    const entry = (await auditActions('block_account')).find((a) => a.target === userAccount)
    expect(entry).toBeDefined()
    expect(entry.actorEmail).toEqual('admin')
  }, 60000)

  it('refuses the password login of a blocked account', async () => {
    const relogin = await rpc(config, undefined, 'login', { email, password })
    expect(isRefused(relogin)).toBe(true)
    expect(statusCode(relogin)).toEqual('platform:status:AccountBlocked')
  }, 60000)

  it('closes the door on a session that was already open', async () => {
    // The token from the sign up is still valid - the block has to be caught on the way in.
    const selected = await rpc(config, userToken, 'selectWorkspace', { workspaceUrl: wsUrl, kind: 'external' })
    expect(statusCode(selected)).toEqual('platform:status:AccountBlocked')
  }, 60000)

  it('leaves the workspace itself alone: blocking is not deleting', async () => {
    const res = await rpc(config, adminSession, 'listWorkspaces', {})
    const status = res.result?.find((it: any) => it.uuid === wsUuid)?.status
    expect(status.mode).toEqual('active')
    expect(status.deleteOn ?? null).toBeNull()
  }, 60000)

  it('finds blocked accounts through the admin filter', async () => {
    expect(await accountRow({ blockedOnly: true })).toBeDefined()

    const others = await rpc(config, adminSession, 'listAccounts', {
      search: 'admin',
      limit: 10,
      filter: { blockedOnly: true }
    })
    expect((others.result ?? []).some((it: any) => it.uuid === adminAccount)).toBe(false)
  }, 60000)

  it('refuses an admin who tries to block themselves', async () => {
    const res = await adminOp('adminSetAccountBlocked', { accountUuid: adminAccount, blocked: true })
    expect(isForbidden(res)).toBe(true)
  }, 60000)

  it('is admin-only', async () => {
    const res = await rpc(config, userToken, 'adminSetAccountBlocked', {
      accountUuid: adminAccount,
      blocked: true,
      otpCode: DEV_OTP
    })
    expect(isRefused(res)).toBe(true)
  }, 60000)

  it('lets the person back in once the block is lifted', async () => {
    const res = await setBlocked(false)
    expect(res.error).toBeUndefined()

    const row = await accountRow()
    expect(row.blockedOn ?? null).toBeNull()

    const relogin = await rpc(config, undefined, 'login', { email, password })
    expect(relogin.error).toBeUndefined()
    userToken = relogin.result.token

    const selected = await rpc(config, userToken, 'selectWorkspace', { workspaceUrl: wsUrl, kind: 'external' })
    expect(selected.error).toBeUndefined()

    const entry = (await auditActions('unblock_account')).find((a) => a.target === userAccount)
    expect(entry).toBeDefined()
  }, 120000)

  it('answers the deletion question about somebody else for an admin only', async () => {
    // The admin panel asks before spending an OTP on a deletion that would be refused anyway.
    const asAdmin = await rpc(config, adminSession, 'canDeleteAccount', { uuid: userAccount })
    expect(asAdmin.error).toBeUndefined()
    expect(asAdmin.result.canDelete).toBe(false)
    expect(asAdmin.result.ownedWorkspaces.map((it: any) => it.uuid)).toContain(wsUuid)

    const asStranger = await rpc(config, userToken, 'canDeleteAccount', { uuid: adminAccount })
    expect(isForbidden(asStranger)).toBe(true)
  }, 60000)

  it('tells an admin they cannot delete their own account', async () => {
    const own = await rpc(config, adminSession, 'canDeleteAccount', { uuid: adminAccount })
    expect(own.error).toBeUndefined()
    expect(own.result.canDelete).toBe(false)
    expect(own.result.ownedWorkspaces).toHaveLength(0)

    const attempt = await adminOp('deleteAccount', { uuid: adminAccount })
    expect(isForbidden(attempt)).toBe(true)
  }, 60000)

  it('publishes the deferral windows the warnings quote', async () => {
    const policy = await rpc(config, undefined, 'getDeletionPolicy', {})
    expect(policy.error).toBeUndefined()
    expect(policy.result.graceDays).toBeGreaterThan(0)
    expect(policy.result.readonlyDays).toBeGreaterThan(0)
    // The read-only window is the head of the deferral, never longer than the whole of it.
    expect(policy.result.readonlyDays).toBeLessThanOrEqual(policy.result.graceDays)
  }, 60000)
})
