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
import { getEmbeddedLabel } from '@hcengineering/platform'
import { tick, type ComponentProps } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { formatDate } from '../../components/calendar/internal/DateUtils'
import ui from '../../plugin'
import DatePicker from '../../ui-kit/date/DatePicker.svelte'
import DateLabel from '../../ui-kit/date/DateLabel.svelte'
import DateSelect from '../../ui-kit/date/DateSelect.svelte'
import { getDueState } from '../../ui-kit/date/due'
import { formatDateValue } from '../../ui-kit/date/format'

const popups = vi.hoisted(() => ({ showPopup: vi.fn() }))

vi.mock('../../popups', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  showPopup: popups.showPopup
}))

const NOW = new Date(2026, 9, 18, 12, 0)
const VALUE = new Date(2026, 9, 5, 9, 7).getTime()
const PLACEHOLDER = getEmbeddedLabel('No due date')

let target: HTMLElement
const mounted: Array<{ $destroy: () => void }> = []

function mountSelect (props: ComponentProps<DateSelect>): {
  root: HTMLElement
  button: HTMLButtonElement
  component: DateSelect
} {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new DateSelect({ target: host, props })
  mounted.push(component)
  return {
    root: host.querySelector('.date-select') as HTMLElement,
    button: host.querySelector('button') as HTMLButtonElement,
    component
  }
}

function mountLabel (props: ComponentProps<DateLabel>): HTMLElement {
  const host = document.createElement('div')
  target.appendChild(host)
  mounted.push(new DateLabel({ target: host, props }))
  return host.querySelector('.date-label') as HTMLElement
}

function lastCall (): any[] {
  return popups.showPopup.mock.calls[popups.showPopup.mock.calls.length - 1]
}

describe('ui-kit date', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    target = document.createElement('div')
    document.body.appendChild(target)
    popups.showPopup.mockReset().mockReturnValue({ id: 'popup', close: vi.fn(), update: vi.fn() })
  })

  afterEach(() => {
    mounted.splice(0).forEach((component) => {
      component.$destroy()
    })
    target.remove()
    vi.useRealTimers()
  })

  describe('formatDateValue', () => {
    it('shows the date without the current year', () => {
      expect(formatDateValue(VALUE, DateRangeMode.DATE, NOW)).toBe(formatDate(new Date(VALUE), false))
    })

    it('shows the year of another year', () => {
      const value = new Date(2025, 0, 2).getTime()
      expect(formatDateValue(value, DateRangeMode.DATE, NOW)).toBe(formatDate(new Date(value), true))
    })

    it('adds the time, or shows only it', () => {
      expect(formatDateValue(VALUE, DateRangeMode.DATETIME, NOW)).toBe(`${formatDate(new Date(VALUE), false)} 09:07`)
      expect(formatDateValue(VALUE, DateRangeMode.TIMEONLY, NOW)).toBe('09:07')
    })

    it('shows only the time in the time mode of an attribute', () => {
      expect(formatDateValue(VALUE, DateRangeMode.TIME, NOW)).toBe('09:07')
    })

    it('is empty for an invalid date', () => {
      expect(formatDateValue(Number.NaN, DateRangeMode.DATETIME, NOW)).toBe('')
    })
  })

  describe('getDueState', () => {
    const day = (offset: number): number => new Date(2026, 9, 18 + offset, 10).getTime()

    it('is critical today, a warning soon, overdue in the past and plain later', () => {
      expect(getDueState(day(0), false, NOW).tone).toBe('critical')
      expect(getDueState(day(1), false, NOW).tone).toBe('warning')
      expect(getDueState(day(-1), false, NOW).tone).toBe('overdue')
      expect(getDueState(day(30), false, NOW).tone).toBeUndefined()
    })

    it('has no tone for a closed task and nothing without a date', () => {
      expect(getDueState(day(-1), true, NOW).tone).toBeUndefined()
      expect(getDueState(null, false, NOW)).toEqual({ tone: undefined, tooltip: undefined })
    })

    it('hints the days left or overdue on hover', () => {
      const { tooltip } = getDueState(day(-3), false, NOW)
      expect(tooltip?.direction).toBe('top')
      expect(tooltip?.props).toMatchObject({ daysDifference: 3, isOverdue: true, iconModifier: 'overdue' })
    })
  })

  describe('DateSelect', () => {
    it('shows the date as the value of a select button', () => {
      const { root } = mountSelect({ value: VALUE })
      expect(root.querySelector('.select-button__value')?.textContent?.trim()).toBe(formatDate(new Date(VALUE), false))
      expect(root.querySelector('.select-button--placeholder')).toBeNull()
    })

    it('shows the placeholder without a date', () => {
      const { root } = mountSelect({ value: null, placeholder: PLACEHOLDER })
      expect(root.querySelector('.select-button--placeholder')).not.toBeNull()
      expect(root.querySelector('.select-button__value')?.textContent?.trim()).toBe('No due date')
    })

    it('opens the date picker with the date and the time mode', () => {
      const { button } = mountSelect({ value: VALUE, mode: DateRangeMode.DATETIME, popupLabel: PLACEHOLDER })
      button.click()
      const [component, props, position] = lastCall()
      expect(component).toBe(DatePicker)
      expect(props).toEqual({ value: VALUE, mode: DateRangeMode.DATETIME, shifts: true, label: PLACEHOLDER })
      expect(position).toBe('top')
    })

    it('leaves the title to the picker while it is unset, a due date keeps add / edit', () => {
      mountSelect({ value: null }).button.click()
      expect(lastCall()[1]).toEqual({ value: null, mode: DateRangeMode.DATE, shifts: true })
      mountSelect({ value: null, due: true }).button.click()
      expect(lastCall()[1]).toHaveProperty('label', ui.string.AddDueDate)
      mountSelect({ value: VALUE, due: true }).button.click()
      expect(lastCall()[1]).toHaveProperty('label', ui.string.EditDueDate)
    })

    it('turns off the quick shifts of the picker', () => {
      mountSelect({ value: VALUE, shifts: false }).button.click()
      expect(lastCall()[1]).toHaveProperty('shifts', false)
    })

    it('picks only the time in the time modes', async () => {
      for (const mode of [DateRangeMode.TIME, DateRangeMode.TIMEONLY]) {
        const onChange = vi.fn()
        const { button, component, root } = mountSelect({ value: VALUE, mode, popupLabel: PLACEHOLDER, shifts: false })
        component.$on('change', (e: CustomEvent<number | null>) => onChange(e.detail))
        button.click()
        const [popup, props, position, onClose] = lastCall()
        expect(popup).toBe(DatePicker)
        expect(props).toEqual({ value: VALUE, mode, shifts: false, label: PLACEHOLDER })
        expect(position).toBe('top')
        await tick()
        expect(button.getAttribute('aria-expanded')).toBe('true')
        const next = new Date(2026, 9, 5, 18, 40).getTime()
        onClose({ value: next })
        await tick()
        expect(onChange).toHaveBeenLastCalledWith(next)
        expect(root.querySelector('.select-button__value')?.textContent?.trim()).toBe('18:40')
        expect(button.getAttribute('aria-expanded')).not.toBe('true')
      }
    })

    it('keeps the time when its popup closes without a result, clears it on null', async () => {
      const onChange = vi.fn()
      const { button, component } = mountSelect({ value: null, mode: DateRangeMode.TIMEONLY })
      component.$on('change', (e: CustomEvent<number | null>) => onChange(e.detail))
      button.click()
      expect(lastCall()[1]).toEqual({ value: null, mode: DateRangeMode.TIMEONLY, shifts: true })
      lastCall()[3](null)
      lastCall()[3](undefined)
      expect(onChange).not.toHaveBeenCalled()
      button.click()
      lastCall()[3]({ value: null })
      expect(onChange).toHaveBeenCalledWith(null)
    })

    it('does not let the click reach the row', () => {
      const onRow = vi.fn()
      const { button } = mountSelect({ value: VALUE })
      target.addEventListener('click', onRow)
      button.click()
      expect(onRow).not.toHaveBeenCalled()
    })

    it('opens one popup at a time and is pressed while it is open', async () => {
      const { button } = mountSelect({ value: VALUE })
      button.click()
      button.click()
      expect(popups.showPopup).toHaveBeenCalledTimes(1)
      await tick()
      expect(button.getAttribute('aria-expanded')).toBe('true')
      lastCall()[3]()
      await tick()
      expect(button.getAttribute('aria-expanded')).not.toBe('true')
    })

    it('says it opens a dialog', () => {
      expect(mountSelect({ value: VALUE }).button.getAttribute('aria-haspopup')).toBe('dialog')
    })

    it('closes its open popup when it is destroyed', () => {
      for (const mode of [DateRangeMode.DATE, DateRangeMode.TIMEONLY]) {
        const close = vi.fn()
        popups.showPopup.mockReturnValueOnce({ id: 'popup', close, update: vi.fn() })
        const { button, component } = mountSelect({ value: VALUE, mode })
        button.click()
        mounted.splice(mounted.indexOf(component), 1)
        component.$destroy()
        expect(close).toHaveBeenCalledTimes(1)
      }
    })

    it('does not close a popup that closed already when it is destroyed', () => {
      const close = vi.fn()
      popups.showPopup.mockReturnValueOnce({ id: 'popup', close, update: vi.fn() })
      const { button, component } = mountSelect({ value: VALUE })
      button.click()
      lastCall()[3]()
      mounted.splice(mounted.indexOf(component), 1)
      component.$destroy()
      expect(close).not.toHaveBeenCalled()
    })

    it('sends the new timestamp and null on clearing', async () => {
      const onChange = vi.fn()
      const { button, component, root } = mountSelect({ value: VALUE })
      component.$on('change', (e: CustomEvent<number | null>) => onChange(e.detail))
      button.click()
      const next = new Date(2026, 9, 20)
      lastCall()[3]({ value: next.getTime() })
      await tick()
      expect(onChange).toHaveBeenLastCalledWith(next.getTime())
      expect(root.querySelector('.select-button__value')?.textContent?.trim()).toBe(formatDate(next, false))
      button.click()
      lastCall()[3]({ value: null })
      expect(onChange).toHaveBeenLastCalledWith(null)
      button.click()
      lastCall()[3](null)
      expect(onChange).toHaveBeenCalledTimes(2)
    })

    it('does not open while readonly or disabled', () => {
      mountSelect({ value: VALUE, readonly: true }).button.click()
      mountSelect({ value: VALUE, disabled: true }).button.click()
      expect(popups.showPopup).not.toHaveBeenCalled()
    })

    it('marks the tone and the readonly look', () => {
      const { root } = mountSelect({ value: VALUE, tone: 'overdue', readonly: true })
      expect(root.classList).toContain('date-select--overdue')
      expect(root.classList).toContain('date-select--readonly')
    })

    it('takes the date mode and the placeholder again when they are set to undefined', async () => {
      const { root, component } = mountSelect({
        value: VALUE,
        mode: DateRangeMode.DATETIME,
        placeholder: PLACEHOLDER
      })
      expect(root.querySelector('.select-button__value')?.textContent?.trim()).toBe(
        formatDateValue(VALUE, DateRangeMode.DATETIME)
      )
      component.$set({ mode: undefined, placeholder: undefined, value: null })
      await tick()
      expect(root.querySelector('.select-button__value')?.textContent?.trim()).not.toBe('No due date')
      component.$set({ value: VALUE })
      await tick()
      expect(root.querySelector('.select-button__value')?.textContent?.trim()).toBe(formatDate(new Date(VALUE), false))
    })

    it('does not announce a popup while readonly', () => {
      const { button } = mountSelect({ value: VALUE, readonly: true })
      expect(button.hasAttribute('aria-haspopup')).toBe(false)
      expect(button.hasAttribute('aria-expanded')).toBe(false)
      expect(button.getAttribute('aria-disabled')).toBe('true')
      expect(mountSelect({ value: VALUE }).button.getAttribute('aria-haspopup')).toBe('dialog')
    })

    it('takes the tone from the due date unless a tone is given', () => {
      const overdue = new Date(2026, 9, 10).getTime()
      expect(mountSelect({ value: overdue, due: true }).root.classList).toContain('date-select--overdue')
      expect(mountSelect({ value: overdue, due: true, ignoreOverdue: true }).root.classList).toContain(
        'date-select--normal'
      )
      expect(mountSelect({ value: overdue, due: true, tone: 'warning' }).root.classList).toContain(
        'date-select--warning'
      )
    })

    it('passes the button props through', () => {
      const { button } = mountSelect({ value: VALUE, kind: 'ghost', size: 'medium' })
      expect(button.classList).toContain('button--ghost')
      expect(button.classList).toContain('button--medium')
    })
  })

  describe('DateLabel', () => {
    it('shows the date as text with the calendar icon', () => {
      const root = mountLabel({ value: VALUE, mode: DateRangeMode.TIMEONLY })
      expect(root.querySelector('button')).toBeNull()
      expect(root.querySelector('.date-label__icon')).not.toBeNull()
      expect(root.querySelector('.date-label__text')?.textContent?.trim()).toBe('09:07')
    })

    it('puts a divider between the date and the time, reading as one text', () => {
      const root = mountLabel({ value: VALUE, mode: DateRangeMode.DATETIME })
      expect(root.querySelectorAll('.date-value__part')).toHaveLength(2)
      expect(root.querySelector('.date-value__divider')).not.toBeNull()
      expect(root.querySelector('.date-label__text')?.textContent?.trim()).toBe(
        formatDateValue(VALUE, DateRangeMode.DATETIME)
      )
      expect(mountLabel({ value: VALUE, mode: DateRangeMode.DATE }).querySelector('.date-value__divider')).toBeNull()
    })

    it('shows the placeholder without a date', () => {
      const root = mountLabel({ value: undefined, placeholder: PLACEHOLDER })
      expect(root.classList).toContain('date-label--empty')
      expect(root.querySelector('.date-label__text')?.textContent?.trim()).toBe('No due date')
    })

    it('takes the tone from the due date', () => {
      const root = mountLabel({ value: new Date(2026, 9, 18, 15).getTime(), due: true })
      expect(root.classList).toContain('date-label--critical')
    })

    it('hides the icon and marks the tone', () => {
      const root = mountLabel({ value: VALUE, showIcon: false, tone: 'warning' })
      expect(root.querySelector('.date-label__icon')).toBeNull()
      expect(root.classList).toContain('date-label--warning')
    })
  })
})
