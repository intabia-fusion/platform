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

import type { DateRangeMode } from '@hcengineering/core'
import type { IntlString } from '@hcengineering/platform'

import type { IconComponent, IconSize, LabelAndProps } from '../../types'
import type { ButtonAttributes, ButtonSize } from '../button/types'
import type { SelectButtonChevron, SelectButtonKind, SelectButtonSize } from '../select-button/types'

/** Color of the calendar icon; `overdue` also swaps it for the crossed calendar. */
export type DateTone = 'warning' | 'critical' | 'overdue'

// `value` of the native button is the date here.
export interface DateSelectProps extends Omit<ButtonAttributes, 'value'> {
  /** A timestamp; `null` or `undefined` - no date. */
  value?: number | null
  /** `DATE` (default), `DATETIME` - the popup picks the time too, `TIME` / `TIMEONLY` - only the time, in the popup too. */
  mode?: DateRangeMode
  /** Shown while there is no date. */
  placeholder?: IntlString
  /** Instead of the calendar icon. */
  icon?: IconComponent
  iconSize?: IconSize
  tone?: DateTone
  /** A due date: the tone follows how close it is, the hover hint tells the days left or overdue. */
  due?: boolean
  /** With `due`: a closed task - no tone and no overdue. */
  ignoreOverdue?: boolean
  kind?: SelectButtonKind
  size?: SelectButtonSize
  chevron?: SelectButtonChevron
  fullWidth?: boolean
  /** Title and hint of the date popup. */
  popupLabel?: IntlString
  popupDetail?: IntlString
  /** Quick shifts in the popup (in 15 minutes, in a day, ...); on by default. */
  shifts?: boolean
  /** Shows the date as the button does, but does not open the popup. */
  readonly?: boolean
  disabled?: boolean
  tooltip?: LabelAndProps
  focusIndex?: number
  element?: HTMLButtonElement
}

export interface DateSelectEvents {
  /** `detail` is the new timestamp, `null` when the date was cleared. */
  change: CustomEvent<number | null>
}

export interface DateLabelProps {
  value?: number | null
  /** `DATE` (default), `DATETIME`, `TIME` or `TIMEONLY` (both show only the time). */
  mode?: DateRangeMode
  /** Shown while there is no date. */
  placeholder?: IntlString
  icon?: IconComponent
  /** On by default. */
  showIcon?: boolean
  tone?: DateTone
  due?: boolean
  ignoreOverdue?: boolean
  tooltip?: LabelAndProps
}

/** Heights match the kit buttons of the same name. */
export type DateInputSize = Exclude<ButtonSize, 'min' | 'extra-large'>

/** `secondary` - a filled field (forms, popups); `ghost` - digits only, filled on hover (a row of an editor). */
export type DateInputKind = 'secondary' | 'ghost'

/** One typed part of the value. */
export type DateInputPart = 'day' | 'month' | 'year' | 'hour' | 'minute'

export interface DateInputProps {
  /** A timestamp; `null` or `undefined` - nothing typed yet. */
  value?: number | null
  /** `DATE` (default) - DD.MM.YYYY, `DATETIME` - with HH:MM, `TIME` / `TIMEONLY` - only HH:MM of the value's day. */
  mode?: DateRangeMode
  kind?: DateInputKind
  size?: DateInputSize
  /** A clear button while there is a value. */
  clearable?: boolean
  /** The parts are typed as seen in this time zone; by default the user's one. */
  timeZone?: string
  disabled?: boolean
  'aria-label'?: string
}

export interface DateInputEvents {
  /** Every complete value typed, `null` when a part was cleared: a DOM event detail cannot be `undefined`. */
  change: CustomEvent<number | null>
  /** Enter: the value as it is now. */
  submit: CustomEvent<number | null>
}

/** What the picker was closed with: `value` (and `end` with `range`) as timestamps, `null` - the date was cleared. */
export interface DatePickerResult {
  value: number | null
  end?: number | null
}

export interface DatePickerProps {
  /** The current date, the start of the range with `range`. */
  value?: number | null
  /** With `range`: the end of the range. */
  end?: number | null
  /** Picks a range of days: two inputs, clicks on the months build the range, Save closes. */
  range?: boolean
  /**
   * `DATE` (default) - a day, closed with its noon UTC as dates are stored; `DATETIME` - a day and time (the input
   * gets HH:MM, a click on a day keeps the time); `TIME` / `TIMEONLY` - only HH:MM of the day of `value` (today
   * without it), no months; not with `range` or `compact`.
   */
  mode?: DateRangeMode
  /** One month and nothing else: a click on a day closes the picker with it, at the time of `value`. */
  compact?: boolean
  /** Title; by default `ui.string.SelectTime` in the time modes, otherwise `ui.string.SelectDate`. Not shown when `compact`. */
  label?: IntlString
  /** A hint under the title. */
  detail?: IntlString
  /** Quick shifts beside the picker (in 15 minutes, in a day, ...), not with `range` or `compact`. */
  shifts?: boolean
  /** The date is typed and shown as seen in this time zone; by default the user's one. */
  timeZone?: string
  /** Focuses the input on open (default); not with `compact`. */
  autofocus?: boolean
}

export interface DatePickerEvents {
  /** The picker is done: a result to apply, or `null` - closed without a change (the close button). */
  close: CustomEvent<DatePickerResult | null>
}
