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

import {
  createRestClient,
  createRestTxOperations,
  getWorkspaceToken,
  loadServerConfig,
  type RestClient,
  type ServerConfig,
  type WorkspaceToken
} from '@hcengineering/api-client'
import core, {
  generateUuid,
  MeasureMetricsContext,
  pickPrimarySocialId,
  systemAccountUuid,
  type Ref,
  type SocialId,
  type TxOperations
} from '@hcengineering/core'
import { getClient as getAccountClient } from '@hcengineering/account-client'
import contact, { type Person, ensureEmployee } from '@hcengineering/contact'
import { generateToken } from '@hcengineering/server-token'
import drivePlugin, { type Drive } from '@hcengineering/drive'

// Workspace api-tests-seats is unlimited at boot so user1(OWNER)/user2/user3 all onboard
// (create their own Employee). The test then sets usersLimit=2: seats go by role priority
// (Owner first), then createdOn -> owner + user2 are seated; user3 is downgraded to
// ReadOnlyGuest. Asserts seat enforcement reacts to a runtime plan change.
describe('plan-seats', () => {
  const testCtx = new MeasureMetricsContext('test', {})
  const wsName = 'api-tests-seats'
  let config: ServerConfig
  let owner: WorkspaceToken
  let seated: WorkspaceToken
  let seatless: WorkspaceToken
  let ownerOps: TxOperations
  let seatedOps: TxOperations
  let seatlessOps: TxOperations

  beforeAll(async () => {
    config = await loadServerConfig('http://localhost:8083')

    // Onboard all members while the plan is unlimited. Employee.createdOn order (user2 before
    // user3) decides the seat winner once the limit is applied.
    owner = await login('user1')
    await ensureEmployeeFor(owner)
    seated = await login('user2')
    await ensureEmployeeFor(seated)
    seatless = await login('user3')
    await ensureEmployeeFor(seatless)

    ownerOps = await createRestTxOperations(owner.endpoint, owner.workspaceId, owner.token)
    seatedOps = await createRestTxOperations(seated.endpoint, seated.workspaceId, seated.token)
    seatlessOps = await createRestTxOperations(seatless.endpoint, seatless.workspaceId, seatless.token)
  }, 30000)

  async function setUsersLimit (usersLimit: number): Promise<void> {
    const adminToken = generateToken(systemAccountUuid, owner.workspaceId, { admin: 'true' }, 'secret')
    const adminClient = getAccountClient(config.ACCOUNTS_URL, adminToken)
    await adminClient.adminCreateSubscription({
      workspaceUuid: owner.workspaceId,
      plan: 'business',
      limits: {
        usersLimit,
        storageLimitGB: 0,
        trafficLimitGB: 0,
        tokenLimit: 0,
        meetingMinutesLimit: 0
      }
    })
  }

  async function login (email: string): Promise<WorkspaceToken> {
    return await getWorkspaceToken('http://localhost:8083', { email, password: '1234', workspace: wsName }, config)
  }

  async function ensureEmployeeFor (ws: WorkspaceToken): Promise<void> {
    const accountClient = getAccountClient(config.ACCOUNTS_URL, ws.token)
    const person = await accountClient.getPerson()
    const socialIds: SocialId[] = await accountClient.getSocialIds(true)
    await ensureEmployee(
      testCtx,
      {
        uuid: ws.info.account,
        role: ws.info.role,
        primarySocialId: pickPrimarySocialId(socialIds)._id,
        socialIds: socialIds.map((si) => si._id),
        fullSocialIds: socialIds
      },
      connect(ws),
      socialIds,
      async () => person
    )
  }

  function connect (ws: WorkspaceToken): RestClient {
    return createRestClient(ws.endpoint, ws.workspaceId, ws.token)
  }

  async function createDrive (ops: TxOperations, name: string): Promise<Ref<Drive>> {
    return await ops.createDoc(drivePlugin.class.Drive, core.space.Space, {
      name,
      description: '',
      private: false,
      archived: false,
      members: [],
      owners: [],
      autoJoin: false,
      restricted: false,
      type: drivePlugin.spaceType.DefaultDrive
    })
  }

  // Mirror the UI "+Employee": create a Person, then the active Employee mixin. The mixin
  // is what SeatLimitsMiddleware blocks once active-employee count reaches usersLimit.
  async function createNewEmployee (ops: TxOperations, name: string): Promise<void> {
    const personRef = await ops.createDoc(contact.class.Person, contact.space.Contacts, {
      name,
      city: '',
      avatarType: 'color'
    } as any)
    await ops.createMixin<Person, any>(
      personRef,
      contact.class.Person,
      contact.space.Contacts,
      contact.mixin.Employee,
      {
        active: true
      }
    )
  }

  /** Poll until fn starts throwing (returns true) or deadline passes (returns false). */
  async function pollRejected (fn: () => Promise<unknown>, timeoutMs = 15000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      try {
        await fn()
        await new Promise((resolve) => setTimeout(resolve, 500))
      } catch {
        return true
      }
    }
    return false
  }

  it('usersLimit=2 keeps the earliest member seated, last member is read-only', async () => {
    try {
      await setUsersLimit(2)

      // Seatless member (user3) is downgraded once the limit propagates.
      const blocked = await pollRejected(async () => await createDrive(seatlessOps, `seats-blocked-${generateUuid()}`))
      expect(blocked).toBe(true)

      // Seated member (user2) still writes.
      const ok = await createDrive(seatedOps, `seats-ok-${generateUuid()}`)
      expect(ok).toBeDefined()

      // Reads keep working for the seatless member.
      const spaces = await seatlessOps.findAll(core.class.Space, {})
      expect(spaces.length).toBeGreaterThan(0)
    } finally {
      // Restore unlimited so repeated runs start clean.
      await setUsersLimit(0)
    }
  }, 60000)

  it('seatless write is rejected fast and not retried', async () => {
    // A seatless member's write must fail with a 403 that the REST client does NOT retry —
    // otherwise it spams the transactor with 3x exponential backoff on every write.
    try {
      await setUsersLimit(1) // owner takes the only slot -> user3 seatless

      // Wait until the limit propagates and writes start failing.
      const blocked = await pollRejected(async () => await createDrive(seatlessOps, `noretry-wait-${generateUuid()}`))
      expect(blocked).toBe(true)

      // Measure a single rejection: a retried 403 would burn ~700ms of backoff sleeps.
      const start = Date.now()
      let rejected = false
      try {
        await createDrive(seatlessOps, `noretry-measure-${generateUuid()}`)
      } catch {
        rejected = true
      }
      const elapsed = Date.now() - start
      expect(rejected).toBe(true)
      expect(elapsed).toBeLessThan(600)
    } finally {
      await setUsersLimit(0)
    }
  }, 60000)

  it('creating a new active employee past usersLimit is rejected', async () => {
    // Hard-block: with 3 active employees (user1/2/3) and usersLimit=1, the owner must not be
    // able to add a NEW employee. Existing over-limit ones stay (downgrade), only new ones fail.
    try {
      await setUsersLimit(1)

      const blocked = await pollRejected(async () => {
        await createNewEmployee(ownerOps, `seat-overflow-${generateUuid()}`)
      })
      expect(blocked).toBe(true)
    } finally {
      await setUsersLimit(0)
    }
  }, 60000)

  it('after lifting the limit a new employee can be created again', async () => {
    // Sanity: once usersLimit is raised the block goes away (live plan refresh, no restart).
    try {
      await setUsersLimit(1)
      const blocked = await pollRejected(async () => {
        await createNewEmployee(ownerOps, `seat-pre-${generateUuid()}`)
      })
      expect(blocked).toBe(true)

      await setUsersLimit(0) // unlimited
      // Poll until creation succeeds (plan event propagates async).
      const deadline = Date.now() + 20000
      let ok = false
      while (Date.now() < deadline && !ok) {
        try {
          await createNewEmployee(ownerOps, `seat-after-${generateUuid()}`)
          ok = true
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
      }
      expect(ok).toBe(true)
    } finally {
      await setUsersLimit(0)
    }
  }, 60000)
})
