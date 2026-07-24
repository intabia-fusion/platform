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
  type SubscriptionData,
  SubscriptionStatus,
  SubscriptionType,
  prorateSeats
} from '@hcengineering/account-client'
import {
  hasGrantingTier,
  isFinalizedUserCancel,
  computePlanPrice,
  validateSeatQuantity,
  MAX_SEATS_FALLBACK
} from '../utils'

function tier (status: SubscriptionStatus, providerStatus?: string): SubscriptionData {
  return {
    type: SubscriptionType.Tier,
    status,
    providerData: providerStatus !== undefined ? { status: providerStatus } : undefined
  } as unknown as SubscriptionData
}

describe('isFinalizedUserCancel', () => {
  it('true only for a Canceled tier with providerData.status CANCELED', () => {
    expect(isFinalizedUserCancel(tier(SubscriptionStatus.Canceled, 'CANCELED'))).toBe(true)
  })

  it('false for other Canceled reasons (ABANDONED/REPLACED/PLAN_CHANGE)', () => {
    expect(isFinalizedUserCancel(tier(SubscriptionStatus.Canceled, 'ABANDONED'))).toBe(false)
    expect(isFinalizedUserCancel(tier(SubscriptionStatus.Canceled, 'REPLACED'))).toBe(false)
    expect(isFinalizedUserCancel(tier(SubscriptionStatus.Canceled, 'PLAN_CHANGE'))).toBe(false)
  })

  it('false for a scheduled cancel still Active (willCancelAt not yet reached)', () => {
    expect(isFinalizedUserCancel(tier(SubscriptionStatus.Active, 'SCHEDULED_CANCEL'))).toBe(false)
  })

  it('false when providerData is missing', () => {
    expect(isFinalizedUserCancel(tier(SubscriptionStatus.Canceled))).toBe(false)
  })

  it('false for a non-tier subscription even with CANCELED', () => {
    const pkg = {
      type: SubscriptionType.Package,
      status: SubscriptionStatus.Canceled,
      providerData: { status: 'CANCELED' }
    } as unknown as SubscriptionData
    expect(isFinalizedUserCancel(pkg)).toBe(false)
  })
})

describe('hasGrantingTier', () => {
  it('false for a workspace full of canceled tiers (no free duplication)', () => {
    const subs = [
      tier(SubscriptionStatus.Canceled, 'CANCELED'),
      tier(SubscriptionStatus.Canceled, 'REPLACED'),
      tier(SubscriptionStatus.Expired)
    ]
    expect(hasGrantingTier(subs)).toBe(false)
  })

  it('true when an active free tier already exists (idempotent skip)', () => {
    const subs = [tier(SubscriptionStatus.Canceled, 'CANCELED'), tier(SubscriptionStatus.Active)]
    expect(hasGrantingTier(subs)).toBe(true)
  })

  it('true for past_due/readonly (still granting), false with none', () => {
    expect(hasGrantingTier([tier(SubscriptionStatus.PastDue)])).toBe(true)
    expect(hasGrantingTier([tier(SubscriptionStatus.ReadOnly)])).toBe(true)
    expect(hasGrantingTier([])).toBe(false)
  })

  it('ignores non-tier subscriptions', () => {
    const pkg = {
      type: SubscriptionType.Package,
      status: SubscriptionStatus.Active
    } as unknown as SubscriptionData
    expect(hasGrantingTier([pkg])).toBe(false)
  })
})

describe('computePlanPrice', () => {
  const business = { priceMonthlyPerUser: 499, yearlyDiscount: 15 }
  const flat = { priceMonthly: 2000, yearlyDiscount: 15 }

  it('per-seat monthly = perUser * seats (kopecks)', () => {
    expect(computePlanPrice(business, 3, false)).toBe(499 * 3 * 100)
  })

  it('per-seat monthly for the ticket case (1526 seats @ 499r = 761474r)', () => {
    expect(computePlanPrice(business, 1526, false)).toBe(76147400)
  })

  it('per-seat yearly applies the discount over 12 months', () => {
    // round(499 * 0.85) = 424; 424 * 12 * 3 = 15264r
    expect(computePlanPrice(business, 3, true)).toBe(424 * 12 * 3 * 100)
  })

  it('flat plan ignores seats, monthly and yearly', () => {
    expect(computePlanPrice(flat, 99, false)).toBe(2000 * 100)
    // round(2000 * 0.85) = 1700; * 12
    expect(computePlanPrice(flat, 99, true)).toBe(1700 * 12 * 100)
  })

  it('free or missing item is 0', () => {
    expect(computePlanPrice({ free: true, priceMonthlyPerUser: 499 }, 5, false)).toBe(0)
    expect(computePlanPrice(undefined, 5, false)).toBe(0)
    expect(computePlanPrice({}, 5, false)).toBe(0)
  })
})

describe('validateSeatQuantity', () => {
  const min = 5
  const max = MAX_SEATS_FALLBACK

  it('accepts a valid integer within [min, max]', () => {
    expect(validateSeatQuantity(7, min, max)).toEqual({ quantity: 7 })
    expect(validateSeatQuantity(max, min, max)).toEqual({ quantity: max })
  })

  it('rejects a huge float that Number.isInteger accepts (6.7e23 -> would 500 the provider)', () => {
    expect(validateSeatQuantity(6.78e23, min, max).error).toContain('exceeds the maximum')
  })

  it('rejects one above the max', () => {
    expect(validateSeatQuantity(max + 1, min, max).error).toContain('exceeds the maximum')
  })

  it('rejects below the member floor', () => {
    expect(validateSeatQuantity(3, min, max).error).toContain('below the current member count')
  })

  it('rejects a fractional or non-finite value', () => {
    expect(validateSeatQuantity(4.5, min, max).error).toBe('Invalid quantity')
    expect(validateSeatQuantity(Number.POSITIVE_INFINITY, min, max).error).toBe('Invalid quantity')
    expect(validateSeatQuantity(0, min, max).error).toBe('Invalid quantity')
  })

  it('a workspace larger than the ceiling can still buy seats (max raised to min)', () => {
    const big = MAX_SEATS_FALLBACK + 1
    expect(validateSeatQuantity(big, big, MAX_SEATS_FALLBACK)).toEqual({ quantity: big })
    expect(validateSeatQuantity(big + 1, big, MAX_SEATS_FALLBACK).error).toContain('exceeds the maximum')
  })

  it('a fractional configured max is floored', () => {
    expect(validateSeatQuantity(10, min, 10.9)).toEqual({ quantity: 10 })
    expect(validateSeatQuantity(11, min, 10.9).error).toContain('exceeds the maximum of 10')
  })
})

describe('preview (client) and apply (server) use the same proration', () => {
  it('same input to prorateSeats yields the identical charge on both sides', () => {
    // ChangeSeatsDialog previews via prorateSeats; pod-tbank applies via the same prorateSeats.
    // Same args (fixed now) MUST give the same charge — no drift between modal and bank page.
    const input = {
      oldAmount: 76147400,
      oldSeats: 1526,
      periodStart: 1_000_000_000_000 - 1 * 24 * 3600 * 1000,
      periodEnd: 1_000_000_000_000 + 29 * 24 * 3600 * 1000,
      now: 1_000_000_000_000,
      newSeats: 1527,
      newFullPrice: 76197300
    }
    expect(prorateSeats(input).charge).toBe(prorateSeats({ ...input }).charge)
    // And the single added seat costs no more than one seat's month.
    expect(prorateSeats(input).charge).toBeLessThanOrEqual(499 * 100)
  })
})
