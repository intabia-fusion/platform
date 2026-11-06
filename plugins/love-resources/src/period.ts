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

// The dialog and the meeting card speak in "every N days/weeks/months", the calendar speaks in
// recurrence rules. The two directions live here, apart from the component code, so they are the
// same conversion everywhere and can be tested without a browser.

const DAY_MS = 24 * 60 * 60 * 1000
const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

/** The period of a rule in milliseconds, something the editor can show as a number and a unit. */
export function ruleToPeriod (rule: RecurringRule | undefined): number {
  if (rule === undefined) return 7 * DAY_MS
  const interval: number = Math.max(1, rule.interval ?? 1)
  switch (rule.freq) {
    case 'DAILY':
      return interval * DAY_MS
    case 'WEEKLY':
      return interval * 7 * DAY_MS
    case 'MONTHLY':
      return interval * 30 * DAY_MS
    case 'YEARLY':
      return interval * 12 * 30 * DAY_MS
    default:
      return 7 * DAY_MS
  }
}

/** The rule that repeats every `period`, anchored on the weekday or the day of month it starts on. */
export function periodRules (date: Timestamp, period: number): RecurringRule[] {
  const WEEK = 7 * DAY_MS
  const MONTH = 30 * DAY_MS
  if (period >= MONTH && period % MONTH === 0) {
    return [{ freq: 'MONTHLY', interval: period / MONTH, byMonthDay: [new Date(date).getDate()] }]
  }
  if (period >= WEEK && period % WEEK === 0) {
    return [{ freq: 'WEEKLY', interval: period / WEEK, byDay: [WEEKDAYS[new Date(date).getDay()]] }]
  }
  return [{ freq: 'DAILY', interval: Math.max(1, Math.round(period / DAY_MS)) }]
}

/**
 * The rule with a new period but the same ending: a card that changes "every week" to "every month"
 * must not silently drop "until the 1st of December" or "after 10 times".
 */
export function retimedRules (date: Timestamp, period: number, previous?: RecurringRule): RecurringRule[] {
  const [base] = periodRules(date, period)
  return [
    {
      ...base,
      endDate: previous?.endDate,
      count: previous?.count
    }
  ]
}

/**
 * The first occurrence that is still ahead of `now`. A meeting without a period has a single one:
 * its start date, which is in the past once the meeting has begun.
 */
export function nextOccurrence (date: Timestamp, period: number | undefined, now: Timestamp): Timestamp | undefined {
  if (date >= now) return date
  if (period === undefined || period <= 0) return undefined
  return date + Math.ceil((now - date) / period) * period
}
