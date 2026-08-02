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

// Shared pro-rata math for plan/seat changes. Lives here so pod-payment (preview) and
// pod-tbank-subscriptions (apply) compute the identical charge/period — a fork of this logic is
// how the "modal says 'no charge' but the bank bills full price" desync happened.

const DAY = 24 * 3600 * 1000
const YEARLY_THRESHOLD_DAYS = 180
const KOPECKS_PER_RUBLE = 100

// Round a kopeck amount DOWN to whole rubles. Pro-rata credits produce fractional-ruble charges
// (e.g. 400032 kopecks = 4000.32 ₽); charging whole rubles keeps the modal preview (which shows
// rubles) and the bank page identical, and any rounding favors the customer.
function floorToRubles (kopecks: number): number {
  return Math.floor(kopecks / KOPECKS_PER_RUBLE) * KOPECKS_PER_RUBLE
}

export interface ProrationResult {
  charge: number // one-time charge now (kopecks), floored to whole rubles, >= 0
  periodStart: number // period start (ms); unchanged on an upgrade, kept on a downgrade
  periodEnd: number // period end (ms); unchanged on an upgrade, extended by the credit on a downgrade
  isYearly: boolean
  isUpgrade: boolean
}

interface Period {
  periodStart: number
  periodEnd: number
  now: number
}

function metrics (p: Period): { periodDays: number, daysLeft: number, isYearly: boolean } {
  const periodDays = Math.max((p.periodEnd - p.periodStart) / DAY, 1)
  return {
    periodDays,
    daysLeft: Math.max((p.periodEnd - p.now) / DAY, 0),
    isYearly: periodDays > YEARLY_THRESHOLD_DAYS
  }
}

/**
 * Pro-rata for a per-seat tier seat change WITHOUT refund. Rate comes from what was actually paid
 * (oldAmount/oldSeats/periodDays), so a yearly discount is carried automatically.
 *
 * - Upgrade: charge only the added seats for the remaining days; renewal date unchanged.
 * - Downgrade: no refund — the credit for removed seats extends the period.
 */
export function prorateSeats (input: {
  oldAmount: number
  oldSeats: number
  periodStart: number
  periodEnd: number
  now: number
  newSeats: number
  newFullPrice: number
}): ProrationResult {
  const { oldAmount, oldSeats, newSeats } = input
  const { periodDays, daysLeft, isYearly } = metrics(input)
  const isUpgrade = newSeats > oldSeats

  if (isUpgrade) {
    // Seat upgrade (monthly or yearly): charge only the added seats pro-rata, period unchanged.
    // Old monthly reset-period branch overcharged (1526+1 billed 729₽ instead of ~499).
    const paidRatePerSeat = oldSeats > 0 ? oldAmount / oldSeats / periodDays : 0
    const charge = Math.max(0, floorToRubles((newSeats - oldSeats) * paidRatePerSeat * daysLeft))
    return { charge, periodStart: input.periodStart, periodEnd: input.periodEnd, isYearly, isUpgrade }
  }

  // Downgrade: period start stays, only the end extends by the removed-seat credit.
  const extraDays = newSeats > 0 ? (daysLeft * (oldSeats - newSeats)) / newSeats : 0
  return {
    charge: 0,
    periodStart: input.periodStart,
    periodEnd: Math.ceil(input.periodEnd + extraDays * DAY),
    isYearly,
    isUpgrade
  }
}

/**
 * Pro-rata for a flat package switch WITHOUT refund. Packages are single-unit, so upgrade/downgrade
 * is decided by price, not seats.
 *
 * - Bigger package: charge only the price difference for the remaining days; renewal date unchanged.
 * - Smaller package: no refund — the credit for the price drop extends the period.
 */
export function proratePackage (input: {
  oldAmount: number
  periodStart: number
  periodEnd: number
  now: number
  newFullPrice: number
}): ProrationResult {
  const { oldAmount, newFullPrice } = input
  const { periodDays, daysLeft, isYearly } = metrics(input)
  const isUpgrade = newFullPrice > oldAmount

  if (isUpgrade) {
    // Bigger package: charge only the price difference pro-rata for the remaining days, period
    // unchanged. Old branch reset to a fresh 30d and billed newFullPrice - partial credit, which
    // overcharged mid-period (same class of bug as the seat upgrade). Symmetric with prorateSeats:
    // the per-day delta is (newFullPrice - oldAmount) / periodDays.
    const charge = Math.max(0, floorToRubles(((newFullPrice - oldAmount) / periodDays) * daysLeft))
    return { charge, periodStart: input.periodStart, periodEnd: input.periodEnd, isYearly, isUpgrade }
  }

  // Smaller package: period start stays, end extends by the price-drop credit.
  const extraDays = newFullPrice > 0 ? (daysLeft * (oldAmount - newFullPrice)) / newFullPrice : 0
  return {
    charge: 0,
    periodStart: input.periodStart,
    periodEnd: Math.ceil(input.periodEnd + extraDays * DAY),
    isYearly,
    isUpgrade
  }
}
