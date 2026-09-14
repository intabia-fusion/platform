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
import { DateRangeMode } from '@hcengineering/core'
import type { ComponentProps } from 'svelte'
import Shifts from '../components/calendar/Shifts.svelte'
import { HOUR, MINUTE } from '../types'

let target: HTMLElement

function mount (props: Partial<ComponentProps<Shifts>>): { host: HTMLElement, component: Shifts } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new Shifts({ target: host, props: props as ComponentProps<Shifts> })
  return { host, component }
}

describe('Shifts', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-15T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    target.remove()
  })

  it('renders nothing when shift is off, even with a current date', () => {
    const { host } = mount({ currentDate: new Date(), shift: false })
    expect(host.querySelector('.shift-container')).toBeNull()
  })

  it('renders nothing when there is no current date, even with shift on', () => {
    const { host } = mount({ currentDate: null, shift: true })
    expect(host.querySelector('.shift-container')).toBeNull()
  })

  it('mode DATE: only date shifts, one leading divider', () => {
    const { host } = mount({ currentDate: new Date(), shift: true, mode: DateRangeMode.DATE })
    expect(host.querySelectorAll('.divider')).toHaveLength(1)
    expect(host.querySelectorAll('.btn')).toHaveLength(4) // default days: [1, 3, 7, 30]
  })

  it('mode TIME: only minute/hour shifts, one divider between them', () => {
    const { host } = mount({ currentDate: new Date(), shift: true, mode: DateRangeMode.TIME })
    expect(host.querySelectorAll('.divider')).toHaveLength(1)
    expect(host.querySelectorAll('.btn')).toHaveLength(8) // default minutes(3) + hours(5)
  })

  it('mode DATETIME: minutes, hours and days, two dividers', () => {
    const { host } = mount({ currentDate: new Date(), shift: true, mode: DateRangeMode.DATETIME })
    expect(host.querySelectorAll('.divider')).toHaveLength(2)
    expect(host.querySelectorAll('.btn')).toHaveLength(12) // default minutes(3) + hours(5) + days(4)
  })

  it('dispatches change with now + value on click, direction after', () => {
    const { host, component } = mount({
      currentDate: new Date(),
      shift: true,
      mode: DateRangeMode.TIME,
      minutes: [5],
      hours: [1],
      direction: 'after'
    })
    const onChange = vi.fn()
    component.$on('change', onChange)

    const btns = host.querySelectorAll('.btn')
    ;(btns[0] as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })) // 5 minutes

    const expected = new Date(Date.now() + 5 * MINUTE)
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ detail: expected }))
  })

  it('dispatches change with now - value on click, direction before', () => {
    const { host, component } = mount({
      currentDate: new Date(),
      shift: true,
      mode: DateRangeMode.TIME,
      minutes: [5],
      hours: [1],
      direction: 'before'
    })
    const onChange = vi.fn()
    component.$on('change', onChange)

    const btns = host.querySelectorAll('.btn')
    ;(btns[1] as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })) // 1 hour

    const expected = new Date(Date.now() - 1 * HOUR)
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ detail: expected }))
  })

  it('zeroes seconds and milliseconds off "now" before shifting', () => {
    vi.setSystemTime(new Date('2026-01-15T12:00:45.678Z'))
    const { host, component } = mount({
      currentDate: new Date(),
      shift: true,
      mode: DateRangeMode.TIME,
      minutes: [5],
      hours: [],
      direction: 'after'
    })
    const onChange = vi.fn()
    component.$on('change', onChange)
    ;(host.querySelector('.btn') as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }))

    const zeroed = new Date('2026-01-15T12:00:45.678Z').setSeconds(0, 0)
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ detail: new Date(zeroed + 5 * MINUTE) }))
  })

  // Source bug: shiftValues is a plain top-level `const` array populated inside a `$:` block via
  // `.push(...)`. Svelte never sees an assignment to `shiftValues`, so the {#each} in the markup is
  // never told to re-render when minutes/hours/days/mode change after the initial mount - the shift
  // list is effectively frozen at first render. Pinned as current behaviour, not a desired one.
  it('pinned bug: changing days/mode after mount does not update the rendered list', async () => {
    const { host, component } = mount({
      currentDate: new Date(),
      shift: true,
      mode: DateRangeMode.DATE,
      days: [1, 3]
    })
    expect(host.querySelectorAll('.btn')).toHaveLength(2)

    component.$set({ days: [1, 3, 7, 30, 60] })
    await tick()
    expect(host.querySelectorAll('.btn')).toHaveLength(2) // unchanged despite 5 configured days

    component.$set({ mode: DateRangeMode.DATETIME })
    await tick()
    expect(host.querySelectorAll('.btn')).toHaveLength(2) // unchanged despite switching to DATETIME
  })
})
