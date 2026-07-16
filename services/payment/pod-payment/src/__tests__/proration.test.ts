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
    // 3 seats @ 900r = 2700r, 30d period, 15 days left. Add 2 seats -> full price 5 * 900 = 4500r.
    // unused credit = 2700 * 15/30 = 1350r. charge = 4500 - 1350 = 3150r. Fresh 30d period.
    const res = prorateSeats({
      oldAmount: kop(2700),
      oldSeats: 3,
      periodStart: now - 15 * DAY,
      periodEnd: now + 15 * DAY,
      now,
      newSeats: 5,
      newFullPrice: kop(4500)
    })

    it('charges new full price minus unused credit', () => {
      expect(res.charge).toBe(kop(3150))
    })
    it('resets the period to now + 30d', () => {
      expect(res.periodEnd).toBe(now + 30 * DAY)
    })
    it('flags upgrade, not yearly', () => {
      expect(res.isUpgrade).toBe(true)
      expect(res.isYearly).toBe(false)
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

    it('charges only delta seats for the remaining days at the paid (discounted) rate', () => {
      const paidRate = oldAmount / 3 / 365
      expect(res.charge).toBe(Math.floor(2 * paidRate * 100))
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

  it('monthly upgrade resets periodStart to now', () => {
    const res = prorateSeats({
      oldAmount: kop(2700),
      oldSeats: 3,
      periodStart: now - 15 * DAY,
      periodEnd: now + 15 * DAY,
      now,
      newSeats: 5,
      newFullPrice: kop(4500)
    })
    expect(res.periodStart).toBe(now)
    expect(res.periodEnd).toBe(now + 30 * DAY)
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
})

describe('proratePackage', () => {
  const now = 1_000_000_000_000

  describe('bigger package (upgrade)', () => {
    // 100Gb @ 1000r, 30d period, 15 days left. Switch to 500Gb @ 5000r.
    // unused credit = 1000 * 15/30 = 500r. charge = 5000 - 500 = 4500r. Fresh 30d.
    const res = proratePackage({
      oldAmount: kop(1000),
      periodStart: now - 15 * DAY,
      periodEnd: now + 15 * DAY,
      now,
      newFullPrice: kop(5000)
    })

    it('charges the new price minus the unused credit', () => {
      expect(res.charge).toBe(kop(4500))
    })
    it('resets the period to now + 30d (start AND end)', () => {
      expect(res.periodStart).toBe(now)
      expect(res.periodEnd).toBe(now + 30 * DAY)
    })
    it('flags upgrade', () => {
      expect(res.isUpgrade).toBe(true)
    })
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
