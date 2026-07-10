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

import { type MeasureContext } from '@hcengineering/core'
import { type SubscriptionData, type Subscription, SubscriptionStatus } from '@hcengineering/account-client'
import type TbankPayments from 'tbank-payments'
import type { Config } from './config'
import { SubscriptionStorage } from './storage'
import { notifyPaymentFailed } from './notifications'
import {
  isPendingFirstPayment,
  isFailedRenewal,
  buildRenewedSubscription,
  buildFailedChargeSubscription,
  buildChargeErrorSubscription
} from './utils'
import { removeSubscriptionCard } from './server'

export interface SchedulerHandle {
  close: () => Promise<void>
}

// Cap how long shutdown waits for an in-flight renewal charge to persist before forcing exit.
const RENEWAL_DRAIN_TIMEOUT_MS = 15000
// Charge lease: refresh every second; a lease older than the timeout means the claiming pod died.
const HEARTBEAT_INTERVAL_MS = 1000
const LEASE_TIMEOUT_MS = 10000
// Max automatic retries before a past_due subscription is left alone (see SubscriptionStorage.needsRenewal).
const MAX_RETRY_ATTEMPTS = 3
// Back-off between failed charge retries (once per day).
const RETRY_INTERVAL_MS = 24 * 60 * 60 * 1000 // 1 day

/**
 * Attempt to charge a single subscription for renewal.
 * Returns the updated subscription data or null if nothing changed.
 */
async function renewSubscription (
  ctx: MeasureContext,
  tbank: TbankPayments,
  storage: SubscriptionStorage,
  config: Config,
  sub: Subscription
): Promise<void> {
  ctx.info('Attempting to renew subscription', {
    subId: sub.id,
    paymentId: sub.providerSubscriptionId,
    plan: sub.plan,
    periodEnd: sub.periodEnd,
    rebillId: sub.providerData?.rebillId
  })

  // Previous status, to notify only on the active -> past_due transition (not on repeated retries).
  const wasActive = sub.status === SubscriptionStatus.Active

  // Atomic cross-pod claim keyed by the period being renewed. Guarantees a single charge per period
  // across replicas/rolling-updates: only the claimer (or a prior failed attempt) proceeds.
  if (sub.periodEnd === undefined) {
    ctx.error('Cannot renew subscription without periodEnd', { subId: sub.id })
    return
  }
  const claim = await storage.claimRenewal(sub.id, sub.periodEnd, sub.amount)

  if (!claim.claimed) {
    if (claim.status === 'charged') {
      // Already paid for this period by another pod/tick.
      return
    }
    if (claim.status === 'pending') {
      // Someone holds (or held) the lease. If it is still fresh, that pod is alive and charging — skip.
      const leaseFresh = claim.heartbeatAt !== undefined && Date.now() - claim.heartbeatAt < LEASE_TIMEOUT_MS
      if (leaseFresh) {
        ctx.info('Skipping renewal, charge in progress on another pod', { subId: sub.id })
        return
      }
      // Lease expired: the claiming pod died mid-charge. The charge MAY have gone through and we can no
      // longer learn its outcome (TBank /v2/Charge gives no key we can reconcile by — see follow-up).
      // Fail safe toward "paid": take over atomically and treat as charged. A free period is far less
      // harmful than a double charge. Only the pod that wins the takeover proceeds.
      const wonTakeover = await storage.reclaimStaleCharge(claim.intentId, LEASE_TIMEOUT_MS)
      if (!wonTakeover) {
        return
      }
      ctx.warn('Orphaned charge intent assumed paid (claiming pod died mid-charge)', {
        subId: sub.id,
        intentId: claim.intentId
      })
      await storage.markCharge(claim.intentId, 'charged')
      await storage.upsert(
        buildRenewedSubscription(sub, Date.now(), (sub.providerData?.lastChargePaymentId as string) ?? '')
      )
      return
    }
    // status === 'failed' falls through to a fresh charge attempt (retry).
  }
  const intentId = claim.intentId

  // Keep the lease warm while the charge is in flight so other pods see this pod is alive.
  const heartbeat = setInterval(() => {
    void storage.heartbeatCharge(intentId)
  }, HEARTBEAT_INTERVAL_MS)

  try {
    const chargeResult = await tbank.chargeRecurrent({
      PaymentId: sub.providerSubscriptionId,
      RebillId: sub.providerData?.rebillId as string
    })

    if (chargeResult.Success === true) {
      await storage.markCharge(intentId, 'charged', chargeResult.PaymentId)
      const updatedData = buildRenewedSubscription(sub, Date.now(), chargeResult.PaymentId)
      await storage.upsert(updatedData)
      ctx.info('Subscription renewed successfully', {
        subId: sub.id,
        newPeriodEnd: updatedData.periodEnd
      })
    } else {
      await storage.markCharge(intentId, 'failed')
      ctx.warn('Subscription renewal charge failed', {
        subId: sub.id,
        errorCode: chargeResult.ErrorCode,
        message: chargeResult.Message
      })

      const updatedData = buildFailedChargeSubscription(
        sub,
        chargeResult.ErrorCode,
        chargeResult.Message,
        RETRY_INTERVAL_MS
      )
      await storage.upsert(updatedData)
      ctx.info('Subscription payment failed, marked PastDue', {
        subId: sub.id,
        attempt: updatedData.providerData?.retryAttempt
      })
      await notifyRenewalFailure(ctx, storage, config, updatedData, wasActive)
    }
  } catch (err: any) {
    // Charge outcome UNKNOWN (network/timeout). Stop refreshing the lease and leave the intent pending:
    // its heartbeat goes stale, so another tick/pod resolves it via the lease-expiry takeover above
    // (fail safe toward paid). Do NOT mark failed here — that would permit a re-charge.
    ctx.error('Renewal charge outcome unknown, intent left pending for lease-expiry takeover', {
      subId: sub.id,
      intentId,
      err
    })
    const updatedData = buildChargeErrorSubscription(sub, err.message, RETRY_INTERVAL_MS)
    await storage.upsert(updatedData)
    await notifyRenewalFailure(ctx, storage, config, updatedData, wasActive)
  } finally {
    clearInterval(heartbeat)
  }
}

/**
 * Decide which payment-failed email (if any) to send after a failed renewal charge.
 * - 'failed' on the first failure of a cycle (active -> past_due transition).
 * - 'final' once automatic retries are exhausted (retryAttempt reaches the max), sent once.
 */
async function notifyRenewalFailure (
  ctx: MeasureContext,
  storage: SubscriptionStorage,
  config: Config,
  updated: SubscriptionData,
  wasActive: boolean
): Promise<void> {
  const attempt = (updated.providerData?.retryAttempt as number) ?? 0
  if (attempt >= MAX_RETRY_ATTEMPTS) {
    await notifyPaymentFailed(ctx, storage, config, updated, 'final')
  } else if (wasActive) {
    await notifyPaymentFailed(ctx, storage, config, updated, 'failed')
  }
}

/**
 * Clean up abandoned pending subscriptions older than 24 hours.
 * Abandoned = PastDue with pending: true (user started checkout but never paid).
 * These cannot be retried (no rebillId), so they just accumulate as orphans.
 */
async function cleanupAbandonedSubscriptions (ctx: MeasureContext, storage: SubscriptionStorage): Promise<void> {
  try {
    const now = Date.now()
    const staleThreshold = 24 * 60 * 60 * 1000 // 24 hours
    let cleaned = 0

    for (const sub of await storage.getCandidates()) {
      if (!isPendingFirstPayment(sub)) continue

      const age = now - (sub.periodStart ?? now)
      if (age < staleThreshold) continue

      // Re-fetch to avoid race with concurrent webhook
      const freshSub = await storage.getById(sub.id)
      if (freshSub === null) continue
      if (!isPendingFirstPayment(freshSub)) continue

      await storage.upsert({
        ...freshSub,
        status: SubscriptionStatus.Canceled,
        providerData: {
          ...freshSub.providerData,
          modifiedAt: now,
          status: 'ABANDONED',
          pending: false
        }
      })
      cleaned++
    }

    if (cleaned > 0) {
      ctx.info('Cleaned up abandoned pending subscriptions', { count: cleaned })
    }
  } catch (err) {
    ctx.error('Cleanup abandoned subscriptions error', { err })
  }
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Move failed-renewal subscriptions to ReadOnly once the grace period has expired.
 * Grace = `periodEnd + GracePeriodDays`. Only failed renewals (PastDue + pending:false) with
 * exhausted retries are eligible — first-payment drafts (pending:true) are handled by
 * cleanupAbandonedSubscriptions, not here. ReadOnly keeps the record so payment can still recover it.
 */
async function enforceGracePeriod (ctx: MeasureContext, storage: SubscriptionStorage, config: Config): Promise<void> {
  try {
    const now = Date.now()
    const graceMs = config.GracePeriodDays * DAY_MS
    let moved = 0

    for (const sub of await storage.getCandidates()) {
      if (!isFailedRenewal(sub)) continue
      const retryAttempt = (sub.providerData?.retryAttempt as number) ?? 0
      if (retryAttempt < MAX_RETRY_ATTEMPTS) continue
      if (sub.periodEnd === undefined || sub.periodEnd + graceMs > now) continue

      // Re-fetch to avoid race with a concurrent webhook / charge.
      const freshSub = await storage.getById(sub.id)
      if (freshSub === null) continue
      if (!isFailedRenewal(freshSub)) continue
      const freshAttempt = (freshSub.providerData?.retryAttempt as number) ?? 0
      if (freshAttempt < MAX_RETRY_ATTEMPTS) continue
      if (freshSub.periodEnd === undefined || freshSub.periodEnd + graceMs > now) continue

      await storage.upsert({
        ...freshSub,
        status: SubscriptionStatus.ReadOnly,
        providerData: {
          ...freshSub.providerData,
          modifiedAt: now,
          status: 'GRACE_EXPIRED'
        }
      })
      ctx.info('Subscription moved to ReadOnly after grace period', { subId: freshSub.id, plan: freshSub.plan })
      moved++
    }

    if (moved > 0) {
      ctx.info('Grace period enforced', { moved })
    }
  } catch (err) {
    ctx.error('Enforce grace period error', { err })
  }
}

/**
 * Finalize scheduled cancellations.
 * Once `now >= willCancelAt` the subscription is terminated: status
 * Canceled and the saved card removed at TBank.
 */
async function enforceScheduledCancel (
  ctx: MeasureContext,
  tbank: TbankPayments,
  storage: SubscriptionStorage
): Promise<void> {
  try {
    const now = Date.now()
    let canceled = 0

    for (const sub of await storage.getCandidates()) {
      if (sub.status !== SubscriptionStatus.Active) continue
      if (sub.providerData?.pending === true) continue
      if (sub.willCancelAt == null || sub.willCancelAt > now) continue

      // Re-fetch to avoid racing an uncancel (which clears willCancelAt) or a concurrent tick.
      const freshSub = await storage.getById(sub.id)
      if (freshSub === null) continue
      if (freshSub.status !== SubscriptionStatus.Active) continue
      if (freshSub.providerData?.pending === true) continue
      if (freshSub.willCancelAt == null || freshSub.willCancelAt > now) continue

      await removeSubscriptionCard(ctx, tbank, freshSub)
      await storage.upsert({
        ...freshSub,
        status: SubscriptionStatus.Canceled,
        providerData: {
          ...freshSub.providerData,
          modifiedAt: now,
          status: 'CANCELED'
        }
      })
      ctx.info('Scheduled cancellation finalized', { subId: freshSub.id, plan: freshSub.plan })
      canceled++
    }

    if (canceled > 0) {
      ctx.info('Scheduled cancellations enforced', { canceled })
    }
  } catch (err) {
    ctx.error('Enforce scheduled cancel error', { err })
  }
}

/**
 * Start the subscription renewal scheduler.
 * Periodically checks for subscriptions that need renewal and attempts to charge them.
 * - On success: extends periodEnd by one calendar month/year (the subscription's period), resets retry counters
 * - On failure: marks as PastDue, retries up to 3 times with 1-hour intervals
 * - After 3 failed retries: subscription stays PastDue, no further retries
 */
export function startScheduler (
  ctx: MeasureContext,
  tbank: TbankPayments,
  storage: SubscriptionStorage,
  config: Config,
  intervalMinutes: number
): SchedulerHandle {
  // Tracks the in-flight renewal cycle so shutdown can wait for a charge to finish persisting.
  // A charge debits the customer at TBank; losing the subsequent upsert would orphan the payment.
  let activeRenewal: Promise<void> | null = null

  const runRenewalCycle = async (): Promise<void> => {
    try {
      const now = Date.now()
      for (const sub of await storage.getCandidates()) {
        if (SubscriptionStorage.needsRenewal(sub, now)) {
          await renewSubscription(ctx, tbank, storage, config, sub)
        }
      }
    } catch (err) {
      ctx.error('Subscription renewal scheduler error', { err })
    }
  }

  const trackRenewal = (): void => {
    // In-pod overlap guard: skip if the previous cycle is still running (a slow cycle + short interval
    // would otherwise stack). This is a cheap local guard only; cross-pod safety is the ledger claim.
    if (activeRenewal !== null) {
      ctx.info('Renewal cycle still running, skipping this tick')
      return
    }
    activeRenewal = runRenewalCycle().finally(() => {
      activeRenewal = null
    })
  }

  const cleanupCycle = async (): Promise<void> => {
    await cleanupAbandonedSubscriptions(ctx, storage)
  }

  const graceCycle = async (): Promise<void> => {
    await enforceGracePeriod(ctx, storage, config)
  }

  const scheduledCancelCycle = async (): Promise<void> => {
    await enforceScheduledCancel(ctx, tbank, storage)
  }

  const schedulerIntervalMs = intervalMinutes * 60 * 1000
  ctx.info('Starting subscription renewal scheduler', { intervalMinutes, gracePeriodDays: config.GracePeriodDays })

  // Run immediately on start, then periodically
  trackRenewal()
  void cleanupCycle()
  void graceCycle()
  void scheduledCancelCycle()
  const timer = setInterval(trackRenewal, schedulerIntervalMs)
  // Cleanup runs less frequently — once per cycle is fine; abandoned subs are rare
  const cleanupTimer = setInterval(() => {
    void cleanupCycle()
  }, schedulerIntervalMs)
  // Grace enforcement runs on its own timer (separate responsibility from renewals/cleanup).
  const graceTimer = setInterval(() => {
    void graceCycle()
  }, schedulerIntervalMs)
  // Scheduled-cancel finalization runs on its own timer (separate responsibility).
  const scheduledCancelTimer = setInterval(() => {
    void scheduledCancelCycle()
  }, schedulerIntervalMs)

  return {
    close: async () => {
      clearInterval(timer)
      clearInterval(cleanupTimer)
      clearInterval(graceTimer)
      clearInterval(scheduledCancelTimer)
      // Only the renewal cycle is drained: it issues a charge (real money), so a lost upsert orphans
      // the payment. Cleanup/grace upserts are not drained — they re-fetch and re-check, so a missed
      // one is simply redone on the next tick (idempotent, no money lost).
      if (activeRenewal !== null) {
        ctx.info('Waiting for in-flight renewal before shutdown')
        await Promise.race([
          activeRenewal,
          new Promise<void>((resolve) => setTimeout(resolve, RENEWAL_DRAIN_TIMEOUT_MS))
        ])
      }
    }
  }
}
