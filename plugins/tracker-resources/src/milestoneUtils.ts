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

const HOURS_IN_WORK_DAY = 8

const isWeekendDay = (d: Date): boolean => d.getDay() === 0 || d.getDay() === 6

const startOfDay = (ts: number): Date => {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d
}

const nextWorkday = (d: Date): Date => {
  while (isWeekendDay(d)) d.setDate(d.getDate() + 1)
  return d
}

/**
 * Hours of the work days (Mon-Fri) from `start` to `end`, both calendar days included.
 */
export function getWorkHoursBetween (start: number, end: number): number {
  const last = startOfDay(end).getTime()
  let days = 0
  for (const d = startOfDay(start); d.getTime() <= last; d.setDate(d.getDate() + 1)) {
    if (!isWeekendDay(d)) days++
  }
  return days * HOURS_IN_WORK_DAY
}

/** Due date is not before the start day, so the dates-based estimate makes sense. */
export function isDueNotBeforeStart (start: number, due: number): boolean {
  return startOfDay(due).getTime() >= startOfDay(start).getTime()
}

/**
 * Start: first work day (midnight) from the milestone start; end: start plus as many work days as the estimation covers.
 */
export function computeSchedule (
  milestoneStart: number | undefined,
  now: number,
  estimationHours: number | undefined
): { start: number, end: number } {
  const start = nextWorkday(startOfDay(milestoneStart ?? now))
  let days = Math.max(1, Math.ceil((estimationHours ?? 0) / HOURS_IN_WORK_DAY))
  const end = new Date(start)
  while (--days > 0) {
    end.setDate(end.getDate() + 1)
    nextWorkday(end)
  }
  return { start: start.getTime(), end: end.getTime() }
}

/** Keeps an existing due date that is not before the start day. */
export function pickDueDate (existing: number | null | undefined, start: number, computedEnd: number): number {
  return existing != null && isDueNotBeforeStart(start, existing) ? existing : computedEnd
}

export interface MilestoneIssueLike {
  status: unknown
  estimation?: number
  reportedTime?: number
}

export interface MilestoneStats {
  count: number
  done: number
  canceled: number
  percent: number
  estimation: number
  reported: number
  remaining: number
}

/**
 * Progress of a milestone from its issues; `categoryOf` maps an issue to 'won' | 'lost' | undefined.
 */
export function milestoneStats<T extends MilestoneIssueLike> (
  issues: T[],
  categoryOf: (issue: T) => 'won' | 'lost' | undefined
): MilestoneStats {
  let done = 0
  let canceled = 0
  let estimation = 0
  let reported = 0
  let remaining = 0
  for (const it of issues) {
    const c = categoryOf(it)
    if (c === 'won') done++
    else if (c === 'lost') canceled++
    else remaining += Math.max(0, (it.estimation ?? 0) - (it.reportedTime ?? 0))
    estimation += it.estimation ?? 0
    reported += it.reportedTime ?? 0
  }
  const countable = issues.length - canceled
  return {
    count: issues.length,
    done,
    canceled,
    percent: countable > 0 ? Math.round((done * 100) / countable) : 0,
    estimation,
    reported,
    remaining
  }
}
