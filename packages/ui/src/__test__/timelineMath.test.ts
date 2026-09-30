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

import { describe, expect, it } from 'vitest'
import {
  addDays,
  clampDragDays,
  clampLane,
  getBounds,
  getDateByOffset,
  getNextWeek,
  getOffsetByDate,
  getWeekends,
  keepPending,
  PENDING_TIMEOUT_MS
} from '../timelineMath'

// Imports are hoisted, but nothing here touches Date at load time; Node re-reads TZ on assignment.
process.env.TZ = 'Europe/Berlin'

const DW = 10
const midnight = (y: number, m: number, d: number): number => new Date(y, m, d).getTime()

describe('timelineMath', () => {
  it('runs in a DST timezone', () => {
    expect(new Date(2026, 0, 1).getTimezoneOffset()).not.toBe(new Date(2026, 6, 1).getTimezoneOffset())
  })

  it('getOffsetByDate counts whole days across spring DST', () => {
    const cur = midnight(2026, 2, 25)
    expect(getOffsetByDate(cur, DW, midnight(2026, 2, 30))).toBe(5 * DW)
    expect(getOffsetByDate(cur, DW, midnight(2026, 3, 5))).toBe(11 * DW)
  })

  it('getDateByOffset returns local midnight across autumn DST', () => {
    const cur = midnight(2026, 9, 20)
    const { date, delta } = getDateByOffset(cur, DW, 10 * DW)
    expect(delta).toBe(10)
    expect(date.getTime()).toBe(midnight(2026, 9, 30))
  })

  it('getNextWeek keeps local midnight across both transitions', () => {
    expect(getNextWeek(new Date(2026, 2, 25)).getTime()).toBe(midnight(2026, 3, 1))
    expect(getNextWeek(new Date(2026, 9, 28)).getTime()).toBe(midnight(2026, 10, 4))
    expect(getNextWeek(new Date(2026, 3, 1), true).getTime()).toBe(midnight(2026, 2, 25))
    expect(getNextWeek(new Date(2026, 10, 4), true).getTime()).toBe(midnight(2026, 9, 28))
  })

  it('getWeekends includes a trailing weekend day when from has a time of day', () => {
    // Fri 10:00 .. Sun midnight
    const res = getWeekends(new Date(2026, 5, 5, 10), new Date(2026, 5, 7))
    expect(res.map((d) => d.getDate())).toEqual([6, 7])
  })

  it('end-mode drag never moves target before start with a time-of-day start', () => {
    const start = new Date(2026, 5, 10, 10).getTime()
    const target = midnight(2026, 5, 11)
    const days = clampDragDays('end', -5, start, target)
    const b = getBounds(start, target, { mode: 'end', days })
    expect(b.target).toBeGreaterThanOrEqual(b.start)
  })

  it('start/move drags shift by whole days', () => {
    const s = midnight(2026, 2, 28)
    expect(getBounds(s, midnight(2026, 3, 2), { mode: 'move', days: 2 })).toEqual({
      start: midnight(2026, 2, 30),
      target: midnight(2026, 3, 4)
    })
    expect(addDays(s, 1)).toBe(midnight(2026, 2, 29))
  })

  it('clampLane limits lane to the row lanes, default one lane', () => {
    expect(clampLane(3, undefined)).toBe(0)
    expect(clampLane(5, 2)).toBe(1)
    expect(clampLane(1, 3)).toBe(1)
  })

  it('keepPending holds while the item shows old dates, drops once they match or on timeout', () => {
    const p = { start: 100, target: 200 }
    expect(keepPending({ startDate: 50, targetDate: 150 }, p, 10)).toBe(true)
    expect(keepPending({ startDate: 100, targetDate: 150 }, p, 10)).toBe(true)
    expect(keepPending({ startDate: 100, targetDate: 200 }, p, 10)).toBe(false)
    expect(keepPending({ startDate: 50, targetDate: 150 }, p, PENDING_TIMEOUT_MS)).toBe(false)
    expect(keepPending({ startDate: 100 }, { start: 100 }, 10)).toBe(false)
    expect(keepPending({ startDate: 100, targetDate: 200 }, { start: 100 }, 10)).toBe(true)
  })
})
