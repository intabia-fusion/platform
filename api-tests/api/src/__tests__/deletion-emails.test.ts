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

import { clearMail, DEV_OTP, mailBody, rpc, STAND_URL, waitForMail } from './admin.fixtures'

/**
 * Deletion is announced by email: the owners of a workspace and the person behind an account get
 * told what happens and by when. The stand delivers into mailpit, so the text can be read back.
 */
describe('deletion-emails', () => {
  const stamp = Date.now()
  const email = `mail-owner-${stamp}@example.com`
  const password = '1234'

  let config: ServerConfig
  let adminSession: string
  let userToken: string
  let userAccount: AccountUuid
  let wsUuid: WorkspaceUuid
  let workspaceUrl: string

  beforeAll(async () => {
    config = await loadServerConfig(STAND_URL)
    const login = await rpc(config, undefined, 'login', { email: 'admin', password })
    expect(login.error).toBeUndefined()
    const session = await rpc(config, login.result.token, 'verifyAdminSession', { otpCode: DEV_OTP })
    expect(session.error).toBeUndefined()
    adminSession = session.result.token
  }, 60000)

  async function adminOp (method: string, params: Record<string, any>): Promise<any> {
    await rpc(config, adminSession, 'requestAdminOperationOtp', {})
    return await rpc(config, adminSession, method, { ...params, otpCode: DEV_OTP })
  }

  async function waitMode (mode: string, timeoutMs = 240000): Promise<void> {
    const until = Date.now() + timeoutMs
    let last: string | undefined
    while (Date.now() < until) {
      const res = await rpc(config, adminSession, 'listWorkspaces', { isDisabled: null })
      last = res.result?.find((it: any) => it.uuid === wsUuid)?.status?.mode
      if (last === mode) return
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
    throw new Error(`workspace never reached mode '${mode}', last: ${last}`)
  }

  it('signs up an owner with a workspace', async () => {
    const signedUp = await rpc(config, undefined, 'signUp', { email, password, firstName: 'Mail', lastName: 'Owner' })
    expect(signedUp.error).toBeUndefined()
    userToken = signedUp.result.token
    userAccount = signedUp.result.account

    const created = await rpc(config, userToken, 'createWorkspace', { workspaceName: `mail-${stamp}` })
    expect(created.error).toBeUndefined()
    wsUuid = created.result.workspace
    workspaceUrl = created.result.workspaceUrl
    await waitMode('active')
  }, 300000)

  it('tells the owner when the workspace is scheduled, with the deadline and a way back', async () => {
    await clearMail()

    const res = await adminOp('performWorkspaceOperation', { workspaceId: wsUuid, event: 'delete', params: [] })
    expect(res.error).toBeUndefined()

    const mail = await waitForMail(email)
    expect(mail).toBeDefined()
    expect(mail?.Subject).toContain('scheduled for deletion')

    const body = await mailBody(mail?.ID ?? '')
    // The deadline the row carries, and the page where an owner calls the deletion off.
    const status = (await rpc(config, adminSession, 'listWorkspaces', {})).result?.find(
      (it: any) => it.uuid === wsUuid
    )?.status
    // The account pod formats in its own zone, UTC on the stand; the host's zone is a day off at night.
    expect(body).toContain(new Date(status.deleteOn).toLocaleDateString('en', { timeZone: 'UTC' }))
    expect(body).toContain('/login/selectWorkspace')
  }, 120000)

  it('tells the owners when the deletion is called off', async () => {
    await clearMail()

    const cancelled = await adminOp('performWorkspaceOperation', {
      workspaceId: wsUuid,
      event: 'cancel-delete',
      params: []
    })
    expect(cancelled.error).toBeUndefined()

    const mail = await waitForMail(email)
    expect(mail).toBeDefined()
    expect(mail?.Subject).toContain('will not be deleted')
    expect(await mailBody(mail?.ID ?? '')).toContain('fully available again')
  }, 120000)

  it('tells the owners when one of them deletes the workspace themselves', async () => {
    await clearMail()

    const selected = await rpc(config, userToken, 'selectWorkspace', { workspaceUrl, kind: 'external' })
    expect(selected.error).toBeUndefined()
    const deleted = await rpc(config, selected.result.token, 'deleteWorkspace', { otpCode: DEV_OTP })
    expect(deleted.error).toBeUndefined()

    // Self-service deletion is always deferred - the letter carries the deadline and the way back.
    const mail = await waitForMail(email)
    expect(mail).toBeDefined()
    expect(mail?.Subject).toContain('scheduled for deletion')
    expect(await mailBody(mail?.ID ?? '')).toContain('/login/selectWorkspace')
  }, 120000)

  it('says nothing about calling it off when the workspace goes right away', async () => {
    await clearMail()
    const cancelled = await adminOp('performWorkspaceOperation', {
      workspaceId: wsUuid,
      event: 'cancel-delete',
      params: []
    })
    expect(cancelled.error).toBeUndefined()
    // The cancel letter lands asynchronously: cleared too early, it poses as the next one.
    expect((await waitForMail(email))?.Subject).toContain('will not be deleted')
    await clearMail()

    const res = await adminOp('performWorkspaceOperation', { workspaceId: wsUuid, event: 'delete-now', params: [] })
    expect(res.error).toBeUndefined()

    const mail = await waitForMail(email)
    expect(mail).toBeDefined()
    expect(mail?.Subject).toContain('is being deleted')

    const body = await mailBody(mail?.ID ?? '')
    expect(body).toContain('cannot be recovered')
    expect(body).not.toContain('/login/selectWorkspace')
  }, 120000)

  it('tells the person when their account is scheduled', async () => {
    await clearMail()

    const res = await adminOp('deleteAccount', { uuid: userAccount })
    expect(res.error).toBeUndefined()

    const mail = await waitForMail(email)
    expect(mail).toBeDefined()
    expect(mail?.Subject).toContain('account is scheduled for deletion')

    const body = await mailBody(mail?.ID ?? '')
    expect(body).toContain('/login/selectWorkspace')
  }, 120000)

  it('tells the person when they call the account deletion off', async () => {
    await clearMail()

    const res = await rpc(config, userToken, 'cancelAccountDeletion', {})
    expect(res.error).toBeUndefined()

    const mail = await waitForMail(email)
    expect(mail).toBeDefined()
    expect(mail?.Subject).toContain('account is active again')
    expect(await mailBody(mail?.ID ?? '')).toContain('Thank you for staying')
  }, 120000)
})
