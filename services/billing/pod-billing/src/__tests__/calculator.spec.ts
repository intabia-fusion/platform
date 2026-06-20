//
// Copyright © 2026 Intabia Fusion
//

import { tokenCost, suggestWindowLimits, budgetTokensFromSpend, projectMonthly } from '../calculator'

describe('calculator', () => {
  it('tokenCost: 1M Lite @0.065/1000 = 65', () => {
    expect(tokenCost(1_000_000, 0.065)).toBeCloseTo(65)
  })

  it('budgetTokensFromSpend: 25rub @0.065 ~= 384k', () => {
    expect(budgetTokensFromSpend(25, 0.065)).toBe(384615)
  })

  it('budgetTokensFromSpend: zero price -> 0', () => {
    expect(budgetTokensFromSpend(25, 0)).toBe(0)
  })

  it('suggestWindowLimits: 385k budget, 2 windows/day', () => {
    const r = suggestWindowLimits(385000, 2)
    expect(r.window5h).toBe(Math.floor(385000 / 60)) // 6416
    expect(r.week).toBe(Math.floor(385000 / 4)) // 96250
  })

  it('suggestWindowLimits: 144 windows (continuous)', () => {
    const r = suggestWindowLimits(385000, 4.8) // 4.8/day*30 = 144
    expect(r.window5h).toBe(Math.floor(385000 / 144))
  })

  it('projectMonthly: half-period used 100k -> 200k', () => {
    expect(projectMonthly(100000, 15, 30)).toBe(200000)
  })

  it('projectMonthly: full period -> same', () => {
    expect(projectMonthly(100000, 30, 30)).toBe(100000)
  })
})
