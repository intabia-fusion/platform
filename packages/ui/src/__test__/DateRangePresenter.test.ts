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

import { DateRangeMode } from '@hcengineering/core'
import { tick } from 'svelte'
import { get } from 'svelte/store'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'svelte'
import DateRangePresenter from '../components/calendar/DateRangePresenter.svelte'
import { getMonthName } from '../components/calendar/internal/DateUtils'
import { modalStore } from '../modals'
import { popupstore } from '../popups'

let target: HTMLElement

interface Mounted {
  component: DateRangePresenter
  host: HTMLElement
}

function mount (props: Partial<ComponentProps<DateRangePresenter>> = {}): Mounted {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new DateRangePresenter({ target: host, props: props as ComponentProps<DateRangePresenter> })
  return { component, host }
}

const norm = (s: string | null): string => (s ?? '').replace(/\s+/g, ' ').trim()

describe('DateRangePresenter', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
    modalStore.set([])
    vi.useFakeTimers()
    // local components on purpose - getters below stay independent of the runner's timezone
    vi.setSystemTime(new Date(2026, 0, 15, 12, 34, 0))
  })

  afterEach(() => {
    target.remove()
    vi.useRealTimers()
  })

  it('inline: shows the NoDate placeholder and default icon when value is empty', () => {
    const { host } = mount({ inline: true })
    expect(host.querySelector('.overflow-label')).not.toBeNull()
    // DPCalendar (normal) has exactly one <path>, DPCalendarOver (overdue) has two
    expect(host.querySelectorAll('.btn-icon svg path').length).toBe(1)
  })

  it('inline: omits the year when it matches the current year, shows it otherwise', () => {
    const sameYear = new Date(2026, 5, 20, 9, 5, 0).getTime()
    const otherYear = new Date(2027, 5, 20, 9, 5, 0).getTime()
    const month = getMonthName(new Date(sameYear), 'short')

    const same = mount({ inline: true, value: sameYear })
    expect(norm(same.host.textContent)).toBe(`20 ${month}`)

    const other = mount({ inline: true, value: otherYear })
    expect(norm(other.host.textContent)).toContain('2027')
  })

  it('inline: mode DATETIME appends zero-padded hours and minutes', () => {
    const value = new Date(2026, 5, 20, 9, 5, 0).getTime()
    const { host } = mount({ inline: true, mode: DateRangeMode.DATETIME, value })
    expect(norm(host.textContent)).toMatch(/^20\s+\S+\s+09\s*:\s*05$/)
  })

  it('inline: hides the icon when shouldShowAvatar is false', () => {
    const { host } = mount({ inline: true, shouldShowAvatar: false })
    expect(host.querySelector('.btn-icon')).toBeNull()
  })

  it('inline: overdue icon modifier swaps to DPCalendarOver unless shouldIgnoreOverdue', () => {
    const overdue = mount({ inline: true, iconModifier: 'overdue' })
    expect(overdue.host.querySelectorAll('.btn-icon svg path').length).toBe(2)

    const ignored = mount({ inline: true, iconModifier: 'overdue', shouldIgnoreOverdue: true })
    expect(ignored.host.querySelectorAll('.btn-icon svg path').length).toBe(1)
  })

  it('inline: applies fs-bold when accent is set', () => {
    const { host } = mount({ inline: true, accent: true })
    expect((host.firstElementChild as HTMLElement).classList.contains('fs-bold')).toBe(true)
  })

  it('button: marks itself notSelected and shows the placeholder when value is empty', () => {
    const { host } = mount({})
    const button = host.querySelector('button') as HTMLButtonElement
    expect(button.classList.contains('notSelected')).toBe(true)
    expect(button.querySelector('.overflow-label')).not.toBeNull()
  })

  it('button: carries kind and size in the class list and drops notSelected once there is a value', () => {
    const value = new Date(2026, 5, 20, 9, 5, 0).getTime()
    const { host } = mount({ kind: 'regular', size: 'large', value })
    const button = host.querySelector('button') as HTMLButtonElement
    expect(button.classList.contains('regular')).toBe(true)
    expect(button.classList.contains('large')).toBe(true)
    expect(button.classList.contains('notSelected')).toBe(false)
  })

  it('button: click on a DATE-mode editable presenter opens the date popup with the current value', async () => {
    const value = new Date(2026, 5, 20, 9, 5, 0).getTime()
    const { host } = mount({ editable: true, mode: DateRangeMode.DATE, value })
    const button = host.querySelector('button') as HTMLButtonElement

    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await tick()

    const popups = get(popupstore)
    expect(popups.length).toBe(1)
    const expected = new Date(value)
    expected.setSeconds(0, 0)
    expect((popups[0].props.currentDate as Date).getTime()).toBe(expected.getTime())
    expect(popups[0].props.withTime).toBe(false)
  })

  it('button: click does nothing while not editable', async () => {
    const { host } = mount({ editable: false, mode: DateRangeMode.DATE })
    const button = host.querySelector('button') as HTMLButtonElement

    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await tick()

    expect(get(popupstore).length).toBe(0)
  })

  it('button: click on a TIME-mode editable presenter switches to inline digit editing', async () => {
    const { host } = mount({ editable: true, mode: DateRangeMode.TIME })
    const button = host.querySelector('button') as HTMLButtonElement

    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await tick()

    expect(button.classList.contains('edit')).toBe(true)
    expect(host.querySelectorAll('.digit').length).toBe(2) // hour, minute only - no date fields in TIME mode
    expect(host.querySelector('.close-btn')).toBeNull() // no value yet
  })

  it('close button clears the value and reverts the field to its placeholder', async () => {
    const value = new Date(2026, 5, 20, 9, 5, 0).getTime()
    const { host } = mount({ editable: true, mode: DateRangeMode.TIME, value })
    const button = host.querySelector('button') as HTMLButtonElement
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await tick()

    const hourDigit = host.querySelectorAll('.digit')[0] as HTMLElement
    expect(hourDigit.textContent?.trim()).toBe('09')

    const closeBtn = host.querySelector('.close-btn') as HTMLElement
    closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await tick()

    expect(host.querySelector('.close-btn')).toBeNull()
    expect(/^\d{2}$/.test(hourDigit.textContent?.trim() ?? '')).toBe(false)
  })

  it('ArrowUp on a digit field increments it and updates the dispatched value on Enter', async () => {
    const value = new Date(2026, 5, 20, 9, 5, 0).getTime()
    const { host, component } = mount({ editable: true, mode: DateRangeMode.TIME, value })
    const onChange = vi.fn()
    component.$on('change', onChange)

    const button = host.querySelector('button') as HTMLButtonElement
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await tick()

    const hourDigit = host.querySelectorAll('.digit')[0] as HTMLElement
    hourDigit.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp', key: 'ArrowUp', bubbles: true }))
    await tick()
    expect(hourDigit.textContent?.trim()).toBe('10')

    hourDigit.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', key: 'Enter', bubbles: true }))
    await tick()

    // TIME mode re-bases the saved value onto epoch day 1970-01-01, keeping only hours/minutes.
    const expected = new Date(0)
    expected.setHours(10)
    expected.setMinutes(5)
    expected.setSeconds(0, 0)
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ detail: expected.getTime() }))
  })

  it('Backspace clears a digit field so the next keystroke replaces rather than accumulates', async () => {
    const value = new Date(2026, 5, 20, 9, 5, 0).getTime()
    const { host } = mount({ editable: true, mode: DateRangeMode.TIME, value })
    const button = host.querySelector('button') as HTMLButtonElement
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await tick()

    const hourDigit = host.querySelectorAll('.digit')[0] as HTMLElement
    hourDigit.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backspace', key: 'Backspace', bubbles: true }))
    await tick()
    hourDigit.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit7', key: '7', bubbles: true }))
    await tick()

    expect(hourDigit.textContent?.trim()).toBe('07')
  })

  // Pinned current behaviour, likely a source quirk: adaptValue() seeds `currentDate` from the
  // wall-clock "now" even while value is empty and the fields show placeholders. The first digit
  // typed into one TIME field commits via fixEdits/setCurrentDate and, in doing so, reads that
  // stale "now" for the OTHER, still-untouched field - so it silently switches from its blank
  // placeholder to the current real-world minute instead of staying empty.
  it('typing into one empty TIME field bleeds the current wall-clock value into the other field', async () => {
    const { host } = mount({ editable: true, mode: DateRangeMode.TIME })
    const button = host.querySelector('button') as HTMLButtonElement
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await tick()

    const [hourDigit, minDigit] = Array.from(host.querySelectorAll('.digit')) as HTMLElement[]
    expect(/^\d{2}$/.test(minDigit.textContent?.trim() ?? '')).toBe(false) // still a placeholder

    hourDigit.focus()
    hourDigit.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit9', key: '9', bubbles: true }))
    await tick()

    expect(hourDigit.textContent?.trim()).toBe('09')
    // system time was frozen at 12:34 - the untouched minute field picks that "34" up
    expect(minDigit.textContent?.trim()).toBe('34')
  })
})
