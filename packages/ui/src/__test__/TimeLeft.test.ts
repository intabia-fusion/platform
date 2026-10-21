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

import { tick } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'svelte'
import TimeLeft from '../components/TimeLeft.svelte'
import ui from '../plugin'

const NOW = new Date('2026-01-15T12:00:00Z').getTime()
const HOUR_MS = 1000 * 60 * 60
const DAY_MS = HOUR_MS * 24

// What a countdown of `ms` reads as minutes and seconds, whatever the zone of the machine.
function utcMinSec (ms: number): string {
  return new Date(ms).toLocaleString('default', { minute: 'numeric', second: 'numeric', timeZone: 'UTC' })
}

let target: HTMLElement

function mount (props: Partial<ComponentProps<TimeLeft>>): { host: HTMLElement, component: TimeLeft } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new TimeLeft({ target: host, props: props as ComponentProps<TimeLeft> })
  return { host, component }
}

describe('TimeLeft', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    target.remove()
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it('renders minute:second under an hour', () => {
    const { host, component } = mount({ time: NOW + 65000 })

    expect(host.textContent?.trim()).toBe(utcMinSec(65000))
    component.$destroy()
  })

  it('keeps the minutes of the countdown in a zone with a half-hour offset', () => {
    // 59:59 left; read in UTC+5:30 the same instant has minute 29.
    vi.stubEnv('TZ', 'Asia/Kolkata')
    const { host, component } = mount({ time: NOW + (59 * 60 + 59) * 1000 })

    expect(host.textContent?.trim()).toBe(utcMinSec((59 * 60 + 59) * 1000))
    component.$destroy()
  })

  it('adds the hours once an hour or more is left, without showHours', () => {
    const over = mount({ time: NOW + HOUR_MS + 5 * 60 * 1000 + 3000 })
    expect(over.host.textContent?.trim()).toMatch(/^0?1:05:03$/)
    over.component.$destroy()

    const exactly = mount({ time: NOW + HOUR_MS })
    expect(exactly.host.textContent?.trim()).toMatch(/^0?1:00:00$/)
    exactly.component.$destroy()

    const under = mount({ time: NOW + HOUR_MS - 1000 })
    expect(under.host.textContent?.trim()).toBe(utcMinSec(HOUR_MS - 1000))
    under.component.$destroy()
  })

  it('counts the hours in a zone with a half-hour offset too', () => {
    vi.stubEnv('TZ', 'Asia/Kolkata')
    const { host, component } = mount({ time: NOW + 2 * HOUR_MS + 61 * 1000 })

    expect(host.textContent?.trim()).toMatch(/^0?2:01:01$/)
    component.$destroy()
  })

  it('shows the hours of showHours on a 24-hour clock, and also under an hour', () => {
    const long = mount({ time: NOW + 13 * HOUR_MS + 65000, showHours: true })
    expect(long.host.textContent?.trim()).toBe('13:01:05')
    long.component.$destroy()

    const short = mount({ time: NOW + 65000, showHours: true })
    expect(short.host.textContent?.trim()).toMatch(/^0?0:01:05$/)
    short.component.$destroy()
  })

  it('switches to the Days label at a day, but not just under it', () => {
    const underDay = mount({ time: NOW + DAY_MS - 1000 })
    expect(underDay.host.textContent).not.toContain(ui.string.Days)
    underDay.component.$destroy()

    // 2 * DAY_MS + 5s left => Math.floor(.../DAY_MS) === 2
    const overTwoDays = mount({ time: NOW + 2 * DAY_MS + 5000 })
    expect(overTwoDays.host.textContent?.trim()).toBe(ui.string.Days)
    overTwoDays.component.$destroy()
  })

  it('clamps a past target to zero and renders nothing', () => {
    const { host, component } = mount({ time: NOW - 5000 })
    expect(host.textContent?.trim()).toBe('')
    component.$destroy()
  })

  it('dispatches timeout exactly once when the interval carries the countdown to zero', async () => {
    const { component } = mount({ time: NOW + 2000 })
    const onTimeout = vi.fn()
    component.$on('timeout', onTimeout)

    await vi.advanceTimersByTimeAsync(2000)
    expect(onTimeout).toHaveBeenCalledTimes(1)

    // notified guard: further ticks past zero must not re-dispatch
    await vi.advanceTimersByTimeAsync(2000)
    expect(onTimeout).toHaveBeenCalledTimes(1)
    component.$destroy()
  })

  it('restart() re-arms the timer and clears the previous interval; destroy clears its own', async () => {
    const clearSpy = vi.spyOn(global, 'clearInterval')
    const { component, host } = mount({ time: NOW + 100000 })
    expect(clearSpy).not.toHaveBeenCalled()

    component.restart(NOW + 65000)
    expect(clearSpy).toHaveBeenCalledTimes(1)
    await tick()
    expect(host.textContent?.trim()).toBe(utcMinSec(65000))

    component.$destroy()
    expect(clearSpy).toHaveBeenCalledTimes(2)
    clearSpy.mockRestore()
  })
})
