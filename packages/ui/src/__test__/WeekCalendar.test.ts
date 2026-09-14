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
import WeekCalendar from '../components/calendar/WeekCalendar.svelte'
import { day as getDay, getWeekDayName, getWeekStart } from '../components/calendar/internal/DateUtils'
import ui, { deviceOptionsStore } from '../index'

// Thursday, so weeks starting Monday and Sunday differ.
const NOW = new Date(2026, 0, 15, 12, 0, 0)

let target: HTMLElement

interface Mounted {
  component: WeekCalendar
  host: HTMLElement
}

// Fake timers replace setTimeout too, so the settle wait must advance them explicitly.
async function settle (): Promise<void> {
  await vi.advanceTimersByTimeAsync(20)
  await tick()
}

async function mount (props: Record<string, unknown> = {}): Promise<Mounted> {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new WeekCalendar({ target: host, props })
  await settle()
  return { component, host }
}

function dayDivs (host: HTMLElement): HTMLElement[] {
  return Array.from(host.querySelectorAll('.scroller-thead__tr th .cursor-pointer'))
}

describe('WeekCalendar', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
    deviceOptionsStore.update((d) => ({ ...d, firstDayOfWeek: 1 }))
    vi.useRealTimers()
  })

  it('renders the hours header as the untranslated label id (no loader registered)', async () => {
    const { host } = await mount({ currentDate: NOW })
    expect(host.querySelector('.scroller-thead__tr th')?.textContent?.trim()).toBe(ui.string.HoursLabel)
  })

  it('lays out a Mon-Sun week from the week start, by default', async () => {
    const { host } = await mount({ currentDate: NOW })
    const weekStart = getWeekStart(NOW, 1) // Monday Jan 12 2026
    const divs = dayDivs(host)
    expect(divs).toHaveLength(7)
    divs.forEach((div, i) => {
      const expected = getDay(weekStart, i)
      const cells = div.querySelectorAll('.flex-center')
      expect(cells[0].textContent).toBe(getWeekDayName(expected, 'short'))
      expect(cells[1].textContent).toBe(String(expected.getDate()))
    })
  })

  it('marks only the column matching today, and none when today is outside the week', async () => {
    const inWeek = await mount({ currentDate: NOW })
    const divs = dayDivs(inWeek.host)
    expect(divs.filter((d) => d.classList.contains('today'))).toHaveLength(1)
    expect(divs[3].classList.contains('today')).toBe(true) // Thu Jan 15 is column index 3

    const outsideWeek = await mount({ currentDate: new Date(2025, 11, 1, 12, 0, 0) })
    expect(dayDivs(outsideWeek.host).some((d) => d.classList.contains('today'))).toBe(false)
  })

  it('dispatches select with the clicked day', async () => {
    const { component, host } = await mount({ currentDate: NOW })
    const onSelect = vi.fn()
    component.$on('select', onSelect)
    dayDivs(host)[2].dispatchEvent(new MouseEvent('click', { bubbles: true }))

    const weekStart = getWeekStart(NOW, 1)
    const expected = getDay(weekStart, 2)
    expect(onSelect).toHaveBeenCalledTimes(1)
    const detail = onSelect.mock.calls[0][0].detail as Date
    expect(detail.getFullYear()).toBe(expected.getFullYear())
    expect(detail.getMonth()).toBe(expected.getMonth())
    expect(detail.getDate()).toBe(expected.getDate())
  })

  it('renders displayedHours rows, blank at hour 0 and zero-padded otherwise', async () => {
    const { host } = await mount({ currentDate: NOW, displayedHours: 5 })
    const firstCells = Array.from(host.querySelectorAll('tbody tr td.calendar-td.first'))
    expect(firstCells).toHaveLength(5)
    expect(firstCells[0].textContent?.trim()).toBe('')
    expect(firstCells[1].textContent?.trim()).toBe('01:00')
    expect(firstCells[4].textContent?.trim()).toBe('04:00')
  })

  it('renders displayedDaysCount columns and matching cell counts per row', async () => {
    const { host } = await mount({ currentDate: NOW, displayedDaysCount: 3, displayedHours: 2 })
    expect(dayDivs(host)).toHaveLength(3)
    const rows = host.querySelectorAll('tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[0].querySelectorAll('td.cell')).toHaveLength(3)
  })

  it('applies cellHeight to each cell, and leaves it unset by default', async () => {
    const withHeight = await mount({ currentDate: NOW, displayedHours: 1, cellHeight: '3rem' })
    expect((withHeight.host.querySelector('td.cell') as HTMLElement).style.height).toBe('3rem')

    const withoutHeight = await mount({ currentDate: NOW, displayedHours: 1 })
    expect((withoutHeight.host.querySelector('td.cell') as HTMLElement).style.height).toBe('')
  })

  it('starts from midnight of currentDate, not the week start, when startFromWeekStart is false', async () => {
    const { host } = await mount({ currentDate: NOW, startFromWeekStart: false })
    const divs = dayDivs(host)
    expect(divs[0].querySelectorAll('.flex-center')[1].textContent).toBe('15') // Jan 15 itself
    expect(divs[0].classList.contains('today')).toBe(true)
  })

  it('reacts to firstDayOfWeek from deviceOptionsStore', async () => {
    deviceOptionsStore.update((d) => ({ ...d, firstDayOfWeek: 0 }))
    const { host } = await mount({ currentDate: NOW })
    const divs = dayDivs(host)
    // Sunday Jan 11 2026 instead of Monday Jan 12.
    expect(divs[0].querySelectorAll('.flex-center')[1].textContent).toBe('11')
  })

  it('falls back currentDate to selectedDate when currentDate is not given', async () => {
    const { host } = await mount({ selectedDate: NOW })
    const divs = dayDivs(host)
    expect(divs[3].classList.contains('today')).toBe(true)
  })
})
