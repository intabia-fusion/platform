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

import { DateRangeMode, convertToDay } from '@hcengineering/core'
import { getEmbeddedLabel } from '@hcengineering/platform'
import { tick, type ComponentProps } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import DatePicker from '../../ui-kit/date/DatePicker.svelte'
import type { DatePickerResult } from '../../ui-kit/date/types'

const NOW = new Date(2026, 9, 18, 12, 0, 30)
const VALUE = new Date(2026, 9, 5, 9, 30).getTime()
const MINUTE = 60000

let target: HTMLElement
const mounted: Array<{ $destroy: () => void }> = []

function mount (props: ComponentProps<DatePicker>): {
  root: HTMLElement
  closed: Array<DatePickerResult | null>
} {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new DatePicker({ target: host, props })
  mounted.push(component)
  const closed: Array<DatePickerResult | null> = []
  component.$on('close', (event: CustomEvent<DatePickerResult | null>) => closed.push(event.detail))
  return { root: host.querySelector('.date-picker') as HTMLElement, closed }
}

function calendars (root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('.calendar'))
}

function day (calendar: HTMLElement, n: number): HTMLButtonElement {
  return calendar.querySelector(`[data-day="${n}"]`) as HTMLButtonElement
}

function buttonByText (root: HTMLElement, text: string): HTMLButtonElement | undefined {
  return Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.includes(text))
}

// Each key goes to the part in focus, as the input moves it on by itself.
async function typeKeys (keys: string): Promise<void> {
  for (const key of keys) {
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
    await tick()
  }
}

describe('ui-kit DatePicker', () => {
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

  it('shows the title, the input and two months from the value', () => {
    const { root } = mount({ value: VALUE, label: getEmbeddedLabel('Due date') })
    expect(root.querySelector('.date-picker__title')?.textContent).toContain('Due date')
    expect(root.querySelectorAll('[role="spinbutton"]')).toHaveLength(3)
    const [first, second] = calendars(root)
    expect(first.querySelector('.calendar__title')?.textContent).toMatch(/2026/)
    expect(day(first, 5).classList.contains('calendar__day--selected')).toBe(true)
    expect(second.querySelectorAll('button.calendar__day')).toHaveLength(30)
    expect(root.querySelector('.date-picker__shifts')).toBeNull()
  })

  it('closes with the clicked day as a date without time', async () => {
    const { root, closed } = mount({ value: VALUE })
    day(calendars(root)[1], 3).click()
    await tick()
    expect(closed).toEqual([{ value: convertToDay(new Date(2026, 10, 3)).getTime() }])
  })

  it('with time a click fills the day and Save closes with the time kept', async () => {
    const { root, closed } = mount({ value: VALUE, mode: DateRangeMode.DATETIME })
    expect(root.querySelectorAll('[role="spinbutton"]')).toHaveLength(5)
    day(calendars(root)[0], 20).click()
    await tick()
    expect(closed).toEqual([])
    buttonByText(root, 'Save')?.click()
    await tick()
    expect(closed).toEqual([{ value: new Date(2026, 9, 20, 9, 30).getTime() }])
  })

  it('Save with the date cleared closes with null, the close button closes without a result', async () => {
    const { root, closed } = mount({ value: VALUE })
    root.querySelector<HTMLButtonElement>('.date-input button')?.click()
    await tick()
    buttonByText(root, 'Save')?.click()
    root.querySelector<HTMLButtonElement>('.date-picker__header button')?.click()
    expect(closed).toEqual([{ value: null }, null])
  })

  it('offers quick shifts from now', async () => {
    const { root, closed } = mount({ value: VALUE, mode: DateRangeMode.DATETIME, shifts: true })
    const buttons = root.querySelectorAll<HTMLButtonElement>('.date-picker__shifts button')
    // 3 minutes + 5 hours + 4 days.
    expect(buttons).toHaveLength(12)
    buttons[1].click()
    await tick()
    expect(closed).toEqual([{ value: new Date(2026, 9, 18, 12, 0).getTime() + 15 * MINUTE }])
    expect(mount({ value: VALUE, shifts: true }).root.querySelectorAll('.date-picker__shifts button')).toHaveLength(4)
  })

  it('picks a range across both months and saves it in order', async () => {
    const { root, closed } = mount({ range: true, value: null, end: null, label: getEmbeddedLabel('Period') })
    expect(root.querySelectorAll('.date-input')).toHaveLength(2)
    const [first, second] = calendars(root)
    day(second, 4).click()
    await tick()
    day(first, 28).click()
    await tick()
    expect(day(first, 30).classList.contains('calendar__day--inside')).toBe(true)
    buttonByText(root, 'Save')?.click()
    expect(closed).toEqual([{ value: new Date(2026, 9, 28).getTime(), end: new Date(2026, 10, 4).getTime() }])
  })

  it('moves both months together', async () => {
    const { root } = mount({ value: VALUE })
    const [, second] = calendars(root)
    second.querySelector<HTMLButtonElement>('.calendar__navigation button')?.click()
    await tick()
    const [first2, second2] = calendars(root)
    expect(first2.querySelectorAll('button.calendar__day')).toHaveLength(30)
    expect(second2.querySelectorAll('button.calendar__day')).toHaveLength(31)
  })

  it('is a dialog named by its title', () => {
    const { root } = mount({ value: VALUE, label: getEmbeddedLabel('Due date') })
    expect(root.getAttribute('role')).toBe('dialog')
    const title = document.getElementById(root.getAttribute('aria-labelledby') ?? '')
    expect(title?.textContent).toContain('Due date')
  })

  it('in the time modes picks only the time of the day, without months', async () => {
    for (const mode of [DateRangeMode.TIME, DateRangeMode.TIMEONLY]) {
      const { root, closed } = mount({ value: VALUE, mode })
      expect(calendars(root)).toHaveLength(0)
      const parts = Array.from(root.querySelectorAll<HTMLElement>('[role="spinbutton"]'))
      expect(parts.map((p) => p.textContent?.trim())).toEqual(['09', '30'])
      parts[0].focus()
      await typeKeys('1745')
      buttonByText(root, 'Save')?.click()
      expect(closed).toEqual([{ value: new Date(2026, 9, 5, 17, 45).getTime() }])
    }
  })

  it('titles itself by the mode unless a label is given', async () => {
    const date = mount({ value: VALUE })
    const time = mount({ value: VALUE, mode: DateRangeMode.TIMEONLY })
    await tick()
    expect(date.root.querySelector('.date-picker__title')?.textContent).toContain('ui:string:SelectDate')
    expect(time.root.querySelector('.date-picker__title')?.textContent).toContain('ui:string:SelectTime')
  })

  it('in the time modes offers only minute and hour shifts, today without a value', async () => {
    const { root, closed } = mount({ value: null, mode: DateRangeMode.TIMEONLY, shifts: true })
    expect(root.querySelectorAll('.date-picker__shifts button')).toHaveLength(8)
    expect(root.querySelectorAll('[role="spinbutton"].date-input__part--empty')).toHaveLength(2)
    root.querySelectorAll<HTMLButtonElement>('.date-picker__shifts button')[0].click()
    await tick()
    expect(closed).toEqual([{ value: new Date(2026, 9, 18, 12, 0).getTime() + 5 * MINUTE }])
  })

  it('names the start and the end inputs of a range, and leaves a single input to its title', async () => {
    const { root } = mount({ range: true, value: null, end: null })
    await new Promise((resolve) => setTimeout(resolve, 0))
    await tick()
    const groups = Array.from(root.querySelectorAll('.date-picker__inputs [role="group"]'))
    expect(groups.map((group) => group.getAttribute('aria-label'))).toEqual([
      'ui:string:StartDate',
      'ui:string:EndDate'
    ])

    const single = mount({ value: null }).root.querySelector('.date-picker__inputs [role="group"]')
    expect(single?.hasAttribute('aria-label')).toBe(false)
  })

  it('a range stays a range of days in a time mode', () => {
    const { root } = mount({ range: true, value: null, end: null, mode: DateRangeMode.TIME })
    expect(calendars(root).length).toBeGreaterThan(0)
    expect(root.querySelectorAll('.date-input')[0].querySelectorAll('[role="spinbutton"]')).toHaveLength(3)
  })

  it('compact: one month, a click closes with the day at the time of the value', async () => {
    const { root, closed } = mount({ value: VALUE, compact: true })
    expect(calendars(root)).toHaveLength(1)
    expect(root.querySelector('.date-picker__header')).toBeNull()
    day(calendars(root)[0], 9).click()
    await tick()
    expect(closed).toEqual([{ value: new Date(2026, 9, 9, 9, 30).getTime() }])
  })
})
