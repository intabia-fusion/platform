//
// Copyright © 2026 Intabia Fusion
//

// Cost in currency for `tokens` at a price-per-1000 rate.
export function tokenCost (tokens: number, pricePer1000: number): number {
  return (tokens / 1000) * pricePer1000
}

// Suggested rolling-window limits from a monthly per-user budget. The 5h limit
// assumes `windowsPerDay` active windows; the weekly limit is a quarter of the month.
// budgetTokens = monthly token budget per paid user.
export function suggestWindowLimits (
  budgetTokens: number,
  windowsPerDay: number
): { window5h: number, week: number } {
  const windowsPerMonth = Math.max(1, windowsPerDay) * 30
  return {
    window5h: Math.floor(budgetTokens / windowsPerMonth),
    week: Math.floor(budgetTokens / 4)
  }
}

// Monthly token budget a per-user spend buys at a given price-per-1000.
export function budgetTokensFromSpend (rubPerUser: number, pricePer1000: number): number {
  if (pricePer1000 <= 0) return 0
  return Math.floor((rubPerUser / pricePer1000) * 1000)
}

// Project month-end tokens from usage so far and how far into the period we are.
// elapsedMs / periodMs = fraction of the period elapsed (clamped to >0).
export function projectMonthly (usedTokens: number, elapsedMs: number, periodMs: number): number {
  const frac = Math.min(1, Math.max(elapsedMs, 1) / Math.max(periodMs, 1))
  return Math.round(usedTokens / frac)
}
