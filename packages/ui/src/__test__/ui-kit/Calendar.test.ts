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

import { fromCurrentToTz } from '../../components/calendar/internal/DateUtils'
import Calendar from '../../ui-kit/calendar/Calendar.svelte'

const NOW = new Date(2026, 9, 18, 12, 0)
// October 2026 starts on a Thursday.
const VALUE = new Date(2026, 9, 5, 9, 30).getTime()

let target: HTMLElement
const mounted: Array<{ $destroy: () => void }> = []

function mount (props: ComponentProps<Calendar>): { root: HTMLElement, component: Calendar } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new Calendar({ target: host, props })
  mounted.push(component)
  return { root: host.querySelector('.calendar') as HTMLElement, component }
}

function dayButton (root: HTMLElement, day: number): HTMLButtonElement {
  return root.querySelector(`[data-day="${day}"]`) as HTMLButtonElement
}

describe('ui-kit Calendar', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
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

  it('shows only the days of the month, the picked day and today marked', () => {
    const { root } = mount({ value: VALUE })
    const grid = root.querySelector('[role="grid"]') as HTMLElement
    expect(grid.querySelectorAll('button.calendar__day')).toHaveLength(31)
    // Monday first: Thursday the 1st is preceded by three blank cells.
    const firstRow = grid.querySelectorAll('[role="row"]')[1]
    expect(Array.from(firstRow.children).filter((cell) => cell.querySelector('button') === null)).toHaveLength(3)
    expect(dayButton(root, 5).classList.contains('calendar__day--selected')).toBe(true)
    expect(dayButton(root, 5).parentElement?.getAttribute('aria-selected')).toBe('true')
    expect(dayButton(root, 18).getAttribute('aria-current')).toBe('date')
    expect(dayButton(root, 5).tabIndex).toBe(0)
    expect(dayButton(root, 6).tabIndex).toBe(-1)
  })

  it('picks a day keeping the time of the value', async () => {
    const { root, component } = mount({ value: VALUE })
    const onSelect = vi.fn<(event: CustomEvent<number>) => void>()
    component.$on('select', onSelect)
    dayButton(root, 20).click()
    await tick()
    expect(onSelect.mock.calls[0][0].detail).toBe(new Date(2026, 9, 20, 9, 30).getTime())
    expect(dayButton(root, 20).classList.contains('calendar__day--selected')).toBe(true)
    expect(dayButton(root, 5).classList.contains('calendar__day--selected')).toBe(false)
  })

  it('in a time zone marks and picks the day as seen there, keeping its time', async () => {
    // UTC+14 at 22:00 local: already the next day there for any runner zone west of UTC+12.
    const timeZone = 'Pacific/Kiritimati'
    const value = new Date(2026, 9, 5, 22, 15).getTime()
    const zoned = fromCurrentToTz(value, timeZone)
    expect(zoned.getDate()).toBe(6)
    const { root, component } = mount({ value, timeZone })
    const onSelect = vi.fn<(event: CustomEvent<number>) => void>()
    component.$on('select', onSelect)
    expect(dayButton(root, zoned.getDate()).classList.contains('calendar__day--selected')).toBe(true)
    dayButton(root, 20).click()
    await tick()
    const picked = fromCurrentToTz(onSelect.mock.calls[0][0].detail, timeZone)
    expect([picked.getDate(), picked.getHours(), picked.getMinutes()]).toEqual([
      20,
      zoned.getHours(),
      zoned.getMinutes()
    ])
    expect(dayButton(root, 20).classList.contains('calendar__day--selected')).toBe(true)
  })

  it('builds a range: start, end (swapped when earlier), then a new start', async () => {
    const { root, component } = mount({ range: true, month: VALUE })
    const onRange = vi.fn<(event: CustomEvent<{ start: number, end: number | null }>) => void>()
    component.$on('range', onRange)
    dayButton(root, 10).click()
    await tick()
    dayButton(root, 6).click()
    await tick()
    expect(
      onRange.mock.calls.map(([e]) => [
        new Date(e.detail.start).getDate(),
        e.detail.end === null ? null : new Date(e.detail.end).getDate()
      ])
    ).toEqual([
      [10, null],
      [6, 10]
    ])
    expect(dayButton(root, 8).classList.contains('calendar__day--inside')).toBe(true)
    expect(dayButton(root, 6).parentElement?.classList.contains('calendar__cell--range-start')).toBe(true)
    expect(dayButton(root, 10).parentElement?.classList.contains('calendar__cell--range-end')).toBe(true)
    dayButton(root, 20).click()
    await tick()
    expect(onRange.mock.calls[2][0].detail.end).toBeNull()
    expect(dayButton(root, 8).classList.contains('calendar__day--inside')).toBe(false)
  })

  it('navigates months with the arrows and reports the shown month', async () => {
    const { root, component } = mount({ value: VALUE, navigation: 'both' })
    const onNavigate = vi.fn<(event: CustomEvent<number>) => void>()
    component.$on('navigate', onNavigate)
    const [prev, next] = Array.from(root.querySelectorAll<HTMLButtonElement>('.calendar__navigation button'))
    next.click()
    await tick()
    expect(onNavigate.mock.calls[0][0].detail).toBe(new Date(2026, 10, 1).getTime())
    expect(root.querySelectorAll('button.calendar__day')).toHaveLength(30)
    prev.click()
    prev.click()
    await tick()
    expect(onNavigate.mock.calls[2][0].detail).toBe(new Date(2026, 8, 1).getTime())
  })

  it('shows only the arrows of its side', () => {
    expect(
      mount({ value: VALUE, navigation: 'previous' }).root.querySelectorAll('.calendar__navigation button')
    ).toHaveLength(1)
    expect(mount({ value: VALUE, navigation: 'none' }).root.querySelector('.calendar__navigation')).toBeNull()
  })

  it('moves the focus with the arrow keys and into the next month', async () => {
    const { root } = mount({ value: new Date(2026, 9, 30).getTime() })
    const day30 = dayButton(root, 30)
    day30.focus()
    day30.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    await tick()
    await tick()
    expect(document.activeElement).toBe(dayButton(root, 29))
    dayButton(root, 29).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    await tick()
    await tick()
    // 29 October + 7 days = 5 November.
    expect(root.querySelectorAll('button.calendar__day')).toHaveLength(30)
    expect(document.activeElement).toBe(dayButton(root, 5))
  })

  it('keeps one tab stop when the remembered day does not exist in the next month', async () => {
    const { root, component } = mount({ month: new Date(2026, 0, 1).getTime() })
    dayButton(root, 31).click()
    await tick()
    component.$set({ month: new Date(2026, 1, 1).getTime() })
    await tick()
    const stops = Array.from(root.querySelectorAll<HTMLElement>('.calendar__day[tabindex="0"]'))
    expect(stops.map((stop) => stop.dataset.day)).toEqual(['28'])
  })
})
