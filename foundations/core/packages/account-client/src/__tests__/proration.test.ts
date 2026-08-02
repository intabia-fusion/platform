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

import { prorateSeats, proratePackage } from '../proration'

const DAY = 24 * 3600 * 1000
const kop = (rub: number): number => rub * 100

describe('prorateSeats', () => {
  const now = 1_000_000_000_000

  describe('monthly upgrade', () => {
    // 3->5 seats, 15d left: bill only 2 added seats: 2 * (2700/3/30) * 15 = 900r. Period unchanged.
    const res = prorateSeats({
      oldAmount: kop(2700),
      oldSeats: 3,
      periodStart: now - 15 * DAY,
      periodEnd: now + 15 * DAY,
      now,
      newSeats: 5,
      newFullPrice: kop(4500)
    })

    it('charges only the added seats pro-rata for the remaining days', () => {
      expect(res.charge).toBe(kop(900))
    })
    it('keeps the period unchanged (start AND end)', () => {
      expect(res.periodStart).toBe(now - 15 * DAY)
      expect(res.periodEnd).toBe(now + 15 * DAY)
    })
    it('flags upgrade, not yearly', () => {
      expect(res.isUpgrade).toBe(true)
      expect(res.isYearly).toBe(false)
    })
  })

  describe('large team, add one seat (FUSIO-983 regression)', () => {
    // 1526 seats @ 499r, add 1: charge must never exceed one seat's month (499r) at any team size.
    // Old reset-period formula billed ~729r (re-billed all 1526 old seats for a fresh period).
    const oldSeats = 1526
    const perUser = 499
    const oldAmount = kop(perUser * oldSeats)
    const res = prorateSeats({
      oldAmount,
      oldSeats,
      periodStart: now - 1 * DAY, // almost-fresh period, 29 days left
      periodEnd: now + 29 * DAY,
      now,
      newSeats: oldSeats + 1,
      newFullPrice: kop(perUser * (oldSeats + 1))
    })

    it('charges no more than one seat month, not scaled by team size', () => {
      expect(res.charge).toBeLessThanOrEqual(kop(perUser))
      // 1 seat * (761474/1526/30) * 29 ~= 482r, floored to rubles
      expect(res.charge).toBe(Math.floor((1 * (oldAmount / oldSeats / 30) * 29) / 100) * 100)
    })
    it('does not shift the renewal date', () => {
      expect(res.periodEnd).toBe(now + 29 * DAY)
    })
  })

  describe('yearly upgrade', () => {
    // 3 seats yearly, 365d period, 100 days left. Add 2 seats -> charge = 2 * paidRate * 100.
    const oldAmount = kop(27540)
    const start = now - 265 * DAY
    const end = now + 100 * DAY
    const res = prorateSeats({
      oldAmount,
      oldSeats: 3,
      periodStart: start,
      periodEnd: end,
      now,
      newSeats: 5,
      newFullPrice: kop(45900)
    })

    it('charges only delta seats for the remaining days at the paid (discounted) rate, floored to rubles', () => {
      const paidRate = oldAmount / 3 / 365
      const raw = 2 * paidRate * 100
      // charge is floored to whole rubles (kopecks % 100 dropped).
      expect(res.charge).toBe(Math.floor(Math.floor(raw) / 100) * 100)
    })
    it('keeps the whole period unchanged (start AND end) so a later change still sees a yearly span', () => {
      expect(res.periodStart).toBe(start)
      expect(res.periodEnd).toBe(end)
    })
    it('flags yearly upgrade', () => {
      expect(res.isYearly).toBe(true)
      expect(res.isUpgrade).toBe(true)
    })
  })

  it('floors a fractional-ruble upgrade charge down to whole rubles', () => {
    // Craft a partial period so the credit produces a fractional-ruble delta, then assert it is floored.
    const res = prorateSeats({
      oldAmount: kop(1000),
      oldSeats: 1,
      periodStart: now - 15 * DAY,
      periodEnd: now + 15.4321 * DAY, // odd remaining days -> fractional-kopeck credit
      now,
      newSeats: 2,
      newFullPrice: kop(2000)
    })
    expect(res.charge % 100).toBe(0) // whole rubles, no stray kopecks
  })

  it('a second yearly upgrade still measures a yearly span (period not desynced)', () => {
    // First yearly upgrade keeps start/end; feeding that result back in must still read isYearly.
    const start = now - 265 * DAY
    const end = now + 100 * DAY
    const first = prorateSeats({
      oldAmount: kop(27540),
      oldSeats: 3,
      periodStart: start,
      periodEnd: end,
      now,
      newSeats: 5,
      newFullPrice: kop(45900)
    })
    const second = prorateSeats({
      oldAmount: kop(45900),
      oldSeats: 5,
      periodStart: first.periodStart,
      periodEnd: first.periodEnd,
      now,
      newSeats: 6,
      newFullPrice: kop(55080)
    })
    expect(second.isYearly).toBe(true) // would be false if periodStart had been reset to now
  })

  describe('downgrade', () => {
    // 5 seats @ 900r = 4500r, 30d period, 15 days left. Drop to 2 seats.
    // removed = 3, extraDays = 15 * 3 / 2 = 22.5.
    const end = now + 15 * DAY
    const res = prorateSeats({
      oldAmount: kop(4500),
      oldSeats: 5,
      periodStart: now - 15 * DAY,
      periodEnd: end,
      now,
      newSeats: 2,
      newFullPrice: kop(1800)
    })

    it('charges nothing (no refund)', () => {
      expect(res.charge).toBe(0)
    })
    it('extends the period end by the credit, keeping the start', () => {
      expect(res.periodStart).toBe(now - 15 * DAY)
      expect(res.periodEnd).toBe(Math.ceil(end + 22.5 * DAY))
    })
    it('flags downgrade', () => {
      expect(res.isUpgrade).toBe(false)
    })
  })

  it('never charges below zero when credit exceeds the new full price', () => {
    const res = prorateSeats({
      oldAmount: kop(9000),
      oldSeats: 10,
      periodStart: now,
      periodEnd: now + 30 * DAY,
      now,
      newSeats: 11,
      newFullPrice: kop(9900)
    })
    expect(res.charge).toBeGreaterThanOrEqual(0)
  })

  it('a fresh period (full month left) upgrade charges the exact delta-seat price', () => {
    // 10 seats @ 900r, day 0 of 30. Add 3 -> 3 * 900 * (30/30) = 2700r, no proration discount.
    const res = prorateSeats({
      oldAmount: kop(9000),
      oldSeats: 10,
      periodStart: now,
      periodEnd: now + 30 * DAY,
      now,
      newSeats: 13,
      newFullPrice: kop(11700)
    })
    expect(res.charge).toBe(kop(2700))
  })

  it('an expired period (no days left) upgrade charges nothing now', () => {
    // now == periodEnd: daysLeft = 0, so the added seats cost 0 until the next renewal.
    const res = prorateSeats({
      oldAmount: kop(9000),
      oldSeats: 10,
      periodStart: now - 30 * DAY,
      periodEnd: now,
      now,
      newSeats: 13,
      newFullPrice: kop(11700)
    })
    expect(res.charge).toBe(0)
  })

  it('charge scales linearly with the number of added seats', () => {
    const base = {
      oldAmount: kop(9000),
      oldSeats: 10,
      periodStart: now - 10 * DAY,
      periodEnd: now + 20 * DAY,
      now,
      newFullPrice: 0 // unused by the upgrade branch
    }
    const add2 = prorateSeats({ ...base, newSeats: 12 }).charge
    const add4 = prorateSeats({ ...base, newSeats: 14 }).charge
    expect(add4).toBe(add2 * 2)
  })

  it('a paid yearly rate carries the discount into the per-seat upgrade charge', () => {
    // 10 seats yearly for 8415r (15% off 9900), 365d, 100 left. Adding 2 uses the DISCOUNTED paid
    // rate (8415/10/365), not the list price -> cheaper than 2 * full monthly.
    const oldAmount = kop(8415)
    const res = prorateSeats({
      oldAmount,
      oldSeats: 10,
      periodStart: now - 265 * DAY,
      periodEnd: now + 100 * DAY,
      now,
      newSeats: 12,
      newFullPrice: kop(10098)
    })
    const paidRate = oldAmount / 10 / 365
    expect(res.charge).toBe(Math.floor(Math.floor(2 * paidRate * 100) / 100) * 100)
    expect(res.isYearly).toBe(true)
  })
})

describe('proratePackage', () => {
  const now = 1_000_000_000_000

  describe('bigger package (upgrade)', () => {
    // 100Gb @ 1000r -> 500Gb @ 5000r, 15d left of 30d. Charge only the price diff for the remaining
    // half-period: (5000-1000)/30*15 = 2000r. Renewal date stays put.
    const res = proratePackage({
      oldAmount: kop(1000),
      periodStart: now - 15 * DAY,
      periodEnd: now + 15 * DAY,
      now,
      newFullPrice: kop(5000)
    })

    it('charges only the price difference pro-rata for the remaining days', () => {
      expect(res.charge).toBe(kop(2000))
    })
    it('keeps the period unchanged (start AND end)', () => {
      expect(res.periodStart).toBe(now - 15 * DAY)
      expect(res.periodEnd).toBe(now + 15 * DAY)
    })
    it('flags upgrade', () => {
      expect(res.isUpgrade).toBe(true)
    })
  })

  it('a fresh period upgrade charges exactly the full price difference, not more', () => {
    // Day 0 of 30, full month left: (5000-1000)/30*30 = 4000. The old formula billed 4500.
    const res = proratePackage({
      oldAmount: kop(1000),
      periodStart: now,
      periodEnd: now + 30 * DAY,
      now,
      newFullPrice: kop(5000)
    })
    expect(res.charge).toBe(kop(4000))
  })

  it('an expired package period upgrade charges nothing now', () => {
    // now == periodEnd: daysLeft = 0 -> no charge until the next renewal bills the full new price.
    const res = proratePackage({
      oldAmount: kop(1000),
      periodStart: now - 30 * DAY,
      periodEnd: now,
      now,
      newFullPrice: kop(5000)
    })
    expect(res.charge).toBe(0)
  })

  it('a yearly package upgrade prorates over the long period and keeps the renewal date', () => {
    // 365d period, 100 left. Diff 4000r over the year -> 4000/365*100, floored. Period unchanged.
    const start = now - 265 * DAY
    const end = now + 100 * DAY
    const res = proratePackage({
      oldAmount: kop(1000),
      periodStart: start,
      periodEnd: end,
      now,
      newFullPrice: kop(5000)
    })
    // 400000 kop diff / 365 * 100 days = 109589.04 kop, floored to whole rubles = 109500 (1095r).
    expect(res.charge).toBe(109500)
    expect(res.isYearly).toBe(true)
    expect(res.periodStart).toBe(start)
    expect(res.periodEnd).toBe(end)
  })

  describe('smaller package (downgrade)', () => {
    // 5000r -> 1000r, 30d period, 15 days left. Price drop 4000r -> extraDays = 15 * 4000/1000 = 60.
    const end = now + 15 * DAY
    const res = proratePackage({
      oldAmount: kop(5000),
      periodStart: now - 15 * DAY,
      periodEnd: end,
      now,
      newFullPrice: kop(1000)
    })

    it('charges nothing (no refund)', () => {
      expect(res.charge).toBe(0)
    })
    it('extends the period end by the credit, keeping the start', () => {
      expect(res.periodStart).toBe(now - 15 * DAY)
      expect(res.periodEnd).toBe(Math.ceil(end + 60 * DAY))
    })
    it('flags downgrade', () => {
      expect(res.isUpgrade).toBe(false)
    })
  })
})
