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
      lastChargeAt: now,
      lastChargePaymentId: paymentId
    }
  }
}

/**
 * Build canceled subscription data after a failed recurrent charge.
 */
function buildFailedChargeSubscription (
  sub: Subscription,
  errorCode: string,
  message: string
): SubscriptionData {
  return {
    ...sub,
    status: SubscriptionStatus.Canceled,
    providerData: {
      ...sub.providerData,
      modifiedAt: Date.now(),
      status: 'CHARGE_FAILED',
      canceledAt: Date.now(),
      lastChargeError: message,
      lastChargeErrorCode: errorCode
    }
  }
}

/**
 * Build canceled subscription data after an unexpected error during charge.
 */
function buildChargeErrorSubscription (sub: Subscription, errorMessage: string): SubscriptionData {
  return {
    ...sub,
    status: SubscriptionStatus.Canceled,
    providerData: {
      ...sub.providerData,
      modifiedAt: Date.now(),
      status: 'CHARGE_ERROR',
      canceledAt: Date.now(),
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

    if (chargeResult.Success) {
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
      ctx.info('Subscription canceled due to failed renewal', { subId: sub.id })
    }
  } catch (err: any) {
    ctx.error('Error renewing subscription', { subId: sub.id, err })

    const updatedData = buildChargeErrorSubscription(sub, err.message)
    await storage.upsert(updatedData)
  }
}

/**
 * Start the subscription renewal scheduler.
 * Periodically checks for subscriptions that need renewal and attempts to charge them.
 * - On success: extends periodEnd by 30 days
 * - On failure: marks as canceled
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

  const schedulerIntervalMs = intervalMinutes * 60 * 1000
  ctx.info('Starting subscription renewal scheduler', { intervalMinutes })

  // Run immediately on start, then periodically
  void runRenewalCycle()
  const timer = setInterval(() => {
    void runRenewalCycle()
  }, schedulerIntervalMs)

  return {
    close: () => {
      clearInterval(timer)
    }
  }
}
