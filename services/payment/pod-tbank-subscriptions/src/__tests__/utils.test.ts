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

import { buildPricingFromPlanConfig, resolvePerSeatAmount, addMonths, nextPeriodEnd } from '../utils'

// UTC timestamp for a given calendar date (00:00 UTC).
const utc = (y: number, m: number, d: number): number => Date.UTC(y, m - 1, d)

describe('resolvePerSeatAmount', () => {
  test('monthly returns the base amount unchanged', () => {
    expect(resolvePerSeatAmount({ amount: 49900, yearlyDiscount: 15 }, false)).toBe(49900)
  })

  test('yearly rounds the discounted monthly price first, then × 12 (mirrors the UI)', () => {
    // 49900 kop (499 ₽) with 15% discount:
    //   monthly = round(49900 * 0.85 / 100) * 100 = round(424.15) * 100 = 42400 kop (424 ₽)
    //   yearly  = 42400 * 12 = 508800 kop (5088 ₽) — matches monthly × 12 shown to the user.
    expect(resolvePerSeatAmount({ amount: 49900, yearlyDiscount: 15 }, true)).toBe(508800)
  })

  test('yearly with no discount is exactly 12 × monthly', () => {
    expect(resolvePerSeatAmount({ amount: 100000, yearlyDiscount: 0 }, true)).toBe(1200000)
  })

  test('yearly with 100% discount is free', () => {
    expect(resolvePerSeatAmount({ amount: 49900, yearlyDiscount: 100 }, true)).toBe(0)
  })
})

describe('addMonths', () => {
  test('same day next month', () => {
    expect(addMonths(utc(2026, 1, 15), 1)).toBe(utc(2026, 2, 15))
  })

  test('crosses year boundary', () => {
    expect(addMonths(utc(2026, 12, 10), 1)).toBe(utc(2027, 1, 10))
  })

  test('clamps Jan-31 to Feb-28 in a non-leap year (no March overflow)', () => {
    expect(addMonths(utc(2026, 1, 31), 1)).toBe(utc(2026, 2, 28))
  })

  test('clamps Jan-31 to Feb-29 in a leap year', () => {
    expect(addMonths(utc(2028, 1, 31), 1)).toBe(utc(2028, 2, 29))
  })

  test('anchor day is preserved after a short month (Jan-31 -> Feb -> Mar-31)', () => {
    // +2 months from Jan-31 lands on Mar-31 (31 restored, not stuck at 28).
    expect(addMonths(utc(2026, 1, 31), 2)).toBe(utc(2026, 3, 31))
  })

  test('12 months over a leap Feb-29 clamps to Feb-28 next year', () => {
    expect(addMonths(utc(2028, 2, 29), 12)).toBe(utc(2029, 2, 28))
  })
})

describe('nextPeriodEnd', () => {
  test('monthly adds one calendar month', () => {
    expect(nextPeriodEnd(utc(2026, 3, 15), 'monthly')).toBe(utc(2026, 4, 15))
  })

  test('yearly adds twelve months (one calendar year)', () => {
    expect(nextPeriodEnd(utc(2026, 3, 15), 'yearly')).toBe(utc(2027, 3, 15))
  })

  test('undefined period defaults to monthly', () => {
    expect(nextPeriodEnd(utc(2026, 3, 15), undefined)).toBe(utc(2026, 4, 15))
  })

  test('yearly across a leap day clamps correctly', () => {
    expect(nextPeriodEnd(utc(2028, 2, 29), 'yearly')).toBe(utc(2029, 2, 28))
  })
})

describe('buildPricingFromPlanConfig', () => {
  test('derives minor-unit pricing from major-unit plan-config', () => {
    const plans = buildPricingFromPlanConfig({
      plans: {
        business: { priceMonthlyPerUser: 499, yearlyDiscount: 15 },
        // Free / contact-sales plans have no price and are skipped.
        start: { priceMonthlyPerUser: undefined },
        corporation: {}
      },
      packages: {
        '100gb': { priceMonthly: 1000 }
      }
    })
    expect(plans['business@tier']).toEqual({ amount: 49900, yearlyDiscount: 15 })
    expect(plans['100gb@package']).toEqual({ amount: 100000, yearlyDiscount: 0 })
    expect(plans['start@tier']).toBeUndefined()
    expect(plans['corporation@tier']).toBeUndefined()
  })

  test('handles empty config', () => {
    expect(buildPricingFromPlanConfig({})).toEqual({})
  })

  test('rounds price down and clamps out-of-range / non-finite discount', () => {
    const plans = buildPricingFromPlanConfig({
      plans: {
        // 499.9 -> floor to 49990 minor units; discount 150 -> clamped to 100.
        a: { priceMonthlyPerUser: 499.9, yearlyDiscount: 150 },
        // Negative discount clamped to 0; NaN discount -> 0.
        b: { priceMonthlyPerUser: 100, yearlyDiscount: -20 },
        c: { priceMonthlyPerUser: 100, yearlyDiscount: NaN }
      },
      packages: {
        // 10.5 -> floor to 1050.
        p: { priceMonthly: 10.5 }
      }
    })
    expect(plans['a@tier']).toEqual({ amount: 49990, yearlyDiscount: 100 })
    expect(plans['b@tier']).toEqual({ amount: 10000, yearlyDiscount: 0 })
    expect(plans['c@tier']).toEqual({ amount: 10000, yearlyDiscount: 0 })
    expect(plans['p@package']).toEqual({ amount: 1050, yearlyDiscount: 0 })
  })
})
