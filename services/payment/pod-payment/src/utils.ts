//
// Copyright © 2025 Hardcore Engineering Inc.
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
  getClient,
  grantsPlan,
  makePlanKey,
  SubscriptionStatus,
  SubscriptionType,
  type SubscriptionData,
  type AccountClient
} from '@hcengineering/account-client'

/**
 * Get account client for service operations
 */
export function getAccountClient (accountsUrl: string, serviceToken: string): AccountClient {
  return getClient(accountsUrl, serviceToken)
}

export function getPlanKey (type: SubscriptionType, plan: string): string {
  return makePlanKey(plan, type)
}

/**
 * True for the exact event that should provision a free plan: a tier subscription finalized as
 * Canceled by the scheduler after a user-initiated cancel reaches its period end. Other Canceled
 * reasons (ABANDONED draft, REPLACED supersede, PLAN_CHANGE) carry a different providerData.status
 * and must NOT trigger free provisioning.
 */
export function isFinalizedUserCancel (sub: Pick<SubscriptionData, 'type' | 'status' | 'providerData'>): boolean {
  return (
    sub.type === SubscriptionType.Tier &&
    sub.status === SubscriptionStatus.Canceled &&
    sub.providerData?.status === 'CANCELED'
  )
}

/**
 * A workspace still has an effective plan if any tier subscription grants one (active/trialing/
 * past_due/readonly). Canceled/expired tiers do not — so a workspace full of canceled tiers returns
 * false. Used to keep free provisioning idempotent: skip when a granting tier already exists.
 */
export function hasGrantingTier (subs: SubscriptionData[]): boolean {
  return subs.some((s) => s.type === SubscriptionType.Tier && grantsPlan(s))
}

// Seats-input ceiling fallback when a per-seat plan has no maxSeats configured (usersLimit=0 means
// unlimited enforcement, so it can't serve as the cap). Keep in sync with the UI MAX_SEATS_FALLBACK.
export const MAX_SEATS_FALLBACK = 10000

// Minimal shape of a plan-config entry needed for pricing (planConfig is untyped YAML).
interface PriceItem {
  free?: boolean
  priceMonthlyPerUser?: number
  priceMonthly?: number
  yearlyDiscount?: number
  maxSeats?: number
}

/**
 * Full price (kopecks) for a plan-config item at the given seats/period. Mirrors the UI
 * planChargeValue: per-seat = pricePerUser * seats; yearly applies yearlyDiscount over 12 months.
 * Flat plans ignore quantity. Free / missing items are 0.
 */
export function computePlanPrice (item: PriceItem | undefined, quantity: number, isYearly: boolean): number {
  if (item == null || item.free === true) return 0
  const yd = Number(item.yearlyDiscount ?? 0)
  const discount = 1 - (Number.isFinite(yd) ? yd : 0) / 100
  if (item.priceMonthlyPerUser != null) {
    const perUser = Number(item.priceMonthlyPerUser)
    const monthly = isYearly ? Math.round(perUser * discount) : perUser
    return Math.round((isYearly ? monthly * 12 * quantity : monthly * quantity) * 100)
  }
  const flat = Number(item.priceMonthly)
  if (!Number.isFinite(flat)) return 0
  const monthly = isYearly ? Math.round(flat * discount) : flat
  return Math.round((isYearly ? monthly * 12 : monthly) * 100)
}

/**
 * Validate a requested per-seat quantity against [min, max]. min = current member floor;
 * max guards huge values (Number.isInteger is true for 6.7e23, which would 500 the provider).
 */
export function validateSeatQuantity (q: number, min: number, max: number): { quantity?: number, error?: string } {
  // A workspace larger than the ceiling must still be able to buy seats: never cap below the floor.
  const ceiling = Math.max(Math.floor(max), min)
  if (!Number.isFinite(q) || !Number.isInteger(q) || q < 1) return { error: 'Invalid quantity' }
  if (q < min) return { error: `Quantity ${q} is below the current member count ${min}` }
  if (q > ceiling) return { error: `Quantity ${q} exceeds the maximum of ${ceiling}` }
  return { quantity: q }
}
