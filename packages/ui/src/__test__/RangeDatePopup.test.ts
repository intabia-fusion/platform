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
import type { IntlString } from '@hcengineering/platform'
import RangeDatePopup from '../components/calendar/RangeDatePopup.svelte'
import { getMonthName } from '../components/calendar/internal/DateUtils'
import { capitalizeFirstLetter } from '../utils'

const LABEL = 'ui:string:Label' as IntlString

let target: HTMLElement

const monthYearOf = (date: Date): string => `${capitalizeFirstLetter(getMonthName(date))} ${date.getFullYear()}`

interface Mounted {
  component: RangeDatePopup
  root: HTMLElement
  squares: HTMLElement[]
}

function mount (startDate: Date | null, endDate: Date | null): Mounted {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new RangeDatePopup({ target: host, props: { label: LABEL, startDate, endDate } })
  const root = host.querySelector('.date-popup-container') as HTMLElement
  return { component, root, squares: Array.from(root.querySelectorAll('.month-container')) as HTMLElement[] }
}

function dayCell (square: HTMLElement, dayOfMonth: number): HTMLElement {
  const days = Array.from(square.querySelectorAll('.day:not(.wrongMonth)')) as HTMLElement[]
  const found = days.find((d) => d.textContent?.trim() === String(dayOfMonth))
  if (found === undefined) throw new Error(`day ${dayOfMonth} not rendered`)
  return found
}

describe('RangeDatePopup', () => {
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

  it('opens both months on the current month/next month when no dates are set', async () => {
    const { squares } = mount(null, null)
    await tick()
    expect(squares[0].querySelector('.monthYear')?.textContent).toBe(monthYearOf(new Date(2026, 0, 1)))
    expect(squares[1].querySelector('.monthYear')?.textContent).toBe(monthYearOf(new Date(2026, 1, 1)))
  })

  it('keeps the second month on the month after start when both dates share a month', async () => {
    const { squares } = mount(new Date(2026, 0, 10), new Date(2026, 0, 20))
    await tick()
    expect(squares[0].querySelector('.monthYear')?.textContent).toBe(monthYearOf(new Date(2026, 0, 1)))
    expect(squares[1].querySelector('.monthYear')?.textContent).toBe(monthYearOf(new Date(2026, 1, 1)))
  })

  it('shows the actual end month when start and end fall in different months', async () => {
    const { squares } = mount(new Date(2026, 0, 10), new Date(2026, 2, 5))
    await tick()
    expect(squares[0].querySelector('.monthYear')?.textContent).toBe(monthYearOf(new Date(2026, 0, 1)))
    expect(squares[1].querySelector('.monthYear')?.textContent).toBe(monthYearOf(new Date(2026, 2, 1)))
  })

  it('navigating either arrow shifts both months together by the same step', async () => {
    // navigateMonth() moves viewDate and viewDateSec together regardless of which square's
    // arrow fired it, so the left arrow on square 0 also shifts square 1, and vice versa.
    const { squares } = mount(null, null)
    await tick()
    const leftArrow = squares[0].querySelector('.header button') as HTMLButtonElement
    const rightArrow = squares[1].querySelector('.header button') as HTMLButtonElement

    leftArrow.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick()
    expect(squares[0].querySelector('.monthYear')?.textContent).toBe(monthYearOf(new Date(2025, 11, 1)))
    expect(squares[1].querySelector('.monthYear')?.textContent).toBe(monthYearOf(new Date(2026, 0, 1)))

    rightArrow.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick()
    expect(squares[0].querySelector('.monthYear')?.textContent).toBe(monthYearOf(new Date(2026, 0, 1)))
    expect(squares[1].querySelector('.monthYear')?.textContent).toBe(monthYearOf(new Date(2026, 1, 1)))
  })

  it('sets startDate on the first click, then endDate on a later click', async () => {
    const { squares } = mount(null, null)
    await tick()
    dayCell(squares[0], 20).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick()
    expect(dayCell(squares[0], 20).classList.contains('selected')).toBe(true)

    dayCell(squares[0], 25).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick()
    expect(dayCell(squares[0], 20).classList.contains('selected')).toBe(true)
    expect(dayCell(squares[0], 25).classList.contains('selected')).toBe(true)
    expect(dayCell(squares[0], 22).classList.contains('range')).toBe(true)
  })

  it('picking an earlier day than the current start swaps it to become the end', async () => {
    const { squares } = mount(null, null)
    await tick()
    dayCell(squares[0], 20).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick()
    dayCell(squares[0], 10).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick()
    // 10 became the new start, 20 the end - both selected, with a range between.
    expect(dayCell(squares[0], 10).classList.contains('selected')).toBe(true)
    expect(dayCell(squares[0], 20).classList.contains('selected')).toBe(true)
    expect(dayCell(squares[0], 15).classList.contains('range')).toBe(true)
  })

  it('a third click restarts the range from that day', async () => {
    const { squares } = mount(new Date(2026, 0, 10), new Date(2026, 0, 20))
    await tick()
    dayCell(squares[0], 5).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick()
    expect(dayCell(squares[0], 5).classList.contains('selected')).toBe(true)
    expect(dayCell(squares[0], 20).classList.contains('selected')).toBe(false)
  })

  it('the header close icon dispatches close with an empty detail, regardless of state', async () => {
    const { root, component } = mount(new Date(2026, 0, 10), new Date(2026, 0, 20))
    await tick()
    const onClose = vi.fn()
    component.$on('close', onClose)
    const headerClose = root.querySelector('.header button.button') as HTMLButtonElement
    headerClose.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(onClose).toHaveBeenLastCalledWith(expect.objectContaining({ detail: {} }))
  })

  it('Save with a valid range dispatches update and close with normalized dates', async () => {
    const { root, component } = mount(new Date(2026, 0, 10), new Date(2026, 0, 20))
    await tick()
    const onUpdate = vi.fn()
    const onClose = vi.fn()
    component.$on('update', onUpdate)
    component.$on('close', onClose)
    const saveButton = root.querySelector('.footer button') as HTMLButtonElement
    saveButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick()

    const detail = onUpdate.mock.calls[0][0].detail
    expect(detail.startDate.getDate()).toBe(10)
    expect(detail.endDate.getDate()).toBe(20)
    expect(onClose).toHaveBeenLastCalledWith(
      expect.objectContaining({ detail: { startDate: detail.startDate, endDate: detail.endDate } })
    )
  })

  it('Save swaps an out-of-order range so start stays before end', async () => {
    const { root, component } = mount(new Date(2026, 0, 20), new Date(2026, 0, 10))
    await tick()
    const onUpdate = vi.fn()
    component.$on('update', onUpdate)
    const saveButton = root.querySelector('.footer button') as HTMLButtonElement
    saveButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick()

    const detail = onUpdate.mock.calls[0][0].detail
    expect(detail.startDate.getDate()).toBe(10)
    expect(detail.endDate.getDate()).toBe(20)
  })

  it('Save with no date picked clears the range and closes with nulls', async () => {
    const { root, component } = mount(null, null)
    await tick()
    const onUpdate = vi.fn()
    const onClose = vi.fn()
    component.$on('update', onUpdate)
    component.$on('close', onClose)
    const saveButton = root.querySelector('.footer button') as HTMLButtonElement
    saveButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick()

    expect(onUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ detail: { startDate: null, endDate: null } })
    )
    expect(onClose).toHaveBeenLastCalledWith(
      expect.objectContaining({ detail: { startDate: null, endDate: null } })
    )
  })
})
