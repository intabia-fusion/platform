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

const DAY = 24 * 3600 * 1000
const YEARLY_THRESHOLD_DAYS = 180
const MONTH_MS = 30 * DAY

export interface ProrationResult {
  charge: number // one-time charge now (kopecks), floored, >= 0
  periodStart: number // new period start (ms); reset only when the period resets (monthly upgrade)
  periodEnd: number // new period end (ms); unchanged for a yearly seat upgrade
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
 * - Upgrade monthly: charge the new full price minus the unused credit; fresh 30d period.
 * - Upgrade yearly: charge only the added seats for the remaining days; renewal date unchanged.
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
  const { oldAmount, oldSeats, newSeats, newFullPrice, now } = input
  const { periodDays, daysLeft, isYearly } = metrics(input)
  const isUpgrade = newSeats > oldSeats

  if (isUpgrade) {
    if (isYearly) {
      // Yearly upgrade: renewal date and period unchanged, only the extra seats are charged now.
      const paidRatePerSeat = oldSeats > 0 ? oldAmount / oldSeats / periodDays : 0
      const charge = Math.max(0, Math.floor((newSeats - oldSeats) * paidRatePerSeat * daysLeft))
      return { charge, periodStart: input.periodStart, periodEnd: input.periodEnd, isYearly, isUpgrade }
    }
    // Monthly upgrade: the period resets to a fresh 30 days from now.
    const unusedCredit = (oldAmount * daysLeft) / periodDays
    return {
      charge: Math.max(0, Math.floor(newFullPrice - unusedCredit)),
      periodStart: now,
      periodEnd: now + MONTH_MS,
      isYearly,
      isUpgrade
    }
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
 * - Bigger package: charge the new price minus the unused credit of the old one; fresh 30d period.
 * - Smaller package: no refund — the credit for the price drop extends the period.
 */
export function proratePackage (input: {
  oldAmount: number
  periodStart: number
  periodEnd: number
  now: number
  newFullPrice: number
}): ProrationResult {
  const { oldAmount, newFullPrice, now } = input
  const { periodDays, daysLeft, isYearly } = metrics(input)
  const isUpgrade = newFullPrice > oldAmount

  if (isUpgrade) {
    // Bigger package: fresh 30-day period.
    const unusedCredit = (oldAmount * daysLeft) / periodDays
    return {
      charge: Math.max(0, Math.floor(newFullPrice - unusedCredit)),
      periodStart: now,
      periodEnd: now + MONTH_MS,
      isYearly,
      isUpgrade
    }
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
