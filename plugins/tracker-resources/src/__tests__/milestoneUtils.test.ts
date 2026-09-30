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
  computeSchedule,
  getWorkHoursBetween,
  isDueNotBeforeStart,
  milestoneStats,
  pickDueDate
} from '../milestoneUtils'

const at = (y: number, m: number, d: number, h = 0): number => new Date(y, m - 1, d, h).getTime()
// 2026-10-05 is Monday, 10-03 Saturday
const MON = at(2026, 10, 5)

describe('getWorkHoursBetween', () => {
  it('counts calendar days, ignoring time of day', () => {
    expect(getWorkHoursBetween(at(2026, 10, 5, 15), at(2026, 10, 6))).toBe(16)
  })
  it('skips weekends', () => {
    expect(getWorkHoursBetween(at(2026, 10, 2), at(2026, 10, 5))).toBe(16)
  })
})

describe('isDueNotBeforeStart', () => {
  it('same day due 00:00 vs start 15:00 is fine', () => {
    expect(isDueNotBeforeStart(at(2026, 10, 5, 15), MON)).toBe(true)
  })
  it('earlier day is not', () => {
    expect(isDueNotBeforeStart(at(2026, 10, 6), MON)).toBe(false)
  })
})

describe('computeSchedule', () => {
  it('moves a weekend start to Monday', () => {
    expect(computeSchedule(at(2026, 10, 3, 10), 0, 8)).toEqual({ start: MON, end: MON })
    expect(computeSchedule(at(2026, 10, 4), 0, 16)).toEqual({ start: MON, end: at(2026, 10, 6) })
  })
  it('uses now without milestone start', () => {
    expect(computeSchedule(undefined, at(2026, 10, 5, 13), 1).start).toBe(MON)
  })
  it.each([
    [undefined, 5],
    [0, 5],
    [8, 5],
    [9, 6],
    [40, 9]
  ])('estimation %s ends on Oct %s', (est, endDay) => {
    expect(computeSchedule(MON, 0, est).end).toBe(at(2026, 10, endDay))
  })
})

describe('pickDueDate', () => {
  it('keeps existing due >= start', () => {
    expect(pickDueDate(at(2026, 10, 9), MON, at(2026, 10, 6))).toBe(at(2026, 10, 9))
  })
  it('replaces missing or earlier due', () => {
    expect(pickDueDate(undefined, MON, at(2026, 10, 6))).toBe(at(2026, 10, 6))
    expect(pickDueDate(at(2026, 10, 1), MON, at(2026, 10, 6))).toBe(at(2026, 10, 6))
  })
})

describe('milestoneStats', () => {
  const issues = [
    { status: 'w', estimation: 8, reportedTime: 8 },
    { status: 'l', estimation: 4 },
    { status: 'a', estimation: 10, reportedTime: 4 },
    { status: 'a', estimation: 1, reportedTime: 3 }
  ]
  const cat = (i: { status: string }): 'won' | 'lost' | undefined =>
    i.status === 'w' ? 'won' : i.status === 'l' ? 'lost' : undefined
  it('aggregates', () => {
    expect(milestoneStats(issues, cat)).toEqual({
      count: 4,
      done: 1,
      canceled: 1,
      percent: 33,
      estimation: 23,
      reported: 15,
      remaining: 6
    })
  })
  it('is 0% without statuses resolved', () => {
    expect(milestoneStats(issues, () => undefined).percent).toBe(0)
  })
  it('empty', () => {
    expect(milestoneStats([], cat).percent).toBe(0)
  })
})
