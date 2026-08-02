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

import { getWorkspaceToken, loadServerConfig, type ServerConfig, type WorkspaceToken } from '@hcengineering/api-client'
import { AccountRole, systemAccountUuid } from '@hcengineering/core'
import { type AccountClient, getClient as getAccountClient } from '@hcengineering/account-client'
import { generateToken } from '@hcengineering/server-token'

// Admin sensitive ops are OTP-gated on the server. In dev the stand sets ADMIN_OTP_DEV_CODE=000000,
// so a fixed code is accepted and no email is sent. These tests assert the gate: wrong/empty code
// is rejected, the dev code succeeds. Uses adminUpdateWorkspaceRole (reversible) as the probe.
describe('admin-otp', () => {
  const wsName = 'api-tests'
  const devCode = '000000'
  let config: ServerConfig
  let owner: WorkspaceToken
  let member: WorkspaceToken
  let admin: AccountClient

  beforeAll(async () => {
    config = await loadServerConfig('http://localhost:8083')
    owner = await login('user1')
    member = await login('user2')
    const adminToken = generateToken(systemAccountUuid, owner.workspaceId, { admin: 'true' }, 'secret')
    admin = getAccountClient(config.ACCOUNTS_URL, adminToken)
  }, 30000)

  async function login (email: string): Promise<WorkspaceToken> {
    return await getWorkspaceToken('http://localhost:8083', { email, password: '1234', workspace: wsName }, config)
  }

  it('rejects role change with an empty OTP code', async () => {
    await expect(
      admin.adminUpdateWorkspaceRole(owner.workspaceId, member.info.account, AccountRole.Maintainer, '')
    ).rejects.toThrow()
  })

  it('rejects role change with a wrong OTP code', async () => {
    await expect(
      admin.adminUpdateWorkspaceRole(owner.workspaceId, member.info.account, AccountRole.Maintainer, '999999')
    ).rejects.toThrow()
  })

  it('accepts role change with the dev OTP code and reverts', async () => {
    // Flip user2 to Maintainer with the dev code, then back to User. Both calls carry the code.
    await admin.adminUpdateWorkspaceRole(owner.workspaceId, member.info.account, AccountRole.Maintainer, devCode)
    await admin.adminUpdateWorkspaceRole(owner.workspaceId, member.info.account, AccountRole.User, devCode)
  })

  it('requestAdminOperationOtp returns without emailing in dev', async () => {
    const info = await admin.requestAdminOperationOtp()
    expect(info.sent).toBe(true)
  })
})
