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

/** A year of an app view: twelve month calendars in a grid that follows the width. */
export interface YearViewProps {
  /** Any timestamp of the year shown; by default the year of `value` or of today. */
  year?: number
  /** The picked day (a timestamp). */
  value?: number | null
  /** A dot under the number of a day that has something, such as events. */
  marked?: (date: Date) => boolean
  /** A tooltip of a day: what it has. */
  dayTooltip?: (date: Date) => LabelAndProps | undefined
  'aria-label'?: string
}

export interface YearViewEvents {
  /** The clicked day, at the time of day of `value`. */
  select: CustomEvent<number>
}
