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
import TimeSince from '../components/TimeSince.svelte'

const NOW = new Date('2026-01-15T12:00:00Z').getTime()
const MINUTE = 60000
const HOUR = MINUTE * 60
const DAY = HOUR * 24
const YEAR = DAY * 365

let target: HTMLElement

function mount (props: Partial<ComponentProps<TimeSince>>): { host: HTMLElement, component: TimeSince } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new TimeSince({ target: host, props: props as ComponentProps<TimeSince> })
  return { host, component }
}

// No strings loader is registered for the 'ui' plugin, so translateCB always falls back to the raw
// IntlString id - which is enough to tell which branch of formatTime fired.
async function settledText (host: HTMLElement): Promise<string | null | undefined> {
  await vi.advanceTimersByTimeAsync(0)
  return host.querySelector('span')?.textContent?.trim()
}

describe('TimeSince', () => {
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

  it('picks MinutesAgo under an hour, clamping a future value into the same branch', async () => {
    const past = mount({ value: NOW - 5 * MINUTE })
    expect(await settledText(past.host)).toBe('ui:string:MinutesAgo')
    past.component.$destroy()

    const future = mount({ value: NOW + 10000 })
    expect(await settledText(future.host)).toBe('ui:string:MinutesAgo')
    future.component.$destroy()
  })

  it('moves through HoursAgo and DaysAgo as the gap widens', async () => {
    const hours = mount({ value: NOW - 3 * HOUR })
    expect(await settledText(hours.host)).toBe('ui:string:HoursAgo')
    hours.component.$destroy()

    const days = mount({ value: NOW - 5 * DAY })
    expect(await settledText(days.host)).toBe('ui:string:DaysAgo')
    days.component.$destroy()
  })

  it('moves through MonthsAgo and YearsAgo for older gaps', async () => {
    const months = mount({ value: NOW - 90 * DAY })
    expect(await settledText(months.host)).toBe('ui:string:MonthsAgo')
    months.component.$destroy()

    const years = mount({ value: NOW - 2 * YEAR })
    expect(await settledText(years.host)).toBe('ui:string:YearsAgo')
    years.component.$destroy()
  })

  it('adds list styling classes only for kind="list"', () => {
    const list = mount({ value: NOW - MINUTE, kind: 'list' })
    const listSpan = list.host.querySelector('span') as HTMLElement
    expect(listSpan.classList.contains('text-sm')).toBe(true)
    expect(listSpan.classList.contains('content-dark-color')).toBe(true)
    list.component.$destroy()

    const plain = mount({ value: NOW - MINUTE })
    const plainSpan = plain.host.querySelector('span') as HTMLElement
    expect(plainSpan.classList.contains('no-word-wrap')).toBe(true)
    expect(plainSpan.classList.contains('text-sm')).toBe(false)
    plain.component.$destroy()
  })

  it('updates live as the ticker advances, and never formats a falsy value', async () => {
    const { host, component } = mount({ value: NOW - 30 * MINUTE })
    expect(await settledText(host)).toBe('ui:string:MinutesAgo')

    vi.setSystemTime(NOW + 3 * HOUR)
    await vi.advanceTimersByTimeAsync(10000) // one ticker tick (10s period)
    await tick()
    expect(await settledText(host)).toBe('ui:string:HoursAgo')
    component.$destroy()

    // pinned behaviour, not a desired one: `value && formatTime(...)` treats the epoch-0
    // timestamp as absent, same as undefined, so nothing is ever rendered for it.
    const zero = mount({ value: 0 })
    expect(await settledText(zero.host)).toBe('')
    zero.component.$destroy()
  })
})
