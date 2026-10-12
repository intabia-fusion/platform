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

import { get } from 'svelte/store'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  computeAway,
  DEFAULT_HIDDEN_AFTER_MS,
  DEFAULT_IDLE_AFTER_MS,
  isUserAwayStore,
  presenceReason,
  setSystemIdle,
  startActivityTracking
} from '../presence'

const thresholds = { idleAfterMs: DEFAULT_IDLE_AFTER_MS, hiddenAfterMs: DEFAULT_HIDDEN_AFTER_MS }

describe('computeAway', () => {
  it('is not away right after input in a visible window', () => {
    expect(computeAway({ lastInput: 1000, hiddenSince: undefined, systemIdle: false }, 1000, thresholds)).toBe(false)
  })

  it('is away after the idle threshold without input', () => {
    const state = { lastInput: 0, hiddenSince: undefined, systemIdle: false }
    expect(computeAway(state, DEFAULT_IDLE_AFTER_MS - 1, thresholds)).toBe(false)
    expect(computeAway(state, DEFAULT_IDLE_AFTER_MS, thresholds)).toBe(true)
  })

  it('is away a minute after the window is hidden, whatever the input says', () => {
    const state = { lastInput: 100, hiddenSince: 100, systemIdle: false }
    expect(computeAway(state, 100 + DEFAULT_HIDDEN_AFTER_MS - 1, thresholds)).toBe(false)
    expect(computeAway(state, 100 + DEFAULT_HIDDEN_AFTER_MS, thresholds)).toBe(true)
  })

  it('is away while the system is idle (locked screen, sleep)', () => {
    expect(computeAway({ lastInput: 1000, hiddenSince: undefined, systemIdle: true }, 1000, thresholds)).toBe(true)
  })
})

describe('presenceReason', () => {
  it('names what made the person away, system idle first', () => {
    expect(presenceReason({ lastInput: 0, hiddenSince: 0, systemIdle: true }, DEFAULT_IDLE_AFTER_MS, thresholds)).toBe(
      'system-idle'
    )
    expect(presenceReason({ lastInput: 0, hiddenSince: 0, systemIdle: false }, DEFAULT_IDLE_AFTER_MS, thresholds)).toBe(
      'hidden'
    )
    expect(
      presenceReason({ lastInput: 0, hiddenSince: undefined, systemIdle: false }, DEFAULT_IDLE_AFTER_MS, thresholds)
    ).toBe('idle')
    expect(presenceReason({ lastInput: 0, hiddenSince: undefined, systemIdle: false }, 0, thresholds)).toBe('active')
  })
})

describe('activity tracking', () => {
  let hidden = false
  let stop: () => void = () => {}

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(1_000_000))
    hidden = false
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
    stop = startActivityTracking()
  })

  afterEach(() => {
    stop()
    vi.useRealTimers()
  })

  it('starts present and goes away after ten silent minutes, then back on input', () => {
    expect(get(isUserAwayStore)).toBe(false)

    vi.advanceTimersByTime(DEFAULT_IDLE_AFTER_MS + 15_000)
    expect(get(isUserAwayStore)).toBe(true)

    window.dispatchEvent(new Event('keydown'))
    expect(get(isUserAwayStore)).toBe(false)
  })

  it('goes away a minute after the window is hidden and comes back when it is shown', () => {
    hidden = true
    document.dispatchEvent(new Event('visibilitychange'))
    expect(get(isUserAwayStore)).toBe(false)

    vi.advanceTimersByTime(DEFAULT_HIDDEN_AFTER_MS + 15_000)
    expect(get(isUserAwayStore)).toBe(true)

    hidden = false
    document.dispatchEvent(new Event('visibilitychange'))
    expect(get(isUserAwayStore)).toBe(false)
  })

  it('follows the system idle signal of the desktop app', () => {
    setSystemIdle(true)
    expect(get(isUserAwayStore)).toBe(true)
    window.dispatchEvent(new Event('keydown'))
    expect(get(isUserAwayStore)).toBe(true)

    setSystemIdle(false)
    expect(get(isUserAwayStore)).toBe(false)
  })

  it('logs only the transitions, with the reason', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    try {
      vi.advanceTimersByTime(DEFAULT_IDLE_AFTER_MS + 60_000)
      window.dispatchEvent(new Event('keydown'))
      vi.advanceTimersByTime(60_000)

      expect(info.mock.calls.map((it) => it.slice(0, 2))).toEqual([
        ['[presence] away', 'idle'],
        ['[presence] here', 'active']
      ])
    } finally {
      info.mockRestore()
    }
  })
})
