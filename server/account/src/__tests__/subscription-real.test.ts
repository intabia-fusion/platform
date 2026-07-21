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
import { getDBClient, shutdownPostgres, type PostgresClientReference } from '@hcengineering/postgres'
import { generateToken } from '@hcengineering/server-token'
import { PostgresAccountDB } from '../collections/postgres/postgres'
import { getSubscriptionsByProvider, upsertSubscription } from '../serviceOperations'
import { SubscriptionStatus, SubscriptionType, type SubscriptionData } from '../types'
import { createAccount } from '../utils'

jest.setTimeout(90000)

describe('subscription-real', () => {
  const cockroachDB: string = process.env.DB_URL ?? 'postgresql://root@localhost:26258/defaultdb?sslmode=disable'

  let crDbUri = cockroachDB
  let adminClientCRRef: PostgresClientReference
  let dbUuid: string
  let crClient: PostgresClientReference
  let crAccount: PostgresAccountDB

  const ctx = new MeasureMetricsContext('test', {}, {}, newMetrics())
  const branding = null

  // payment service token (no workspace scope needed for these ops)
  const paymentToken = generateToken(systemAccountUuid, undefined, { service: 'payment' }, 'secret')

  let wsUuid: WorkspaceUuid
  const accountUuid = generateUuid() as AccountUuid

  beforeAll(() => {
    adminClientCRRef = getDBClient(cockroachDB)
  })

  afterAll(async () => {
    adminClientCRRef.close()
    await shutdownPostgres()
  })

  beforeEach(async () => {
    dbUuid = 'subdb' + Date.now().toString()
    crDbUri = cockroachDB.replace('/defaultdb', '/' + dbUuid)

    const adminClient = await adminClientCRRef.getClient()
    // Clean up leftover test DBs
    const existing = await adminClient`SELECT datname FROM pg_database WHERE datname LIKE 'subdb%'`
    for (const row of existing) {
      await adminClient`DROP DATABASE IF EXISTS ${adminClient(row.datname)} CASCADE`
    }
    await adminClient`CREATE DATABASE ${adminClient(dbUuid)}`

    crClient = getDBClient(crDbUri)
    const pgClient = await crClient.getClient()
    crAccount = new PostgresAccountDB(pgClient, dbUuid)

    // Migrate with retry
    let error = false
    do {
      try {
        await crAccount.init()
        error = false
      } catch (e) {
        console.error('init error, retrying', e)
        error = true
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    } while (error)

    // Create account required by subscription_account_fk
    await crAccount.person.insertOne({ uuid: accountUuid, firstName: 'Test', lastName: 'User' })
    await createAccount(crAccount, accountUuid, true)

    // Create a workspace for subscription tests
    wsUuid = await crAccount.createWorkspace(
      { url: 'sub-test-ws', name: 'Sub Test WS', allowGuestSignUp: true, allowReadOnlyGuest: true },
      { isDisabled: false, mode: 'active', versionMajor: 0, versionMinor: 7, versionPatch: 0 }
    )
  })

  afterEach(async () => {
    try {
      crClient.close()
      const adminClient = await adminClientCRRef.getClient()
      await adminClient`DROP DATABASE IF EXISTS ${adminClient(dbUuid)} CASCADE`
    } catch (err) {
      console.error('Cleanup error:', err)
    }
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
