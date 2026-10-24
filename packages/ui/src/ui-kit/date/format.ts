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

import { DateRangeMode } from '@hcengineering/core'

import { formatDate } from '../../components/calendar/internal/DateUtils'

/** The date and the time of a value, each present only if the mode shows it. */
export interface DateValueParts {
  date?: string
  time?: string
}

/** The date in the locale order (the year only if not the current one) and `HH:MM`; `TIME`, `TIMEONLY` - only time. */
export function formatDateParts (value: number, mode: DateRangeMode, now: Date = new Date()): DateValueParts {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return {}
  const timeOnly = mode === DateRangeMode.TIMEONLY || mode === DateRangeMode.TIME
  return {
    date: timeOnly ? undefined : formatDate(date, date.getFullYear() !== now.getFullYear()),
    time: mode === DateRangeMode.DATE ? undefined : `${pad(date.getHours())}:${pad(date.getMinutes())}`
  }
}

/** The same as one string, the date and the time joined by a space. */
export function formatDateValue (value: number, mode: DateRangeMode, now: Date = new Date()): string {
  const { date, time } = formatDateParts(value, mode, now)
  return [date, time].filter((part) => part !== undefined).join(' ')
}

function pad (value: number): string {
  return value.toString().padStart(2, '0')
}
