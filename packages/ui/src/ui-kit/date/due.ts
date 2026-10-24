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

import DueDatePopup from '../../components/calendar/DueDatePopup.svelte'
import {
  getDaysDifference,
  getDueDateIconModifier,
  getFormattedDate
} from '../../components/calendar/internal/DateUtils'
import type { LabelAndProps } from '../../types'
import type { DateTone } from './types'

export interface DueState {
  tone: DateTone | undefined
  tooltip: LabelAndProps | undefined
}

/** Tone and hover hint of a due date: today is `critical`, the next days `warning`, a past day `overdue`. */
export function getDueState (
  value: number | null | undefined,
  ignoreOverdue: boolean,
  now: Date = new Date()
): DueState {
  if (value === null || value === undefined || Number.isNaN(value)) return { tone: undefined, tooltip: undefined }
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const isOverdue = value < today.getTime()
  const daysDifference = getDaysDifference(new Date(today), new Date(value))
  const modifier = getDueDateIconModifier(isOverdue, daysDifference, ignoreOverdue)
  return {
    tone: modifier === 'normal' ? undefined : modifier,
    tooltip: {
      direction: 'top',
      component: DueDatePopup,
      props: {
        formattedDate: getFormattedDate(value),
        daysDifference,
        isOverdue,
        iconModifier: modifier,
        shouldIgnoreOverdue: ignoreOverdue
      }
    }
  }
}
