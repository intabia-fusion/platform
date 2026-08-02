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

import {
  generateId,
  generateUuid,
  MeasureMetricsContext,
  newMetrics,
  systemAccountUuid,
  type AccountUuid,
  type WorkspaceUuid
} from '@hcengineering/core'
import { shutdownPostgres, type PostgresClientReference } from '@hcengineering/postgres'
import { generateToken } from '@hcengineering/server-token'
import { type PostgresAccountDB } from '../collections/postgres/postgres'
import { getSubscriptionsByProvider, upsertSubscription } from '../serviceOperations'
import { SubscriptionStatus, SubscriptionType, type SubscriptionData } from '../types'
import { createAccount } from '../utils'
import { clearTables, openRealDb, realDbFlavors } from './realDbFlavors'

jest.setTimeout(90000)

// Rows the tests themselves write.
const DIRTY_TABLES = ['subscription']
// Fixtures seeded once in beforeAll — cleared at startup, since the database outlives the run.
// Children before parents: social_id/account_events/user_profile all reference person, and the
// database is shared with the other real-db suites, so leftovers of theirs must go too.
const FIXTURE_TABLES = [
  'workspace_members',
  'workspace_status',
  'workspace',
  'social_id',
  'account_events',
  'user_profile',
  'account_passwords',
  'account',
  'person'
]

describe.each(realDbFlavors)('subscription-real [$flavor]', ({ flavor: dbFlavor, adminUri, dbUri }) => {
  let dbUuid: string
  let crClient: PostgresClientReference
  let crAccount: PostgresAccountDB

  const ctx = new MeasureMetricsContext('test', {}, {}, newMetrics())
  const branding = null

  // payment service token (no workspace scope needed for these ops)
  const paymentToken = generateToken(systemAccountUuid, undefined, { service: 'payment' }, 'secret')

  let wsUuid: WorkspaceUuid
  const accountUuid = generateUuid() as AccountUuid

  // One reused database per flavor: migrations run once (and are skipped on later runs), and nothing
  // is ever dropped — a DROP DATABASE on cockroach queues a 300s GC job per call.
  beforeAll(async () => {
    const db = await openRealDb('subdb', { flavor: dbFlavor, adminUri, dbUri })
    dbUuid = db.dbUuid
    crClient = db.dbRef
    crAccount = db.account

    // The database survives previous runs, so drop their fixtures before seeding this one.
    await clearTables(crClient, dbUuid, [...DIRTY_TABLES, ...FIXTURE_TABLES])

    // Create account required by subscription_account_fk
    await crAccount.person.insertOne({ uuid: accountUuid, firstName: 'Test', lastName: 'User' })
    await createAccount(crAccount, accountUuid, true)

    // Create a workspace for subscription tests
    wsUuid = await crAccount.createWorkspace(
      { url: 'sub-test-ws', name: 'Sub Test WS', allowGuestSignUp: true, allowReadOnlyGuest: true },
      { isDisabled: false, mode: 'active', versionMajor: 0, versionMinor: 7, versionPatch: 0 }
    )
  })

  afterAll(async () => {
    crClient.close()
    await shutdownPostgres()
  })

  beforeEach(async () => {
    await clearTables(crClient, dbUuid, DIRTY_TABLES)
  })

  function makeSub (overrides: Partial<SubscriptionData> & { providerSubscriptionId: string }): SubscriptionData {
    return {
      id: generateId(),
      workspaceUuid: wsUuid,
      accountUuid,
      provider: 'tbank',
      type: SubscriptionType.Package,
      status: SubscriptionStatus.Active,
      plan: 'storage-100gb',
      ...overrides
    }
  }

  describe('getSubscriptionsByProvider', () => {
    it('default statuses filter: active+pastdue, excludes canceled and other providers', async () => {
      await upsertSubscription(
        ctx,
        crAccount,
        branding,
        paymentToken,
        makeSub({
          providerSubscriptionId: 'p-tbank-active',
          provider: 'tbank',
          status: SubscriptionStatus.Active
        })
      )
      await upsertSubscription(
        ctx,
        crAccount,
        branding,
        paymentToken,
        makeSub({
          providerSubscriptionId: 'p-tbank-canceled',
          provider: 'tbank',
          status: SubscriptionStatus.Canceled
        })
      )
      await upsertSubscription(
        ctx,
        crAccount,
        branding,
        paymentToken,
        makeSub({
          providerSubscriptionId: 'p-stripe-active',
          provider: 'stripe',
          status: SubscriptionStatus.Active
        })
      )

      const result = await getSubscriptionsByProvider(ctx, crAccount, branding, paymentToken, { provider: 'tbank' })

      expect(result).toHaveLength(1)
      expect(result[0].providerSubscriptionId).toBe('p-tbank-active')
      expect(result[0].status).toBe(SubscriptionStatus.Active)
    })

    it('explicit statuses: returns tbank active+canceled, excludes stripe', async () => {
      await upsertSubscription(
        ctx,
        crAccount,
        branding,
        paymentToken,
        makeSub({
          providerSubscriptionId: 'p-tbank-active2',
          provider: 'tbank',
          status: SubscriptionStatus.Active
        })
      )
      await upsertSubscription(
        ctx,
        crAccount,
        branding,
        paymentToken,
        makeSub({
          providerSubscriptionId: 'p-tbank-canceled2',
          provider: 'tbank',
          status: SubscriptionStatus.Canceled
        })
      )
      await upsertSubscription(
        ctx,
        crAccount,
        branding,
        paymentToken,
        makeSub({
          providerSubscriptionId: 'p-stripe-active2',
          provider: 'stripe',
          status: SubscriptionStatus.Active
        })
      )

      const result = await getSubscriptionsByProvider(ctx, crAccount, branding, paymentToken, {
        provider: 'tbank',
        statuses: [SubscriptionStatus.Active, SubscriptionStatus.PastDue, SubscriptionStatus.Canceled]
      })

      expect(result).toHaveLength(2)
      const ids = result.map((r) => r.providerSubscriptionId).sort()
      expect(ids).toEqual(['p-tbank-active2', 'p-tbank-canceled2'].sort())
    })
  })

  describe('upsertSubscription stale-write guard', () => {
    it('skips write when incoming modifiedAt is older than stored', async () => {
      // Initial write: modifiedAt=1000, Active
      await upsertSubscription(
        ctx,
        crAccount,
        branding,
        paymentToken,
        makeSub({
          providerSubscriptionId: 'p1',
          provider: 'tbank',
          status: SubscriptionStatus.Active,
          providerData: { modifiedAt: 1000 }
        })
      )

      let stored = await crAccount.subscription.findOne({ provider: 'tbank', providerSubscriptionId: 'p1' })
      expect(stored).not.toBeNull()
      expect(stored?.status).toBe(SubscriptionStatus.Active)

      // Stale write: modifiedAt=500 < 1000 -> should be skipped
      await upsertSubscription(
        ctx,
        crAccount,
        branding,
        paymentToken,
        makeSub({
          providerSubscriptionId: 'p1',
          provider: 'tbank',
          status: SubscriptionStatus.Canceled,
          providerData: { modifiedAt: 500 }
        })
      )

      stored = await crAccount.subscription.findOne({ provider: 'tbank', providerSubscriptionId: 'p1' })
      expect(stored?.status).toBe(SubscriptionStatus.Active) // still Active, guard blocked the update

      // Newer write: modifiedAt=2000 > 1000 -> should succeed
      await upsertSubscription(
        ctx,
        crAccount,
        branding,
        paymentToken,
        makeSub({
          providerSubscriptionId: 'p1',
          provider: 'tbank',
          status: SubscriptionStatus.Canceled,
          providerData: { modifiedAt: 2000 }
        })
      )

      stored = await crAccount.subscription.findOne({ provider: 'tbank', providerSubscriptionId: 'p1' })
      expect(stored?.status).toBe(SubscriptionStatus.Canceled) // updated
    })
  })
})
