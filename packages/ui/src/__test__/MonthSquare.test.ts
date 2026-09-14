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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'svelte'
import MonthSquare from '../components/calendar/MonthSquare.svelte'
import { areDatesEqual, day, firstDay, getWeekDayName, weekday } from '../components/calendar/internal/DateUtils'
import { capitalizeFirstLetter } from '../utils'
import { deviceOptionsStore } from '../index'

let target: HTMLElement

interface Mounted {
  component: MonthSquare
  host: HTMLElement
}

function mount (props: Partial<ComponentProps<MonthSquare>>): Mounted {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new MonthSquare({ target: host, props: props as ComponentProps<MonthSquare> })
  return { component, host }
}

/** Index into the flattened 7-per-row grid of the date matching `target`, built the same way the component builds it. */
function indexOf (fd: Date, weeks: number, target: Date): number {
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      if (areDatesEqual(weekday(fd, w, d), target)) return w * 7 + d
    }
  }
  throw new Error('date not in grid')
}

describe('MonthSquare', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 15, 12, 0, 0))
  })

  afterEach(() => {
    target.remove()
    vi.useRealTimers()
    deviceOptionsStore.update((d) => ({ ...d, firstDayOfWeek: 1 }))
  })

  it('lays out the weekday captions and the 6x7 day grid from firstDayOfWeek', () => {
    const viewDate = new Date(2026, 0, 15)
    const { host } = mount({ currentDate: null, viewDate })
    const fd = firstDay(viewDate, 1) // deviceOptionsStore default is Monday (1)

    const captions = host.querySelectorAll('.caption')
    expect(captions).toHaveLength(7)
    for (let i = 0; i < 7; i++) {
      expect(captions[i].textContent?.trim()).toBe(capitalizeFirstLetter(getWeekDayName(day(fd, i), 'short')))
    }

    const dayDivs = host.querySelectorAll('.calendar .day')
    expect(dayDivs).toHaveLength(42)
    for (let w = 0; w < 6; w++) {
      for (let d = 0; d < 7; d++) {
        expect(dayDivs[w * 7 + d].textContent?.trim()).toBe(String(weekday(fd, w, d).getDate()))
      }
    }
  })

  it('shifts the grid start with deviceOptionsStore.firstDayOfWeek', () => {
    deviceOptionsStore.update((d) => ({ ...d, firstDayOfWeek: 0 })) // Sunday start
    const viewDate = new Date(2026, 0, 15)
    const { host } = mount({ currentDate: null, viewDate })
    const fd = firstDay(viewDate, 0)
    const captions = host.querySelectorAll('.caption')
    expect(captions[0].textContent?.trim()).toBe(capitalizeFirstLetter(getWeekDayName(fd, 'short')))
  })

  it('marks days outside viewDate month as wrongMonth, and a click on one is a no-op', () => {
    const viewDate = new Date(2026, 0, 15)
    const { host, component } = mount({ currentDate: null, viewDate })
    const onUpdate = vi.fn()
    component.$on('update', onUpdate)

    const wrongDay = host.querySelector('.day.wrongMonth') as HTMLElement
    expect(wrongDay).not.toBeNull()
    wrongDay.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('clicking a day in-month dispatches update with that date, keeping the hour/minute from currentDate', () => {
    const currentDate = new Date(2026, 0, 10, 14, 30)
    const viewDate = new Date(2026, 0, 15)
    const { host, component } = mount({ currentDate, viewDate })
    const onUpdate = vi.fn()
    component.$on('update', onUpdate)

    const validDay = host.querySelector('.day:not(.wrongMonth)') as HTMLElement
    const clickedDate = Number(validDay.textContent?.trim())
    validDay.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

    expect(onUpdate).toHaveBeenCalledTimes(1)
    const detail: Date = onUpdate.mock.calls[0][0].detail
    expect(detail.getDate()).toBe(clickedDate)
    expect(detail.getHours()).toBe(14)
    expect(detail.getMinutes()).toBe(30)
  })

  it('marks today, and only today, among the visible days', () => {
    const { host } = mount({ currentDate: null, viewDate: new Date(2026, 0, 15) })
    const todays = host.querySelectorAll('.day.today')
    expect(todays).toHaveLength(1)
    expect(todays[0].textContent?.trim()).toBe('15')
  })

  it('marks the range between currentDate and selectedTo, with the endpoints selected and not each other', () => {
    const viewDate = new Date(2026, 0, 15)
    const currentDate = new Date(2026, 0, 6, 12, 0) // Tuesday, mid-week - isolates isStart from the row-start rule
    const selectedTo = new Date(2026, 0, 10, 12, 0) // Saturday, mid-week - isolates isEnd from the row-end rule
    const { host } = mount({ currentDate, viewDate, selectedTo })

    const fd = firstDay(viewDate, 1)
    const dayDivs = host.querySelectorAll('.calendar .day')
    const containers = host.querySelectorAll('.calendar .container')
    const startIdx = indexOf(fd, 6, currentDate)
    const endIdx = indexOf(fd, 6, selectedTo)
    const midIdx = indexOf(fd, 6, new Date(2026, 0, 8, 12, 0))

    expect(dayDivs[startIdx].classList.contains('selected')).toBe(true)
    expect(containers[startIdx].classList.contains('startRow')).toBe(true)
    expect(dayDivs[endIdx].classList.contains('selected')).toBe(true)
    expect(containers[endIdx].classList.contains('endRow')).toBe(true)

    expect(dayDivs[midIdx].classList.contains('range')).toBe(true)
    expect(dayDivs[midIdx].classList.contains('selected')).toBe(false)
  })

  it('shows both arrows by default, and hides them per hideNavigator', () => {
    const base = { currentDate: null, viewDate: new Date(2026, 0, 15) }
    expect(mount({ ...base, hideNavigator: 'none' }).host.querySelectorAll('.header button')).toHaveLength(2)
    expect(mount({ ...base, hideNavigator: 'left' }).host.querySelectorAll('.header button')).toHaveLength(1)
    expect(mount({ ...base, hideNavigator: 'right' }).host.querySelectorAll('.header button')).toHaveLength(1)
    expect(mount({ ...base, hideNavigator: 'all' }).host.querySelectorAll('.header button')).toHaveLength(0)
  })

  it('always dispatches navigation, and mutates the shared viewDate in place only when viewUpdate is on', () => {
    const onWithUpdate = new Date(2026, 0, 15)
    const withUpdate = mount({ currentDate: null, viewDate: onWithUpdate, viewUpdate: true })
    const onNav = vi.fn()
    withUpdate.component.$on('navigation', onNav)
    const [left] = withUpdate.host.querySelectorAll('.header button')
    left.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(onNav).toHaveBeenLastCalledWith(expect.objectContaining({ detail: -1 }))
    expect(onWithUpdate.getMonth()).toBe(11) // rolled back from January to December
    expect(onWithUpdate.getDate()).toBe(1)

    const untouched = new Date(2026, 0, 15)
    const withoutUpdate = mount({ currentDate: null, viewDate: untouched, viewUpdate: false })
    const [leftNoUpdate] = withoutUpdate.host.querySelectorAll('.header button')
    leftNoUpdate.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(untouched.getMonth()).toBe(0)
    expect(untouched.getDate()).toBe(15)
  })

  it('renders a custom displayedWeeksCount', () => {
    const { host } = mount({ currentDate: null, viewDate: new Date(2026, 0, 15), displayedWeeksCount: 4 })
    expect(host.querySelectorAll('.calendar .day')).toHaveLength(28)
  })

  it('applies noPadding to the calendar grid', () => {
    const { host } = mount({ currentDate: null, viewDate: new Date(2026, 0, 15), noPadding: true })
    expect(host.querySelector('.calendar')?.classList.contains('noPadding')).toBe(true)
  })
})
