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

import { MILLISECONDS_IN_DAY, isWeekend } from './components/calendar/internal/DateUtils'

export type DragMode = 'move' | 'start' | 'end'

export function getDateByOffset (currentTime: number, dayWidth: number, x: number): { date: Date, delta: number } {
  const deltaDays = Math.floor(x / dayWidth)
  const date = new Date(currentTime)
  date.setDate(date.getDate() + deltaDays)
  return { date, delta: deltaDays }
}

export function getOffsetByDate (currentTime: number, dayWidth: number, date: number | Date): number {
  const tempDay = new Date(date).setHours(0, 0, 0, 0)
  // Both are local midnights, a DST day is 23/25h long
  return Math.round((tempDay - currentTime) / MILLISECONDS_IN_DAY) * dayWidth
}

export function getNextWeek (date: Date, reverse?: boolean): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + (reverse === true ? -7 : 7))
  return d
}

export function getDays (from: Date, to: Date): Date[] {
  const res: Date[] = []
  const end = to.getTime()
  // Midnight start, so a trailing day with time 00:00 in `to` is not skipped
  const d = new Date(from)
  d.setHours(0, 0, 0, 0)
  for (; d.getTime() <= end; d.setDate(d.getDate() + 1)) res.push(new Date(d))
  return res
}

export function getWeekends (from: Date, to: Date): Date[] {
  return getDays(from, to).filter(isWeekend)
}

export function addDays (ts: number, days: number): number {
  const d = new Date(ts)
  d.setDate(d.getDate() + days)
  return d.setHours(0, 0, 0, 0)
}

// Keeps start <= target while dragging
export function clampDragDays (mode: DragMode, days: number, startDate: number, targetDate: number | undefined): number {
  if (targetDate === undefined || mode === 'move') return days
  const span = Math.round((targetDate - startDate) / MILLISECONDS_IN_DAY)
  return mode === 'start' ? Math.min(days, span) : Math.max(days, -span)
}

export function getBounds (
  startDate: number,
  targetDate: number | undefined,
  d: { mode: DragMode, days: number } | undefined
): { start: number, target?: number } {
  if (d === undefined || d.days === 0) return { start: startDate, target: targetDate }
  const start = d.mode === 'end' ? startDate : addDays(startDate, d.days)
  if (targetDate === undefined || d.mode === 'start') return { start, target: targetDate }
  return { start, target: Math.max(addDays(targetDate, d.days), start) }
}

export const PENDING_TIMEOUT_MS = 3000

// A dropped bar keeps its new bounds until the incoming item shows them, or the write is assumed lost
export function keepPending (
  item: { startDate: number, targetDate?: number },
  pending: { start: number, target?: number },
  elapsedMs: number
): boolean {
  if (elapsedMs >= PENDING_TIMEOUT_MS) return false
  return item.startDate !== pending.start || item.targetDate !== pending.target
}

export function clampLane (lane: number, lanes: number | undefined): number {
  return Math.min(lane, (lanes ?? 1) - 1)
}
