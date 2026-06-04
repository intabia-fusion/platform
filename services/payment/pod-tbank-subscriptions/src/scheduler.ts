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
import type { SubscriptionStorage } from './storage'

export interface SchedulerHandle {
  close: () => void
}

const RENEWAL_PERIOD_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

/**
 * Build updated subscription data after a successful recurrent charge.
 */
function buildRenewedSubscription (sub: Subscription, now: number, paymentId: string): SubscriptionData {
  return {
    ...sub,
    status: SubscriptionStatus.Active,
    periodStart: now,
    periodEnd: now + RENEWAL_PERIOD_MS,
    providerData: {
      ...sub.providerData,
      modifiedAt: now,
      status: 'ACTIVE',
      retryAttempt: 0,
      retryAfter: 0,
      lastChargeAt: now,
      lastChargePaymentId: paymentId
    }
  }
}

/**
 * Build past-due subscription data after a failed recurrent charge.
 * Keeps the card and rebillId for retry.
 */
function buildFailedChargeSubscription (sub: Subscription, errorCode: string, message: string): SubscriptionData {
  const now = Date.now()
  const prevAttempt = (sub.providerData?.retryAttempt as number) ?? 0
  return {
    ...sub,
    status: SubscriptionStatus.PastDue,
    providerData: {
      ...sub.providerData,
      modifiedAt: now,
      status: 'CHARGE_FAILED',
      retryAttempt: prevAttempt + 1,
      retryAfter: now + 60 * 60 * 1000, // retry in 1 hour
      lastChargeError: message,
      lastChargeErrorCode: errorCode
    }
  }
}

/**
 * Build past-due subscription data after an unexpected error during charge.
 * Keeps the card and rebillId for retry.
 */
function buildChargeErrorSubscription (sub: Subscription, errorMessage: string): SubscriptionData {
  const now = Date.now()
  const prevAttempt = (sub.providerData?.retryAttempt as number) ?? 0
  return {
    ...sub,
    status: SubscriptionStatus.PastDue,
    providerData: {
      ...sub.providerData,
      modifiedAt: now,
      status: 'CHARGE_ERROR',
      retryAttempt: prevAttempt + 1,
      retryAfter: now + 60 * 60 * 1000, // retry in 1 hour
      lastChargeError: errorMessage
    }
  }
}

/**
 * Attempt to charge a single subscription for renewal.
 * Returns the updated subscription data or null if nothing changed.
 */
async function renewSubscription (
  ctx: MeasureContext,
  tbank: TbankPayments,
  storage: SubscriptionStorage,
  sub: Subscription
): Promise<void> {
  ctx.info('Attempting to renew subscription', {
    subId: sub.id,
    paymentId: sub.providerSubscriptionId,
    plan: sub.plan,
    periodEnd: sub.periodEnd,
    rebillId: sub.providerData?.rebillId
  })

  try {
    const chargeResult = await tbank.chargeRecurrent({
      PaymentId: sub.providerSubscriptionId,
      RebillId: sub.providerData?.rebillId as string
    })

    if (chargeResult.Success === true) {
      const updatedData = buildRenewedSubscription(sub, Date.now(), chargeResult.PaymentId)
      await storage.upsert(updatedData)
      ctx.info('Subscription renewed successfully', {
        subId: sub.id,
        newPeriodEnd: updatedData.periodEnd
      })
    } else {
      ctx.warn('Subscription renewal charge failed', {
        subId: sub.id,
        errorCode: chargeResult.ErrorCode,
        message: chargeResult.Message
      })

      const updatedData = buildFailedChargeSubscription(sub, chargeResult.ErrorCode, chargeResult.Message)
      await storage.upsert(updatedData)
      ctx.info('Subscription payment failed, marked PastDue', {
        subId: sub.id,
        attempt: updatedData.providerData?.retryAttempt
      })
    }
  } catch (err: any) {
    ctx.error('Error renewing subscription', { subId: sub.id, err })

    const updatedData = buildChargeErrorSubscription(sub, err.message)
    await storage.upsert(updatedData)
    ctx.info('Subscription charge error, marked PastDue', {
      subId: sub.id,
      attempt: updatedData.providerData?.retryAttempt
    })
  }
}

/**
 * Clean up abandoned pending subscriptions older than 24 hours.
 * Abandoned = PastDue with pending: true (user started checkout but never paid).
 * These cannot be retried (no rebillId), so they just accumulate as orphans.
 */
async function cleanupAbandonedSubscriptions (ctx: MeasureContext, storage: SubscriptionStorage): Promise<void> {
  try {
    const allSubs = await storage.getAll()
    const now = Date.now()
    const staleThreshold = 24 * 60 * 60 * 1000 // 24 hours
    let cleaned = 0

    for (const sub of allSubs) {
      if (sub.provider !== 'tbank') continue
      if (sub.status !== SubscriptionStatus.PastDue) continue
      if (sub.providerData?.pending !== true) continue

      const age = now - (sub.periodStart ?? now)
      if (age < staleThreshold) continue

      // Re-fetch to avoid race with concurrent webhook
      const freshSub = await storage.getById(sub.id)
      if (freshSub === null) continue
      if (freshSub.status !== SubscriptionStatus.PastDue || freshSub.providerData?.pending !== true) continue

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

/**
 * Start the subscription renewal scheduler.
 * Periodically checks for subscriptions that need renewal and attempts to charge them.
 * - On success: extends periodEnd by 30 days, resets retry counters
 * - On failure: marks as PastDue, retries up to 3 times with 1-hour intervals
 * - After 3 failed retries: subscription stays PastDue, no further retries
 */
export function startScheduler (
  ctx: MeasureContext,
  tbank: TbankPayments,
  storage: SubscriptionStorage,
  intervalMinutes: number
): SchedulerHandle {
  const runRenewalCycle = async (): Promise<void> => {
    try {
      const needingRenewal = await storage.getSubscriptionsNeedingRenewal(ctx)

      for (const sub of needingRenewal) {
        await renewSubscription(ctx, tbank, storage, sub)
      }
    } catch (err) {
      ctx.error('Subscription renewal scheduler error', { err })
    }
  }

  const cleanupCycle = async (): Promise<void> => {
    await cleanupAbandonedSubscriptions(ctx, storage)
  }

  const schedulerIntervalMs = intervalMinutes * 60 * 1000
  ctx.info('Starting subscription renewal scheduler', { intervalMinutes })

  // Run immediately on start, then periodically
  void runRenewalCycle()
  void cleanupCycle()
  const timer = setInterval(() => {
    void runRenewalCycle()
  }, schedulerIntervalMs)
  // Cleanup runs less frequently — once per cycle is fine; abandoned subs are rare
  const cleanupTimer = setInterval(() => {
    void cleanupCycle()
  }, schedulerIntervalMs)

  return {
    close: () => {
      clearInterval(timer)
      clearInterval(cleanupTimer)
    }
  }
}
