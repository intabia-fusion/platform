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

import ui, { type DropdownIntlItem } from '@hcengineering/ui'

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * The lead times a reminder is picked from. A reminder is chosen, not invented, so the list is short
 * and every value reads in one word: "15 minutes", "1 hour", "1 day".
 */
export const REMINDER_PRESETS: number[] = [5 * MINUTE, 10 * MINUTE, 15 * MINUTE, 30 * MINUTE, HOUR, 2 * HOUR, DAY]

type Unit = 'minutes' | 'hours' | 'days'

/** A lead time as a number and the unit that says it with the smallest number. */
export function splitReminder (msec: number): { unit: Unit, count: number } {
  if (msec < HOUR) return { unit: 'minutes', count: Math.max(1, Math.round(msec / MINUTE)) }
  if (msec < DAY) return { unit: 'hours', count: Math.round(msec / HOUR) }
  return { unit: 'days', count: Math.round(msec / DAY) }
}

const LABELS: Record<Unit, typeof ui.string.Minutes> = {
  minutes: ui.string.Minutes,
  hours: ui.string.Hours,
  days: ui.string.Days
}

/**
 * `params` is what the legacy dropdowns read, `labelParams` is the UI kit's field for the same
 * thing: one item serves both lists.
 */
export interface ReminderItem extends DropdownIntlItem<number> {
  labelParams: Record<string, any>
}

export function reminderItem (msec: number): ReminderItem {
  const { unit, count } = splitReminder(msec)
  const params = { [unit]: count }
  return { id: msec, label: LABELS[unit], params, labelParams: params }
}
