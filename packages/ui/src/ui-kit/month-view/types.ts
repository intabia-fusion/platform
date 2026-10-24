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

/** How the weekday names of the header are written: `long` - Monday, `short` - Mon, `narrow` - M. */
export type MonthViewWeekdayFormat = 'long' | 'short' | 'narrow'

/** A month of an app view (calendar, schedule): a table of whole weeks, each day a cell with its own content. */
export interface MonthViewProps {
  /** Any timestamp of the month shown; by default the month of `value` or of today. */
  month?: number
  /** The picked day (a timestamp). */
  value?: number | null
  /** Rows of the table, 6 by default: every month fits. */
  weeks?: number
  /** Height of a week row; by default the rows share the height of the view. */
  rowHeight?: string
  weekdayFormat?: MonthViewWeekdayFormat
  'aria-label'?: string
}

export interface MonthViewEvents {
  /** The day whose number was clicked, at its start. */
  select: CustomEvent<number>
  /** PageUp / PageDown or the arrows left the month: the first day of the month now shown. */
  navigate: CustomEvent<number>
}

export interface MonthViewSlots {
  /** Content of a day under its number: events, a count. */
  day: { date: Date, today: boolean, selected: boolean, outside: boolean }
}
