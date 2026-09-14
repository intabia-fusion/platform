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
import TimeLeft from '../components/TimeLeft.svelte'
import ui from '../plugin'

const NOW = new Date('2026-01-15T12:00:00Z').getTime()
const DAY_MS = 1000 * 60 * 60 * 24

let target: HTMLElement

function mount (props: Record<string, unknown>): { host: HTMLElement, component: TimeLeft } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new TimeLeft({ target: host, props })
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
  })

  it('renders minute:second under an hour, and adds the hour digit with showHours', () => {
    const plain = mount({ time: NOW + 65000 })
    const expectedPlain = new Date(65000).toLocaleString('default', { minute: 'numeric', second: 'numeric' })
    expect(plain.host.textContent?.trim()).toBe(expectedPlain)
    plain.component.$destroy()

    const withHours = mount({ time: NOW + 2 * 3600 * 1000 + 65000, showHours: true })
    const expectedWithHours = new Date(2 * 3600 * 1000 + 65000).toLocaleString('default', {
      minute: 'numeric',
      second: 'numeric',
      timeZone: 'UTC',
      hour: 'numeric'
    })
    expect(withHours.host.textContent?.trim()).toBe(expectedWithHours)
    withHours.component.$destroy()
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
    const expected = new Date(65000).toLocaleString('default', { minute: 'numeric', second: 'numeric' })
    expect(host.textContent?.trim()).toBe(expected)

    component.$destroy()
    expect(clearSpy).toHaveBeenCalledTimes(2)
    clearSpy.mockRestore()
  })
})
