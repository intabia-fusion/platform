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

import { randomBytes } from 'crypto'
import { type WorkspaceUuid } from '@hcengineering/core'
import { type Subscription, type SubscriptionData, SubscriptionStatus } from '@hcengineering/account-client'
import type TbankPayments from 'tbank-payments'
import { type BillingPeriod } from './types'

/**
 * Add whole months to a UTC timestamp. Periods land on the same day each month/year.
 * Also: Jan-31 renews on Feb-28/29, Mar-31, ...
 * UTC throughout so the renewal moment is independent of the running pod's timezone.
 *
 * Notice: the anchor day is the UTC day. For payments near midnight UTC the UTC day differs
 * from the merchant's local day (e.g. Mar-1 00:30 MSK is Feb-28 21:30 UTC -> anchor 28, not 1).
 * Only for the ~21:00-24:00 UTC window.
 * If billing must follow a merchant timezone, compute anchorDay in that zone instead (add timezone to config).
 */
export function addMonths (fromMs: number, months: number): number {
  const d = new Date(fromMs)
  const anchorDay = d.getUTCDate()
  // Move to the 1st day so the month shift can't overflow (e.g. Jan-31 + 1 -> Mar-03).
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + months)
  const daysInTargetMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(anchorDay, daysInTargetMonth))
  return d.getTime()
}

/**
 * Next period end for a billing period: +1 calendar month (monthly) or +12 months / 1 year (yearly).
 */
export function nextPeriodEnd (fromMs: number, period?: BillingPeriod): number {
  return addMonths(fromMs, period === 'yearly' ? 12 : 1)
}

export function verifyWebhookToken (
  tbank: TbankPayments,
  notification: Record<string, any>,
  token: string,
  rawBody?: string
): boolean {
  // Some TBank SDK versions verify signature against raw JSON string
  // Pass rawBody if the SDK supports it, otherwise fall back to notification object
  if (rawBody !== undefined && typeof (tbank as any).verifyNotificationSignatureRaw === 'function') {
    return (tbank as any).verifyNotificationSignatureRaw(rawBody, token)
  }
  return tbank.verifyNotificationSignature(notification, token)
}

export function getPlanKey (type: string, plan: string): string {
  return `${plan}@${type}`
}

/**
 * Simple hash function to shorten workspaceUuid into a fixed-length string.
 * Not cryptographically secure — used only for generating short unique order IDs.
 */
function hashWorkspace (uuid: string): string {
  let hash = 0
  for (let i = 0; i < uuid.length; i++) {
    const char = uuid.charCodeAt(i)
    hash = (hash << 5) - hash + char
    // Convert to 32bit integer
    hash = hash & hash
  }
  return Math.abs(hash).toString(36)
}

export function buildOrderId (workspaceUuid: WorkspaceUuid, transactionCount: number): string {
  const ws = hashWorkspace(workspaceUuid)
  const ts = Date.now().toString(36)
  // transactionCount is already monotonic per workspace; crypto random removes any residual collision risk.
  const rnd = randomBytes(4).toString('hex')
  return `${ws}-${transactionCount}-${ts}-${rnd}`
}

/**
 * PastDue carries two distinct meanings, disambiguated by providerData.pending.
 * These predicates centralize that invariant so callers don't re-check `pending` ad hoc.
 *
 * isPendingFirstPayment: PastDue + pending:true — a first-payment draft (checkout started,
 *   not yet confirmed; created by buildSubscriptionData before payment). No rebillId, no real
 *   period. Cleaned up as abandoned after 24h.
 * isFailedRenewal: PastDue + pending:false — a real recurrent charge failure on a previously
 *   active subscription. Has rebillId; enters the grace period (access still granted).
 */
export function isPendingFirstPayment (sub: Subscription | SubscriptionData): boolean {
  return sub.status === SubscriptionStatus.PastDue && sub.providerData?.pending === true
}

export function isFailedRenewal (sub: Subscription | SubscriptionData): boolean {
  return sub.status === SubscriptionStatus.PastDue && sub.providerData?.pending !== true
}

export interface PlanPricing {
  amount: number
  // Yearly discount in percent
  yearlyDiscount: number
}

export function parsePlans (plansStr: string): Record<string, PlanPricing> {
  const plans: Record<string, PlanPricing> = {}
  for (const plan of plansStr.split(';')) {
    const [key, amountStr, discountStr] = plan.split(':')
    const amount = parseInt(amountStr, 10)
    if (isNaN(amount)) throw new Error(`Invalid plan amount: ${plan}`)
    let yearlyDiscount = 0
    if (discountStr !== undefined && discountStr !== '') {
      yearlyDiscount = parseInt(discountStr, 10)
      if (isNaN(yearlyDiscount) || yearlyDiscount < 0 || yearlyDiscount > 100) {
        throw new Error(`Invalid plan discount: ${plan}`)
      }
    }
    plans[key] = { amount, yearlyDiscount }
  }
  return plans
}

/**
 * Resolve the per-seat charge for a billing period
 */
export function resolvePerSeatAmount (pricing: PlanPricing, yearly: boolean): number {
  if (!yearly) return pricing.amount
  const monthly = Math.round((pricing.amount * (1 - pricing.yearlyDiscount / 100)) / 100) * 100
  return monthly * 12
}
