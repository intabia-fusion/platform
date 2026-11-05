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
import type { RecurringRule } from '@hcengineering/calendar'
import type { Timestamp } from '@hcengineering/core'
import { periodRules, retimedRules, ruleToPeriod } from '../period'

const DAY = 24 * 60 * 60 * 1000
const WEEK = 7 * DAY
const MONTH = 30 * DAY

// Friday, the 6th of November 2026, 10:00 local time: the weekday and the day of month matter for
// the rules built from a period.
const start = new Date(2026, 10, 6, 10, 0, 0, 0).getTime() as Timestamp

describe('periodRules', () => {
  it('keeps a week as a weekly rule on the weekday of the meeting', () => {
    expect(periodRules(start, WEEK)).toEqual([{ freq: 'WEEKLY', interval: 1, byDay: ['FR'] }])
  })

  it('keeps two weeks as a fortnightly rule', () => {
    expect(periodRules(start, 2 * WEEK)).toEqual([{ freq: 'WEEKLY', interval: 2, byDay: ['FR'] }])
  })

  it('keeps a month as a monthly rule on the day of month of the meeting', () => {
    expect(periodRules(start, MONTH)).toEqual([{ freq: 'MONTHLY', interval: 1, byMonthDay: [6] }])
  })

  it('falls back to days for a period that is neither weeks nor months', () => {
    expect(periodRules(start, 3 * DAY)).toEqual([{ freq: 'DAILY', interval: 3 }])
  })
})

describe('ruleToPeriod', () => {
  it('is the inverse of periodRules for the periods the editor offers', () => {
    for (const period of [DAY, 3 * DAY, WEEK, 2 * WEEK, MONTH, 3 * MONTH]) {
      expect(ruleToPeriod(periodRules(start, period)[0])).toBe(period)
    }
  })

  it('shows a year as months, not as 52 weeks', () => {
    const yearly: RecurringRule = { freq: 'YEARLY', interval: 1 }
    expect(ruleToPeriod(yearly)).toBe(12 * MONTH)
    expect(periodRules(start, ruleToPeriod(yearly))[0].freq).toBe('MONTHLY')
  })

  it('defaults to a week when the meeting has no rule yet', () => {
    expect(ruleToPeriod(undefined)).toBe(WEEK)
  })
})

describe('retimedRules', () => {
  it('replaces the period and keeps the end date', () => {
    const previous: RecurringRule = { freq: 'WEEKLY', interval: 1, byDay: ['FR'], endDate: start + 30 * DAY }
    const [rule] = retimedRules(start, 2 * WEEK, previous)

    expect(rule.freq).toBe('WEEKLY')
    expect(rule.interval).toBe(2)
    expect(rule.endDate).toBe(previous.endDate)
  })

  it('keeps the number of occurrences', () => {
    const previous: RecurringRule = { freq: 'WEEKLY', interval: 1, byDay: ['FR'], count: 10 }
    const [rule] = retimedRules(start, MONTH, previous)

    expect(rule.freq).toBe('MONTHLY')
    expect(rule.count).toBe(10)
    expect(rule.endDate).toBeUndefined()
  })

  it('builds a plain rule when there was none', () => {
    expect(retimedRules(start, WEEK)).toEqual([{ freq: 'WEEKLY', interval: 1, byDay: ['FR'] }])
  })
})
