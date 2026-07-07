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
import { SubscriptionStatus, SubscriptionType, type DBFlavor } from '../types'
import { createAccount } from '../utils'

jest.setTimeout(90000)

// Claim keys mirror the pod-tbank helpers: renew keys are dedup'd per subscription period,
// checkout keys per (workspace, plan type).
const renewKey = (subscriptionId: string, periodEnd: number): string => `renew:${subscriptionId}:${periodEnd}`
const checkoutKey = (workspaceUuid: string, type: string): string => `checkout:${workspaceUuid}:${type}`

describe('payment-intent-real', () => {
  const cockroachDB: string = process.env.DB_URL ?? 'postgresql://root@localhost:26258/defaultdb?sslmode=disable'
  // Flavor drives the migration SQL (cockroach vs postgres).
  const dbFlavor: DBFlavor = (process.env.DB_FLAVOR as DBFlavor | undefined) ?? 'cockroach'

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
      // CASCADE is cockroach-only; postgres has no CASCADE for DROP DATABASE.
      if (dbFlavor === 'cockroach') {
        await adminClient`DROP DATABASE IF EXISTS ${adminClient(row.datname)} CASCADE`
      } else {
        await adminClient`DROP DATABASE IF EXISTS ${adminClient(row.datname)}`
      }
    }
    await adminClient`CREATE DATABASE ${adminClient(dbUuid)}`

    crClient = getDBClient(crDbUri)
    const pgClient = await crClient.getClient()
    crAccount = new PostgresAccountDB(pgClient, dbUuid, dbFlavor)

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
      if (dbFlavor === 'cockroach') {
        await adminClient`DROP DATABASE IF EXISTS ${adminClient(dbUuid)} CASCADE`
      } else {
        await adminClient`DROP DATABASE IF EXISTS ${adminClient(dbUuid)}`
      }
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
    it('same claim key -> second claim returns claimed=false with same intent', async () => {
      const subId = await createSubscription()
      const periodEnd = Date.now() + 30 * 24 * 3600 * 1000
      const key = renewKey(subId, periodEnd)

      const r1 = await crAccount.claimIntent(key, 'tbank', { subscriptionId: subId, amount: 29900 })
      expect(r1.claimed).toBe(true)
      expect(r1.intent.status).toBe('pending')
      expect(r1.intent.claimKey).toBe(key)
      expect(r1.intent.subscriptionId).toBe(subId)

      const r2 = await crAccount.claimIntent(key, 'tbank', { subscriptionId: subId, amount: 29900 })
      expect(r2.claimed).toBe(false)
      expect(r2.intent.id).toBe(r1.intent.id)
      expect(r2.intent.status).toBe('pending')
    })

    it('different period -> new claim succeeds', async () => {
      const subId = await createSubscription()
      const P1 = Date.now() + 30 * 24 * 3600 * 1000
      const P2 = P1 + 30 * 24 * 3600 * 1000

      const r1 = await crAccount.claimIntent(renewKey(subId, P1), 'tbank', { subscriptionId: subId, amount: 29900 })
      expect(r1.claimed).toBe(true)

      const r3 = await crAccount.claimIntent(renewKey(subId, P2), 'tbank', { subscriptionId: subId, amount: 29900 })
      expect(r3.claimed).toBe(true)
      expect(r3.intent.id).not.toBe(r1.intent.id)
    })
  })

  describe('B: concurrent claim - exactly one pod wins', () => {
    it('two parallel claims for same key: exactly one claimed=true', async () => {
      const subId = await createSubscription()
      const periodEnd = Date.now() + 30 * 24 * 3600 * 1000
      const key = renewKey(subId, periodEnd)

      const results = await Promise.all([
        crAccount.claimIntent(key, 'tbank', { subscriptionId: subId, amount: 29900 }),
        crAccount.claimIntent(key, 'tbank', { subscriptionId: subId, amount: 29900 })
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
      const key = renewKey(subId, periodEnd)

      const r1 = await crAccount.claimIntent(key, 'tbank', { subscriptionId: subId, amount: 29900 })
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

      // Repeat claim for same key: another pod sees already charged -> skip
      const r2 = await crAccount.claimIntent(key, 'tbank', { subscriptionId: subId, amount: 29900 })
      expect(r2.claimed).toBe(false)
      expect(r2.intent.id).toBe(intentId)
      expect(r2.intent.status).toBe('charged')
    })
  })

  describe('D: heartbeat updates heartbeat_at', () => {
    it('heartbeatChargeIntent advances heartbeat_at by DB clock', async () => {
      const subId = await createSubscription()
      const periodEnd = Date.now() + 30 * 24 * 3600 * 1000

      const r1 = await crAccount.claimIntent(renewKey(subId, periodEnd), 'tbank', {
        subscriptionId: subId,
        amount: 29900
      })
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

      const r1 = await crAccount.claimIntent(renewKey(subId, periodEnd), 'tbank', {
        subscriptionId: subId,
        amount: 29900
      })
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

      const r1 = await crAccount.claimIntent(renewKey(subId, periodEnd), 'tbank', {
        subscriptionId: subId,
        amount: 29900
      })
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

      const r1 = await crAccount.claimIntent(renewKey(subId, periodEnd), 'tbank', {
        subscriptionId: subId,
        amount: 29900
      })
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

      const r1 = await crAccount.claimIntent(renewKey(subId, periodEnd), 'tbank', {
        subscriptionId: subId,
        amount: 29900
      })
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

  describe('I: checkout claim - one pending checkout per (workspace, type)', () => {
    it('type discriminates: tier and package can be claimed in parallel on one workspace', async () => {
      const tier = await crAccount.claimIntent(checkoutKey(wsUuid, 'tier'), 'tbank', { workspaceUuid: wsUuid })
      const pkg = await crAccount.claimIntent(checkoutKey(wsUuid, 'package'), 'tbank', { workspaceUuid: wsUuid })

      expect(tier.claimed).toBe(true)
      expect(pkg.claimed).toBe(true)
      expect(tier.intent.id).not.toBe(pkg.intent.id)
      expect(tier.intent.workspaceUuid).toBe(wsUuid)
      expect(tier.intent.subscriptionId).toBeFalsy()
    })

    it('two parallel checkouts (two tabs / two users) on same (ws,type): exactly one wins', async () => {
      const key = checkoutKey(wsUuid, 'tier')

      const results = await Promise.all([
        crAccount.claimIntent(key, 'tbank', { workspaceUuid: wsUuid }),
        crAccount.claimIntent(key, 'tbank', { workspaceUuid: wsUuid })
      ])

      expect(results.filter((r) => r.claimed)).toHaveLength(1)
      expect(results.filter((r) => !r.claimed)).toHaveLength(1)
      expect(results[0].intent.id).toBe(results[1].intent.id)
    })
  })

  describe('J: setIntentPayment - loser reuses the winner URL', () => {
    it('winner saves payment url; a second claim reads it back for reuse', async () => {
      const key = checkoutKey(wsUuid, 'tier')

      const winner = await crAccount.claimIntent(key, 'tbank', { workspaceUuid: wsUuid })
      expect(winner.claimed).toBe(true)
      // Before setIntentPayment: no URL yet (the claim..setIntentPayment window -> caller returns 409).
      expect(winner.intent.paymentUrl).toBeFalsy()

      await crAccount.setIntentPayment(winner.intent.id, 'pay-777', 'https://securepay.tbank/checkout/777')

      const loser = await crAccount.claimIntent(key, 'tbank', { workspaceUuid: wsUuid })
      expect(loser.claimed).toBe(false)
      expect(loser.intent.id).toBe(winner.intent.id)
      expect(loser.intent.paymentId).toBe('pay-777')
      expect(loser.intent.paymentUrl).toBe('https://securepay.tbank/checkout/777')
    })
  })

  describe('K: deleteCheckoutIntentByPaymentId - terminal webhook releases the claim', () => {
    it('after release, the (ws,type) key can be claimed again; delete is idempotent', async () => {
      const key = checkoutKey(wsUuid, 'tier')

      const first = await crAccount.claimIntent(key, 'tbank', { workspaceUuid: wsUuid })
      await crAccount.setIntentPayment(first.intent.id, 'pay-abc', 'https://securepay.tbank/checkout/abc')

      // Webhook terminal status -> release.
      await crAccount.deleteCheckoutIntentByPaymentId('pay-abc', 'tbank')
      expect(await crAccount.paymentIntent.findOne({ id: first.intent.id })).toBeNull()

      // Same key is free again -> a fresh purchase wins a new claim.
      const second = await crAccount.claimIntent(key, 'tbank', { workspaceUuid: wsUuid })
      expect(second.claimed).toBe(true)
      expect(second.intent.id).not.toBe(first.intent.id)

      // Duplicate webhook -> nothing to delete (idempotent no-op), the fresh claim survives.
      await crAccount.deleteCheckoutIntentByPaymentId('pay-abc', 'tbank')
      expect(await crAccount.paymentIntent.findOne({ id: second.intent.id })).not.toBeNull()
    })

    it('never deletes a renew intent (claim_key renew:%)', async () => {
      const subId = await createSubscription()
      const periodEnd = Date.now() + 30 * 24 * 3600 * 1000

      const renew = await crAccount.claimIntent(renewKey(subId, periodEnd), 'tbank', {
        subscriptionId: subId,
        amount: 29900
      })
      await crAccount.setIntentPayment(renew.intent.id, 'pay-renew', undefined)

      // Even matching payment_id must not delete a renew intent (ledger row).
      await crAccount.deleteCheckoutIntentByPaymentId('pay-renew', 'tbank')
      expect(await crAccount.paymentIntent.findOne({ id: renew.intent.id })).not.toBeNull()
    })
  })

  describe('L: orderFingerprint - loser reads the winner order to decide reuse vs 409', () => {
    it('winner stores fingerprint; a losing claim reads it back for the order-match check', async () => {
      const key = checkoutKey(wsUuid, 'tier')

      const winner = await crAccount.claimIntent(key, 'tbank', {
        workspaceUuid: wsUuid,
        orderFingerprint: 'pro:1:monthly'
      })
      expect(winner.claimed).toBe(true)
      expect(winner.intent.orderFingerprint).toBe('pro:1:monthly')

      // A caller for a DIFFERENT plan loses the claim and reads back the active order — the server
      // compares it to its own request: mismatch -> 409 other_checkout_active (no wrong-plan reuse).
      const loser = await crAccount.claimIntent(key, 'tbank', {
        workspaceUuid: wsUuid,
        orderFingerprint: 'business:1:monthly'
      })
      expect(loser.claimed).toBe(false)
      expect(loser.intent.id).toBe(winner.intent.id)
      expect(loser.intent.orderFingerprint).toBe('pro:1:monthly') // still the winner's order, not the loser's
    })
  })
})
