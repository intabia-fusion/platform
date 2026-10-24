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

import { tick, type ComponentProps } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import RelativeTime from '../../ui-kit/relative-time/RelativeTime.svelte'

const NOW = new Date(2026, 9, 18, 12, 0).getTime()
const MINUTE = 60000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

let target: HTMLElement
const mounted: Array<{ $destroy: () => void }> = []

function mount (props: ComponentProps<RelativeTime>): { host: HTMLElement, component: RelativeTime } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new RelativeTime({ target: host, props })
  mounted.push(component)
  return { host, component }
}

// No strings loader is registered for 'ui' here: a translated part shows as its raw id.
async function text (host: HTMLElement): Promise<string | undefined> {
  await vi.advanceTimersByTimeAsync(0)
  await tick()
  return host.querySelector('.relative-time')?.textContent?.trim()
}

describe('ui-kit RelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    mounted.splice(0).forEach((component) => {
      component.$destroy()
    })
    target.remove()
    vi.useRealTimers()
  })

  it('tells how long ago in the largest unit, as a <time> with the date', async () => {
    const minutes = mount({ value: NOW - 5 * MINUTE })
    expect(await text(minutes.host)).toBe('ui:string:MinutesAgo')
    expect(minutes.host.querySelector('time')?.getAttribute('datetime')).toBe(new Date(NOW - 5 * MINUTE).toISOString())
    expect(await text(mount({ value: NOW - 3 * HOUR }).host)).toBe('ui:string:HoursAgo')
    expect(await text(mount({ value: NOW - 5 * DAY }).host)).toBe('ui:string:DaysAgo')
    expect(await text(mount({ value: NOW - 90 * DAY }).host)).toBe('ui:string:MonthsAgo')
    expect(await text(mount({ value: NOW - 800 * DAY }).host)).toBe('ui:string:YearsAgo')
  })

  it('moves on as time passes', async () => {
    const { host } = mount({ value: NOW - 30 * MINUTE })
    expect(await text(host)).toBe('ui:string:MinutesAgo')
    vi.setSystemTime(NOW + 3 * HOUR)
    await vi.advanceTimersByTimeAsync(10000)
    expect(await text(host)).toBe('ui:string:HoursAgo')
  })

  it('shows nothing without a value, including 0 only when not a timestamp', async () => {
    const { host } = mount({ value: null })
    expect(host.querySelector('.relative-time')).toBeNull()
    expect(await text(mount({ value: 0, format: 'offset' }).host)).toBe('ui:string:MinutesBefore')
  })

  it('counts down as a timer and reports the timeout once', async () => {
    const { host, component } = mount({ value: NOW + 65 * 1000, format: 'countdown' })
    const onTimeout = vi.fn()
    component.$on('timeout', onTimeout)
    expect(host.querySelector('time')?.getAttribute('role')).toBe('timer')
    expect(await text(host)).toBe('01:05')
    await vi.advanceTimersByTimeAsync(5000)
    expect(await text(host)).toBe('01:00')
    await vi.advanceTimersByTimeAsync(61000)
    expect(await text(host)).toBe('')
    await vi.advanceTimersByTimeAsync(5000)
    expect(onTimeout).toHaveBeenCalledTimes(1)
  })

  it('counts down hours and days', async () => {
    expect(await text(mount({ value: NOW + HOUR + 4 * MINUTE + 59000, format: 'countdown' }).host)).toBe('1:04:59')
    expect(await text(mount({ value: NOW + 3 * DAY + HOUR, format: 'countdown' }).host)).toBe('ui:string:Days')
  })

  it('restarts the countdown for a new value', async () => {
    const { host, component } = mount({ value: NOW + 2000, format: 'countdown' })
    const onTimeout = vi.fn()
    component.$on('timeout', onTimeout)
    await vi.advanceTimersByTimeAsync(3000)
    expect(onTimeout).toHaveBeenCalledTimes(1)
    component.$set({ value: Date.now() + 30000 })
    expect(await text(host)).toBe('00:30')
    await vi.advanceTimersByTimeAsync(31000)
    expect(onTimeout).toHaveBeenCalledTimes(2)
  })

  it('stops counting once the time is over', async () => {
    const { component } = mount({ value: NOW + 2000, format: 'countdown' })
    const onTimeout = vi.fn()
    component.$on('timeout', onTimeout)
    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(3000)
    expect(onTimeout).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('reports a time already over to the listener added after mount', async () => {
    const { host, component } = mount({ value: NOW - 5000, format: 'countdown' })
    const onTimeout = vi.fn()
    component.$on('timeout', onTimeout)
    expect(await text(host)).toBe('')
    await vi.advanceTimersByTimeAsync(1000)
    expect(onTimeout).toHaveBeenCalledTimes(1)
  })

  it('does not tick for a shift, without a value or after destroy', async () => {
    mount({ value: 15 * MINUTE, format: 'offset' })
    mount({ value: null, format: 'countdown' })
    mount({ value: undefined })
    expect(vi.getTimerCount()).toBe(0)
    const { component } = mount({ value: NOW + 60000, format: 'countdown' })
    expect(vi.getTimerCount()).toBe(1)
    component.$set({ format: 'offset' })
    await tick()
    expect(vi.getTimerCount()).toBe(0)
    component.$set({ format: 'countdown' })
    await tick()
    component.$destroy()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('shares one ticker between the «ago» texts and lets it go with the last one', async () => {
    const first = mount({ value: NOW - MINUTE })
    const second = mount({ value: NOW - HOUR })
    expect(vi.getTimerCount()).toBe(1)
    first.component.$destroy()
    expect(vi.getTimerCount()).toBe(1)
    second.component.$set({ value: null })
    await tick()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('shows nothing for a timestamp that makes no date', async () => {
    const { host } = mount({ value: 1e20 })
    expect(host.querySelector('.relative-time')).toBeNull()
    expect(await text(mount({ value: Number.NaN, format: 'offset' }).host)).toBeUndefined()
  })

  it('tells a shift from an event, before or after, or exactly', async () => {
    expect(await text(mount({ value: 15 * MINUTE, format: 'offset' }).host)).toBe('ui:string:MinutesAfter')
    expect(await text(mount({ value: -2 * HOUR, format: 'offset' }).host)).toBe('ui:string:HoursBefore')
    expect(await text(mount({ value: 3 * DAY, format: 'offset' }).host)).toBe('ui:string:DaysAfter')
    expect(await text(mount({ value: DAY + 2 * HOUR + 30 * MINUTE, format: 'offset', exact: true }).host)).toBe(
      'ui:string:DaysShort ui:string:HoursShort ui:string:MinutesShort'
    )
    expect(mount({ value: 15 * MINUTE, format: 'offset' }).host.querySelector('time')).toBeNull()
  })
})
