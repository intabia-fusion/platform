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

import type { LabelAndProps } from '../../types'

/** Which month arrows the header shows: two calendars side by side split them. */
export type CalendarNavigation = 'both' | 'previous' | 'next' | 'none'

/** A range of days; `end` stays `null` until the second day is picked. */
export interface CalendarRange {
  start: number
  end: number | null
}

export interface CalendarProps {
  /** The picked day (a timestamp), or the start of the range with `range`. */
  value?: number | null
  /** With `range`: the last day of the range. */
  end?: number | null
  /** Clicks build a range: the first click starts it, the second ends it, the third starts a new one. */
  range?: boolean
  /** Any timestamp of the month shown; by default the month of `value` or of today. */
  month?: number
  navigation?: CalendarNavigation
  /** Days are highlighted as seen in this time zone; by default the user's one. */
  timeZone?: string
  /** The year after the month name in the header; off where the year is shown once for many months. */
  showYear?: boolean
  /** Tints the weekend columns, as app views of many months do. */
  weekends?: boolean
  /** A dot under the number of a day that has something, such as events. */
  marked?: (date: Date) => boolean
  /** A tooltip of a day: what it has. */
  dayTooltip?: (date: Date) => LabelAndProps | undefined
  'aria-label'?: string
}

export interface CalendarEvents {
  /** The clicked day at the time of day of `value`. */
  select: CustomEvent<number>
  /** With `range`: the range after the click. */
  range: CustomEvent<CalendarRange>
  /** The first day of the month now shown. */
  navigate: CustomEvent<number>
}
