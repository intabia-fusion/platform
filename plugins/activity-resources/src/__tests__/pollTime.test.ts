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

import activity from '@hcengineering/activity'

import {
  DAY_MS,
  getPollTimeError,
  getPollTimeErrorFrom,
  HOUR_MS,
  MINUTE_MS,
  resolvePollTimes,
  toTimeUnit
} from '../pollTime'

const now = 1_000_000_000_000

describe('poll time', () => {
  it('counts presets from the sending and a duration from the start', () => {
    expect(resolvePollTimes({}, now)).toEqual({ startAt: undefined, endAt: undefined })
    expect(resolvePollTimes({ duration: HOUR_MS }, now)).toEqual({ startAt: undefined, endAt: now + HOUR_MS })
    expect(resolvePollTimes({ startDelay: HOUR_MS, duration: 3 * HOUR_MS }, now)).toEqual({
      startAt: now + HOUR_MS,
      endAt: now + 4 * HOUR_MS
    })
    expect(resolvePollTimes({ startAt: now + DAY_MS, duration: HOUR_MS }, now)).toEqual({
      startAt: now + DAY_MS,
      endAt: now + DAY_MS + HOUR_MS
    })
    expect(resolvePollTimes({ startAt: now + 5, endAt: now + 10 }, now)).toEqual({ startAt: now + 5, endAt: now + 10 })
  })

  it('keeps a draft with presets valid however long it waits', () => {
    const draft = { startDelay: HOUR_MS, duration: HOUR_MS }
    expect(getPollTimeError(draft, now + 30 * DAY_MS)).toBeUndefined()
  })

  it('refuses an exact end that has passed or comes before the start', () => {
    expect(getPollTimeError({ endAt: now }, now)).toBe(activity.string.EndInPast)
    expect(getPollTimeError({ startDelay: 3 * HOUR_MS, endAt: now + HOUR_MS }, now)).toBe(
      activity.string.EndBeforeStart
    )
    // A start in the past only opens the poll at once.
    expect(getPollTimeError({ startAt: now - DAY_MS, endAt: now + HOUR_MS }, now)).toBeUndefined()
  })

  it('tells from when a waiting draft would fail', () => {
    const drafts = [
      { endAt: now + DAY_MS },
      { startDelay: HOUR_MS, endAt: now + DAY_MS },
      { startAt: now + HOUR_MS, duration: HOUR_MS }
    ]
    for (const draft of drafts) {
      const from = getPollTimeErrorFrom(draft) as number
      expect(getPollTimeError(draft, from - 1)).toBeUndefined()
      expect(getPollTimeError(draft, from)).toBeDefined()
    }
    expect(getPollTimeErrorFrom({ startDelay: HOUR_MS, duration: HOUR_MS })).toBeUndefined()
    expect(getPollTimeErrorFrom({})).toBeUndefined()
  })

  it('shows the time left in one unit, never as zero', () => {
    expect(toTimeUnit(1)).toEqual({ value: 1, unit: 'minute' })
    expect(toTimeUnit(20 * MINUTE_MS)).toEqual({ value: 20, unit: 'minute' })
    // Just after a "1 hour" poll is sent.
    expect(toTimeUnit(HOUR_MS - 1000)).toEqual({ value: 1, unit: 'hour' })
    expect(toTimeUnit(DAY_MS - 1000)).toEqual({ value: 24, unit: 'hour' })
    expect(toTimeUnit(3 * DAY_MS - 1000)).toEqual({ value: 3, unit: 'day' })
  })
})
