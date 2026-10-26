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

import activity, { type CreatePollParams } from '@hcengineering/activity'
import { type Timestamp } from '@hcengineering/core'
import { type IntlString } from '@hcengineering/platform'

export const MINUTE_MS = 60 * 1000
export const HOUR_MS = 60 * MINUTE_MS
export const DAY_MS = 24 * HOUR_MS
// setTimeout overflows above ~24.8 days.
export const MAX_TIMER_DELAY = 2 ** 31 - 1

export const POLL_TIME_PRESETS: number[] = [1, 3, 8, 24, 72].map((it) => it * HOUR_MS)

type PollTimeParams = Pick<CreatePollParams, 'startAt' | 'startDelay' | 'endAt' | 'duration'>

// A preset counts from the sending, a duration from the start.
export function resolvePollTimes (params: PollTimeParams, now: Timestamp): { startAt?: Timestamp, endAt?: Timestamp } {
  const startAt = params.startDelay != null ? now + params.startDelay : (params.startAt ?? undefined)
  const endAt = params.duration != null ? (startAt ?? now) + params.duration : (params.endAt ?? undefined)
  return { startAt, endAt }
}

// A start in the past is no error: the poll just opens at once.
export function getPollTimeError (params: PollTimeParams, now: Timestamp): IntlString | undefined {
  const { startAt, endAt } = resolvePollTimes(params, now)
  if (endAt == null) return undefined
  if (startAt != null && endAt <= startAt) return activity.string.EndBeforeStart
  if (endAt <= now) return activity.string.EndInPast
  return undefined
}

// An exact end stays put while the sending of a draft moves on.
export function getPollTimeErrorFrom (params: PollTimeParams): Timestamp | undefined {
  if (params.duration != null) {
    return params.startDelay == null && params.startAt != null ? params.startAt + params.duration : undefined
  }
  return params.endAt != null ? params.endAt - (params.startDelay ?? 0) : undefined
}

export function toTimeUnit (ms: number): { value: number, unit: 'minute' | 'hour' | 'day' } {
  // Minutes round up: "in 0 minutes" would show while the poll is still open.
  const minutes = Math.ceil(ms / MINUTE_MS)
  if (minutes < 60) return { value: Math.max(1, minutes), unit: 'minute' }
  // Up to 24 hours: the poll set for "24 hours" reads so, not "in 1 day".
  const hours = Math.round(ms / HOUR_MS)
  if (hours <= 24) return { value: hours, unit: 'hour' }
  return { value: Math.round(ms / DAY_MS), unit: 'day' }
}

// A label in hours may change each minute, one in days each hour.
export function getTimeUnitStep (ms: number): number {
  return ms < 2 * DAY_MS ? MINUTE_MS : HOUR_MS
}
