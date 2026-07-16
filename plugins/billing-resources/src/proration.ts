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

// Client-side mirror of the server proration (services/payment/pod-payment/src/proration.ts).
// Instant, request-free preview while the user adjusts the change; the server recomputes on apply,
// so this MUST stay in sync with the server formulas.

const DAY = 24 * 3600 * 1000
const YEARLY_THRESHOLD_DAYS = 180
const MONTH_MS = 30 * DAY

export interface ProrationPreview {
  charge: number // one-time charge now (kopecks), floored, >= 0
  periodEnd: number // resulting period end (ms)
  isYearly: boolean
  isUpgrade: boolean
}

function metrics (
  periodStart: number,
  periodEnd: number,
  now: number
): { periodDays: number, daysLeft: number, isYearly: boolean } {
  const periodDays = Math.max((periodEnd - periodStart) / DAY, 1)
  return {
    periodDays,
    daysLeft: Math.max((periodEnd - now) / DAY, 0),
    isYearly: periodDays > YEARLY_THRESHOLD_DAYS
  }
}

// Per-seat tier seat change. See server prorateSeats.
export function prorateSeats (input: {
  oldAmount: number
  oldSeats: number
  periodStart: number
  periodEnd: number
  now: number
  newSeats: number
  newFullPrice: number
}): ProrationPreview {
  const { oldAmount, oldSeats, newSeats, newFullPrice, now, periodEnd } = input
  const { periodDays, daysLeft, isYearly } = metrics(input.periodStart, periodEnd, now)
  const isUpgrade = newSeats > oldSeats

  if (isUpgrade) {
    if (isYearly) {
      const paidRatePerSeat = oldSeats > 0 ? oldAmount / oldSeats / periodDays : 0
      return {
        charge: Math.max(0, Math.floor((newSeats - oldSeats) * paidRatePerSeat * daysLeft)),
        periodEnd,
        isYearly,
        isUpgrade
      }
    }
    const unusedCredit = (oldAmount * daysLeft) / periodDays
    return {
      charge: Math.max(0, Math.floor(newFullPrice - unusedCredit)),
      periodEnd: now + MONTH_MS,
      isYearly,
      isUpgrade
    }
  }

  const extraDays = newSeats > 0 ? (daysLeft * (oldSeats - newSeats)) / newSeats : 0
  return { charge: 0, periodEnd: Math.ceil(periodEnd + extraDays * DAY), isYearly, isUpgrade }
}

// Flat package switch (decided by price, not seats). See server proratePackage.
export function proratePackage (input: {
  oldAmount: number
  periodStart: number
  periodEnd: number
  now: number
  newFullPrice: number
}): ProrationPreview {
  const { oldAmount, newFullPrice, now, periodEnd } = input
  const { periodDays, daysLeft, isYearly } = metrics(input.periodStart, periodEnd, now)
  const isUpgrade = newFullPrice > oldAmount

  if (isUpgrade) {
    const unusedCredit = (oldAmount * daysLeft) / periodDays
    return {
      charge: Math.max(0, Math.floor(newFullPrice - unusedCredit)),
      periodEnd: now + MONTH_MS,
      isYearly,
      isUpgrade
    }
  }

  const extraDays = newFullPrice > 0 ? (daysLeft * (oldAmount - newFullPrice)) / newFullPrice : 0
  return { charge: 0, periodEnd: Math.ceil(periodEnd + extraDays * DAY), isYearly, isUpgrade }
}
