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

import { generateId, generateUuid, systemAccountUuid, type AccountUuid, type WorkspaceUuid } from '@hcengineering/core'
import { getDBClient, shutdownPostgres, type PostgresClientReference } from '@hcengineering/postgres'
import { generateToken } from '@hcengineering/server-token'
import { PostgresAccountDB } from '../collections/postgres/postgres'
import { SubscriptionStatus, SubscriptionType } from '../types'
import { createAccount } from '../utils'

jest.setTimeout(90000)

describe('payment-intent-real', () => {
  const cockroachDB: string = process.env.DB_URL ?? 'postgresql://root@localhost:26258/defaultdb?sslmode=disable'

  let crDbUri = cockroachDB
  let adminClientCRRef: PostgresClientReference
  let dbUuid: string
  let crClient: PostgresClientReference
  let crAccount: PostgresAccountDB

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _paymentToken = generateToken(systemAccountUuid, undefined, { service: 'payment' }, 'secret')

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
    dbUuid = 'pidb' + Date.now().toString()
    crDbUri = cockroachDB.replace('/defaultdb', '/' + dbUuid)

    const adminClient = await adminClientCRRef.getClient()
    const existing = await adminClient`SELECT datname FROM pg_database WHERE datname LIKE 'pidb%'`
    for (const row of existing) {
      await adminClient`DROP DATABASE IF EXISTS ${adminClient(row.datname)} CASCADE`
    }
    await adminClient`CREATE DATABASE ${adminClient(dbUuid)}`

    crClient = getDBClient(crDbUri)
    const pgClient = await crClient.getClient()
    crAccount = new PostgresAccountDB(pgClient, dbUuid)

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

    await crAccount.person.insertOne({ uuid: accountUuid, firstName: 'Test', lastName: 'User' })
    await createAccount(crAccount, accountUuid, true)

    wsUuid = await crAccount.createWorkspace(
      { url: 'pi-test-ws', name: 'PI Test WS', allowGuestSignUp: true, allowReadOnlyGuest: true },
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

  async function createSubscription (): Promise<string> {
    const subId = generateId()
    const now = Date.now()
    await crAccount.subscription.insertOne({
      id: subId,
      workspaceUuid: wsUuid,
      accountUuid,
      provider: 'tbank',
      providerSubscriptionId: 'psi-' + subId,
      type: SubscriptionType.Tier,
      status: SubscriptionStatus.Active,
      plan: 'tier-pro',
      createdOn: now,
      updatedOn: now
    })
    return subId
  }

  describe('A: atomic dedup via ON CONFLICT DO NOTHING', () => {
    it('same period -> second claim returns claimed=false with same intent', async () => {
      const subId = await createSubscription()
      const periodEnd = Date.now() + 30 * 24 * 3600 * 1000

      const r1 = await crAccount.claimChargeIntent(subId, periodEnd, 'tbank', 29900)
      expect(r1.claimed).toBe(true)
      expect(r1.intent.status).toBe('pending')
      expect(r1.intent.subscriptionId).toBe(subId)

      const r2 = await crAccount.claimChargeIntent(subId, periodEnd, 'tbank', 29900)
      expect(r2.claimed).toBe(false)
      expect(r2.intent.id).toBe(r1.intent.id)
      expect(r2.intent.status).toBe('pending')
    })

    it('different periodEnd -> new claim succeeds', async () => {
      const subId = await createSubscription()
      const P1 = Date.now() + 30 * 24 * 3600 * 1000
      const P2 = P1 + 30 * 24 * 3600 * 1000

      const r1 = await crAccount.claimChargeIntent(subId, P1, 'tbank', 29900)
      expect(r1.claimed).toBe(true)

      const r3 = await crAccount.claimChargeIntent(subId, P2, 'tbank', 29900)
      expect(r3.claimed).toBe(true)
      expect(r3.intent.id).not.toBe(r1.intent.id)
    })
  })

  describe('B: concurrent claim - exactly one pod wins', () => {
    it('two parallel claims for same period: exactly one claimed=true', async () => {
      const subId = await createSubscription()
      const periodEnd = Date.now() + 30 * 24 * 3600 * 1000

      const results = await Promise.all([
        crAccount.claimChargeIntent(subId, periodEnd, 'tbank', 29900),
        crAccount.claimChargeIntent(subId, periodEnd, 'tbank', 29900)
      ])

      const winners = results.filter((r) => r.claimed)
      const losers = results.filter((r) => !r.claimed)

      expect(winners).toHaveLength(1)
      expect(losers).toHaveLength(1)
      // Both see the same intent id
      expect(results[0].intent.id).toBe(results[1].intent.id)
    })
  })

  describe('C: markChargeIntent - post-charge repeat claim skips gracefully', () => {
    it('after intent charged, repeat claim returns claimed=false with status=charged', async () => {
      const subId = await createSubscription()
      const periodEnd = Date.now() + 30 * 24 * 3600 * 1000

      const r1 = await crAccount.claimChargeIntent(subId, periodEnd, 'tbank', 29900)
      expect(r1.claimed).toBe(true)
      const intentId = r1.intent.id

      // Mark as charged (direct collection update, no token needed)
      await crAccount.paymentIntent.update(
        { id: intentId },
        { status: 'charged', paymentId: 'pay123', updatedOn: Date.now() }
      )

      const stored = await crAccount.paymentIntent.findOne({ id: intentId })
      expect(stored?.status).toBe('charged')
      expect(stored?.paymentId).toBe('pay123')

      // Repeat claim for same period: another pod sees already charged -> skip
      const r2 = await crAccount.claimChargeIntent(subId, periodEnd, 'tbank', 29900)
      expect(r2.claimed).toBe(false)
      expect(r2.intent.id).toBe(intentId)
      expect(r2.intent.status).toBe('charged')
    })
  })

  describe('D: heartbeat updates heartbeat_at', () => {
    it('heartbeatChargeIntent advances heartbeat_at by DB clock', async () => {
      const subId = await createSubscription()
      const periodEnd = Date.now() + 30 * 24 * 3600 * 1000

      const r1 = await crAccount.claimChargeIntent(subId, periodEnd, 'tbank', 29900)
      expect(r1.claimed).toBe(true)
      const intentId = r1.intent.id

      const before = await crAccount.paymentIntent.findOne({ id: intentId })
      const heartbeatAt1 = before?.heartbeatAt as number
      expect(heartbeatAt1).toBeDefined()

      await new Promise((resolve) => setTimeout(resolve, 50))

      await crAccount.heartbeatChargeIntent(intentId)

      const after = await crAccount.paymentIntent.findOne({ id: intentId })
      const heartbeatAt2 = after?.heartbeatAt as number
      expect(heartbeatAt2).toBeDefined()

      expect(heartbeatAt2).toBeGreaterThan(heartbeatAt1)
    })
  })

  describe('E: reclaim does not fire on fresh lease', () => {
    it('reclaimStaleChargeIntent returns false when heartbeat is recent', async () => {
      const subId = await createSubscription()
      const periodEnd = Date.now() + 30 * 24 * 3600 * 1000

      const r1 = await crAccount.claimChargeIntent(subId, periodEnd, 'tbank', 29900)
      expect(r1.claimed).toBe(true)
      const intentId = r1.intent.id

      // leaseMs=100000 (100s) -- heartbeat is just set, far from stale
      const took = await crAccount.reclaimStaleChargeIntent(intentId, 100000)
      expect(took).toBe(false)

      const intent = await crAccount.paymentIntent.findOne({ id: intentId })
      expect(intent?.status).toBe('pending')
    })
  })

  describe('F: reclaim fires on stale lease', () => {
    it('reclaimStaleChargeIntent returns true when heartbeat is old', async () => {
      const subId = await createSubscription()
      const periodEnd = Date.now() + 30 * 24 * 3600 * 1000

      const r1 = await crAccount.claimChargeIntent(subId, periodEnd, 'tbank', 29900)
      expect(r1.claimed).toBe(true)
      const intentId = r1.intent.id

      // Age the heartbeat to 60s ago
      await crAccount.paymentIntent.update({ id: intentId }, { heartbeatAt: Date.now() - 60000 })

      // lease=10s, heartbeat=60s old -> stale
      const took = await crAccount.reclaimStaleChargeIntent(intentId, 10000)
      expect(took).toBe(true)
    })
  })

  describe('G: reclaim is atomic - exactly one pod wins', () => {
    it('two parallel reclaims on stale intent: exactly one returns true', async () => {
      const subId = await createSubscription()
      const periodEnd = Date.now() + 30 * 24 * 3600 * 1000

      const r1 = await crAccount.claimChargeIntent(subId, periodEnd, 'tbank', 29900)
      expect(r1.claimed).toBe(true)
      const intentId = r1.intent.id

      // Age the heartbeat to 60s ago
      await crAccount.paymentIntent.update({ id: intentId }, { heartbeatAt: Date.now() - 60000 })

      // Two pods race to reclaim the same stale intent
      const results = await Promise.all([
        crAccount.reclaimStaleChargeIntent(intentId, 10000),
        crAccount.reclaimStaleChargeIntent(intentId, 10000)
      ])

      const winners = results.filter(Boolean)
      expect(winners).toHaveLength(1)
    })
  })

  describe('H: reclaim does not touch charged intent', () => {
    it('reclaimStaleChargeIntent returns false for charged intent', async () => {
      const subId = await createSubscription()
      const periodEnd = Date.now() + 30 * 24 * 3600 * 1000

      const r1 = await crAccount.claimChargeIntent(subId, periodEnd, 'tbank', 29900)
      expect(r1.claimed).toBe(true)
      const intentId = r1.intent.id

      // Mark charged
      await crAccount.paymentIntent.update({ id: intentId }, { status: 'charged', updatedOn: Date.now() })

      // Age heartbeat (irrelevant since status != pending, but ensures WHERE status='pending' is the blocker)
      await crAccount.paymentIntent.update({ id: intentId }, { heartbeatAt: Date.now() - 60000 })

      const took = await crAccount.reclaimStaleChargeIntent(intentId, 10000)
      expect(took).toBe(false)

      const intent = await crAccount.paymentIntent.findOne({ id: intentId })
      expect(intent?.status).toBe('charged')
    })
  })
})
