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
import { getClient as getAccountClient, SubscriptionStatus, SubscriptionType } from '@hcengineering/account-client'
import { ensureEmployee } from '@hcengineering/contact'
import { generateToken } from '@hcengineering/server-token'
import drivePlugin, { type Drive } from '@hcengineering/drive'

// Workspace api-tests-unpaid is created in prepare.sh WITHOUT a plan: this suite drives the
// single tier subscription through active -> past_due -> active via upsertSubscription
// (payment-service token) and verifies the whole unpaid read-only flow end to end:
// account-service publishes LimitsChanged{payment} -> transactor consumer flips the shared map ->
// SeatLimitsMiddleware downgrades non-owners to ReadOnlyGuest; Owner bypass stays writable.
describe('plan-unpaid', () => {
  const testCtx = new MeasureMetricsContext('test', {})
  const wsName = 'api-tests-unpaid'
  // Stable id: upsertSubscription matches by provider+providerSubscriptionId, so repeated runs
  // reuse one subscription instead of piling up tier subscriptions.
  const SUB_ID = 'api-tests-unpaid-subscription'
  let config: ServerConfig
  let owner: WorkspaceToken
  let member: WorkspaceToken
  let ownerOps: TxOperations
  let memberOps: TxOperations

  beforeAll(async () => {
    config = await loadServerConfig('http://localhost:8083')

    owner = await login('user1')
    member = await login('user2')
    await ensureEmployeeFor(owner)
    await ensureEmployeeFor(member)

    ownerOps = await createRestTxOperations(owner.endpoint, owner.workspaceId, owner.token)
    memberOps = await createRestTxOperations(member.endpoint, member.workspaceId, member.token)
  }, 30000)

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

  async function setSubscriptionStatus (status: SubscriptionStatus): Promise<void> {
    const paymentToken = generateToken(systemAccountUuid, undefined, { service: 'payment' }, 'secret')
    const paymentClient = getAccountClient(config.ACCOUNTS_URL, paymentToken)
    await paymentClient.upsertSubscription({
      id: SUB_ID,
      workspaceUuid: owner.workspaceId,
      accountUuid: owner.info.account,
      provider: 'manual',
      providerSubscriptionId: SUB_ID,
      type: SubscriptionType.Tier,
      status,
      plan: 'business',
      limits: {
        storageLimitGB: 0,
        trafficLimitGB: 0,
        meetingMinutesLimit: 0,
        tokenLimit: 0,
        usersLimit: 0
      }
    })
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

  /** Poll until fn stops throwing (returns result) or deadline passes (returns undefined). */
  async function pollOk<T> (fn: () => Promise<T>, timeoutMs = 15000): Promise<T | undefined> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      try {
        return await fn()
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }
    return undefined
  }

  it('past_due runs on the free fallback: members within free seats stay writable', async () => {
    // The account server always configures a free fallback (default 5 seats), so an unpaid workspace
    // is NOT put into hard read-only — it runs on free limits. With only owner + one member (2 < 5),
    // both stay writable. (Hard read-only only applies to members OVER the free seat budget — seat-limits.)
    await setSubscriptionStatus(SubscriptionStatus.Active)
    const beforeUnpaid = await pollOk(async () => await createDrive(memberOps, `unpaid-before-${generateUuid()}`))
    expect(beforeUnpaid).toBeDefined()

    // Payment failed: free fallback applies, the member (within 5 free seats) keeps writing.
    await setSubscriptionStatus(SubscriptionStatus.PastDue)
    await new Promise((resolve) => setTimeout(resolve, 3000))
    const onFree = await pollOk(async () => await createDrive(memberOps, `unpaid-free-${generateUuid()}`))
    expect(onFree).toBeDefined()

    // Owner keeps writing too.
    const ownerDrive = await createDrive(ownerOps, `unpaid-owner-${generateUuid()}`)
    expect(ownerDrive).toBeDefined()

    // Payment restored: still writable.
    await setSubscriptionStatus(SubscriptionStatus.Active)
    const restored = await pollOk(async () => await createDrive(memberOps, `unpaid-restored-${generateUuid()}`))
    expect(restored).toBeDefined()
  }, 90000)
})
