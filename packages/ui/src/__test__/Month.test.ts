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
import Month from '../components/calendar/Month.svelte'
import { getMonthName } from '../components/calendar/internal/DateUtils'
import { capitalizeFirstLetter } from '../utils'

let target: HTMLElement

const monthYearOf = (date: Date): string => `${capitalizeFirstLetter(getMonthName(date))} ${date.getFullYear()}`

function mount (currentDate: Date | null, props: Record<string, unknown> = {}): { host: HTMLElement, component: Month } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new Month({ target: host, props: { currentDate, ...props } })
  return { host, component }
}

const days = (host: HTMLElement): HTMLButtonElement[] => Array.from(host.querySelectorAll('.calendar button.day'))

describe('Month', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-15T12:00:00'))
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    vi.useRealTimers()
    target.remove()
  })

  it('renders one button per day of the month, and the month/year label', async () => {
    const { host } = mount(null)
    await tick()
    expect(days(host)).toHaveLength(31) // January 2026
    expect(host.querySelector('.monthYear')?.textContent).toBe(monthYearOf(new Date(2026, 0, 1)))
    expect(days(host)[0].textContent?.trim()).toBe('1')
    expect(days(host)[30].textContent?.trim()).toBe('31')
  })

  it('marks the real today as today, and defaults the selection to it when currentDate is null', async () => {
    const { host } = mount(null)
    await tick()
    const today = days(host)[14] // the 15th
    expect(today.classList.contains('today')).toBe(true)
    expect(today.classList.contains('selected')).toBe(true)
  })

  it('selects currentDate independently of which day is today', async () => {
    const { host } = mount(new Date(2026, 0, 20))
    await tick()
    const selected = days(host)[19]
    const today = days(host)[14]
    expect(selected.classList.contains('selected')).toBe(true)
    expect(today.classList.contains('today')).toBe(true)
    expect(today.classList.contains('selected')).toBe(false)
  })

  it('clicking a day dispatches update with that date', async () => {
    const { host, component } = mount(null)
    await tick()
    const onUpdate = vi.fn()
    component.$on('update', onUpdate)

    days(host)[4].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick()

    const detail: Date = onUpdate.mock.calls[0][0].detail
    expect(detail.getFullYear()).toBe(2026)
    expect(detail.getMonth()).toBe(0)
    expect(detail.getDate()).toBe(5)
  })

  // Suspected source bug: the click handler updates `selectedDate` but never reassigns `days`
  // (only changeMonth does), and `days` is what the template's `selected` class reads from - so
  // the highlight never actually moves to the clicked day. Pinned as current behaviour.
  it('does not move the visual selection on click, despite updating internal state', async () => {
    const { host, component } = mount(null)
    await tick()
    const onUpdate = vi.fn()
    component.$on('update', onUpdate)

    days(host)[4].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick()

    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(days(host)[4].classList.contains('selected')).toBe(false)
    expect(days(host)[14].classList.contains('selected')).toBe(true)
  })

  it('hides the navigator buttons when hideNavigator is set', async () => {
    const shown = mount(null)
    await tick()
    expect(shown.host.querySelectorAll('.header button')).toHaveLength(2)

    const hidden = mount(null, { hideNavigator: true })
    await tick()
    expect(hidden.host.querySelectorAll('.header button')).toHaveLength(0)
  })

  it('the right chevron advances the month and re-renders the day count', async () => {
    const { host } = mount(null)
    await tick()
    const [, next] = host.querySelectorAll('.header button')
    next.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick()

    expect(host.querySelector('.monthYear')?.textContent).toBe(monthYearOf(new Date(2026, 1, 1)))
    expect(days(host)).toHaveLength(28) // February 2026, not a leap year
  })

  it('the left chevron moves back a month', async () => {
    const { host } = mount(null)
    await tick()
    const [prev] = host.querySelectorAll('.header button')
    prev.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick()

    expect(host.querySelector('.monthYear')?.textContent).toBe(monthYearOf(new Date(2025, 11, 1)))
    expect(days(host)).toHaveLength(31) // December 2025
  })

  // day-off flags only the day that lands on the last slot of the week (dayOfWeek > 5), which with
  // firstDayOfWeek = 1 (Monday) is Sunday only - Saturday is not marked. Pinned current behaviour.
  it('marks only Sunday as day-off, not Saturday', async () => {
    const { host } = mount(null)
    await tick()
    const cells = days(host)
    for (let i = 0; i < cells.length; i++) {
      const date = new Date(2026, 0, i + 1)
      const isSunday = date.getDay() === 0
      const isSaturday = date.getDay() === 6
      if (isSunday) expect(cells[i].classList.contains('day-off')).toBe(true)
      if (isSaturday) expect(cells[i].classList.contains('day-off')).toBe(false)
    }
  })
})
