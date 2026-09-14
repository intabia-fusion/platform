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
import DateInputBox from '../components/calendar/DateInputBox.svelte'

let target: HTMLElement

interface Mounted {
  component: DateInputBox
  host: HTMLElement
  digits: HTMLElement[] // day, month, year, [hour, min]
}

function mount (props: Partial<ComponentProps<DateInputBox>> = {}): Mounted {
  const host = document.createElement('div')
  target.appendChild(host)
  const merged = { currentDate: null, ...props }
  const component = new DateInputBox({ target: host, props: merged as ComponentProps<DateInputBox> })
  return { component, host, digits: Array.from(host.querySelectorAll('.digit')) }
}

/** Real focus() fires the component's on:focus listener directly (no bubbling needed). */
function focusField (el: HTMLElement): void {
  el.focus()
}

async function keydown (el: HTMLElement, init: KeyboardEventInit): Promise<void> {
  el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }))
  await tick()
}

async function typeDigit (el: HTMLElement, digit: string): Promise<void> {
  await keydown(el, { key: digit, code: `Digit${digit}` })
}

describe('DateInputBox', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-15T12:00:00Z'))
  })

  afterEach(() => {
    target.remove()
    vi.useRealTimers()
  })

  it('renders placeholders and no close button when currentDate is null', () => {
    const { host, digits } = mount({ currentDate: null })
    expect(digits).toHaveLength(3)
    // A placeholder is a label id, never a two/four digit number.
    digits.forEach((d) => {
      expect(/^\d+$/.test(d.textContent?.trim() ?? '')).toBe(false)
    })
    expect(host.querySelector('.close-btn')).toBeNull()
  })

  it('renders padded day/month/year and a close button for a set date', () => {
    const { host, digits } = mount({ currentDate: new Date(2026, 0, 5) })
    expect(digits[0].textContent?.trim()).toBe('05')
    expect(digits[1].textContent?.trim()).toBe('01')
    expect(digits[2].textContent?.trim()).toBe('2026')
    expect(host.querySelector('.close-btn')).not.toBeNull()
  })

  it('adds hour/min digits and a time divider only when withTime is set', () => {
    const withTime = mount({ currentDate: new Date(2026, 0, 5, 9, 3), withTime: true })
    expect(withTime.digits).toHaveLength(5)
    expect(withTime.digits[3].textContent?.trim()).toBe('09')
    expect(withTime.digits[4].textContent?.trim()).toBe('03')
    expect(withTime.host.querySelector('.time-divider')).not.toBeNull()

    const noTime = mount({ currentDate: new Date(2026, 0, 5) })
    expect(noTime.digits).toHaveLength(3)
    expect(noTime.host.querySelector('.time-divider')).toBeNull()
  })

  it('isNull: null date is null, a normal in-range date is not', () => {
    const { component } = mount({ currentDate: null })
    expect((component as any).isNull(null)).toBe(true)
    expect((component as any).isNull(new Date(2026, 0, 5))).toBe(false)
  })

  it('isNull: year outside 1970..3000 counts as null even with day/month set', () => {
    const { component } = mount()
    expect((component as any).isNull(new Date(1969, 0, 5))).toBe(true)
    expect((component as any).isNull(new Date(3001, 0, 5))).toBe(true)
    expect((component as any).isNull(new Date(1970, 0, 5))).toBe(false)
    expect((component as any).isNull(new Date(3000, 0, 5))).toBe(false)
  })

  it('clicking the close button clears the date and dispatches save', async () => {
    const { host, component } = mount({ currentDate: new Date(2026, 0, 5) })
    const onSave = vi.fn()
    component.$on('save', onSave)

    const closeBtn = host.querySelector('.close-btn') as HTMLElement
    closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await tick()

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(host.querySelector('.close-btn')).toBeNull()
  })

  it('typing two digits into the day field fills it and auto-advances to month', async () => {
    const { digits } = mount({ currentDate: null })
    const [day, month] = digits
    focusField(day)
    await typeDigit(day, '1')
    await typeDigit(day, '5')

    expect(day.textContent?.trim()).toBe('15')
    expect(document.activeElement).toBe(month)
  })

  it('a first digit that cannot extend to a valid day (>=4) advances immediately', async () => {
    const { digits } = mount({ currentDate: null })
    const [day, month] = digits
    focusField(day)
    await typeDigit(day, '5')

    expect(day.textContent?.trim()).toBe('05')
    expect(document.activeElement).toBe(month)
  })

  it('completing day, month and year builds the date and dispatches save once', async () => {
    const { digits, component } = mount({ currentDate: null })
    const [day, month, year] = digits
    const onSave = vi.fn()
    component.$on('save', onSave)

    focusField(day)
    await typeDigit(day, '1')
    await typeDigit(day, '5')
    await typeDigit(month, '0')
    await typeDigit(month, '6')
    await typeDigit(year, '2')
    await typeDigit(year, '0')
    await typeDigit(year, '2')
    await typeDigit(year, '6')

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(day.textContent?.trim()).toBe('15')
    expect(month.textContent?.trim()).toBe('06')
    expect(year.textContent?.trim()).toBe('2026')

    const onClose = vi.fn()
    component.$on('close', onClose)
    await keydown(year, { key: 'Enter', code: 'Enter' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // pinned behaviour, not a desired one: Enter re-syncs edits from the (still null) `currentDate`
  // prop whenever the date is incomplete, wiping any digits typed so far.
  it('pressing Enter on an incomplete date wipes the digits typed so far', async () => {
    const { digits } = mount({ currentDate: null })
    const [day] = digits
    focusField(day)
    await typeDigit(day, '1')
    expect(day.textContent?.trim()).toBe('01')

    await keydown(day, { key: 'Enter', code: 'Enter' })
    expect(/^\d+$/.test(day.textContent?.trim() ?? '')).toBe(false)
  })

  it('Backspace clears the focused field, and the next digit starts fresh (no accumulation)', async () => {
    const { digits } = mount({ currentDate: new Date(2026, 0, 15) })
    const [day] = digits
    focusField(day)
    await keydown(day, { key: 'Backspace', code: 'Backspace' })
    expect(/^\d+$/.test(day.textContent?.trim() ?? '')).toBe(false)

    await typeDigit(day, '3')
    expect(day.textContent?.trim()).toBe('03')
  })

  it('Tab dispatches save only from the last field (year, or min with withTime)', async () => {
    const { digits, component } = mount({ currentDate: null })
    const [day, , year] = digits
    const onSave = vi.fn()
    component.$on('save', onSave)

    focusField(day)
    await keydown(day, { key: 'Tab', code: 'Tab' })
    expect(onSave).not.toHaveBeenCalled()

    focusField(year)
    await keydown(year, { key: 'Tab', code: 'Tab' })
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('Tab dispatches save from min, not hour, when withTime is set', async () => {
    const { digits, component } = mount({ currentDate: null, withTime: true })
    const [, , , hour, min] = digits
    const onSave = vi.fn()
    component.$on('save', onSave)

    focusField(hour)
    await keydown(hour, { key: 'Tab', code: 'Tab' })
    expect(onSave).not.toHaveBeenCalled()

    focusField(min)
    await keydown(min, { key: 'Tab', code: 'Tab' })
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('ArrowUp/ArrowDown step the focused field of a set date', async () => {
    const { digits } = mount({ currentDate: new Date(2026, 0, 15) })
    const [day] = digits
    focusField(day)

    await keydown(day, { key: 'ArrowUp', code: 'ArrowUp' })
    expect(day.textContent?.trim()).toBe('16')

    await keydown(day, { key: 'ArrowDown', code: 'ArrowDown' })
    expect(day.textContent?.trim()).toBe('15')

    await keydown(day, { key: 'ArrowDown', code: 'ArrowDown' })
    expect(day.textContent?.trim()).toBe('14')
  })

  it('ArrowLeft/ArrowRight move selection between fields, wrapping at the ends', async () => {
    const { digits } = mount({ currentDate: null })
    const [day, month, year] = digits

    focusField(year)
    await keydown(year, { key: 'ArrowLeft', code: 'ArrowLeft' })
    expect(document.activeElement).toBe(month)

    await keydown(month, { key: 'ArrowLeft', code: 'ArrowLeft' })
    expect(document.activeElement).toBe(day)

    // day is the first field: ArrowLeft wraps around to the last one (year, no time).
    await keydown(day, { key: 'ArrowLeft', code: 'ArrowLeft' })
    expect(document.activeElement).toBe(year)

    // year is the last field: ArrowRight wraps back to the first one (day).
    await keydown(year, { key: 'ArrowRight', code: 'ArrowRight' })
    expect(document.activeElement).toBe(day)
  })
})
