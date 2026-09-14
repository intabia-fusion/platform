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
import TimeInputBox from '../components/calendar/TimeInputBox.svelte'
import { fromCurrentToTz } from '../components/calendar/internal/DateUtils'

let target: HTMLElement

interface Mounted {
  component: TimeInputBox
  host: HTMLElement
  hour: HTMLElement
  min: HTMLElement
}

function mount (props: Record<string, unknown>): Mounted {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new TimeInputBox({ target: host, props })
  const digits = host.querySelectorAll('.digit')
  return { component, host, hour: digits[0] as HTMLElement, min: digits[1] as HTMLElement }
}

const key = (span: HTMLElement, code: string, keyChar: string = code): void => {
  span.dispatchEvent(new KeyboardEvent('keydown', { key: keyChar, code, bubbles: true }))
}
const digitKey = (span: HTMLElement, digit: number): void => { key(span, `Digit${digit}`, String(digit)) }

describe('TimeInputBox', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 15, 12, 0, 0))
  })

  afterEach(() => {
    target.remove()
    vi.useRealTimers()
  })

  it('renders zero-padded hour and minute, and carries size/noBorder/disabled classes', () => {
    const { host, hour, min } = mount({
      currentDate: new Date(2026, 0, 15, 9, 7),
      size: 'narrow',
      noBorder: true,
      disabled: true
    })
    expect(hour.textContent?.trim()).toBe('09')
    expect(min.textContent?.trim()).toBe('07')
    const box = host.querySelector('.datetime-input') as HTMLElement
    expect(box.classList.contains('narrow')).toBe(true)
    expect(box.classList.contains('noBorder')).toBe(true)
    expect(box.classList.contains('disabled')).toBe(true)
  })

  it('converts the displayed value through the given time zone', () => {
    const currentDate = new Date(2026, 0, 15, 9, 7)
    const timeZone = 'Pacific/Kiritimati' // UTC+14, far enough to differ from any host zone
    const { hour, min } = mount({ currentDate, timeZone })
    const expected = fromCurrentToTz(currentDate, timeZone)
    expect(hour.textContent?.trim()).toBe(expected.getHours().toString().padStart(2, '0'))
    expect(min.textContent?.trim()).toBe(expected.getMinutes().toString().padStart(2, '0'))
  })

  it('ignores key presses while disabled', () => {
    const { component, hour } = mount({ currentDate: new Date(2026, 0, 15, 9, 7), disabled: true })
    component.focused('hour')
    digitKey(hour, 5)
    expect(hour.textContent?.trim()).toBe('09')
  })

  it('types two digits into the hour, clamps above the max, then auto-advances to minutes', async () => {
    const { component, hour } = mount({ currentDate: new Date(2026, 0, 15, 9, 7) })
    component.focused('hour')
    digitKey(hour, 2)
    digitKey(hour, 9)
    await tick()
    // 2*10+9=29 clamped to the 23 hour max
    expect(hour.textContent?.trim()).toBe('23')
  })

  it('completes both fields, applies the value and dispatches update', async () => {
    const { component, hour, min } = mount({ currentDate: new Date(2026, 0, 15, 0, 0) })
    const onUpdate = vi.fn()
    component.$on('update', onUpdate)

    component.focused('hour')
    digitKey(hour, 1)
    digitKey(hour, 4)
    await tick()
    component.focused('min')
    digitKey(min, 3)
    digitKey(min, 0)
    await tick()

    expect(hour.textContent?.trim()).toBe('14')
    expect(min.textContent?.trim()).toBe('30')
    const last = onUpdate.mock.calls.at(-1)?.[0]
    expect(last.detail.getHours()).toBe(14)
    expect(last.detail.getMinutes()).toBe(30)
  })

  it('clears a field to its placeholder state on Backspace', () => {
    const { component, hour } = mount({ currentDate: new Date(2026, 0, 15, 9, 7) })
    component.focused('hour')
    key(hour, 'Backspace')
    expect(component.isNull()).toBe(true)
  })

  it('steps the selected field with ArrowUp/ArrowDown and dispatches update', async () => {
    const { component, hour } = mount({ currentDate: new Date(2026, 0, 15, 9, 7) })
    const onUpdate = vi.fn()
    component.$on('update', onUpdate)
    component.focused('hour')

    key(hour, 'ArrowUp')
    await tick()
    expect(hour.textContent?.trim()).toBe('10')
    key(hour, 'ArrowDown')
    key(hour, 'ArrowDown')
    await tick()
    expect(hour.textContent?.trim()).toBe('08')
    expect(onUpdate).toHaveBeenCalledTimes(3)
  })

  it('does nothing on ArrowUp/ArrowDown while the field is empty', () => {
    const { component, hour } = mount({ currentDate: new Date(2026, 0, 15, 9, 7) })
    const onUpdate = vi.fn()
    component.$on('update', onUpdate)
    component.focused('hour')
    key(hour, 'Backspace')
    onUpdate.mockClear()

    key(hour, 'ArrowUp')
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('moves selection between hour and minute with ArrowLeft/ArrowRight, wrapping at the ends', async () => {
    const { component, hour, min } = mount({ currentDate: new Date(2026, 0, 15, 9, 7) })
    component.focused('hour')
    key(hour, 'ArrowLeft') // wraps from the first field to the last
    await tick()
    expect(document.activeElement).toBe(min)

    key(min, 'ArrowRight') // wraps from the last field back to the first
    await tick()
    expect(document.activeElement).toBe(hour)
  })

  it('dispatches close on Enter and save on Tab from the minute field only', () => {
    const { component, hour, min } = mount({ currentDate: new Date(2026, 0, 15, 9, 7) })
    const onClose = vi.fn()
    const onSave = vi.fn()
    component.$on('close', onClose)
    component.$on('save', onSave)

    component.focused('hour')
    key(hour, 'Enter')
    expect(onClose).toHaveBeenCalledTimes(1)

    component.focused('hour')
    key(hour, 'Tab')
    expect(onSave).not.toHaveBeenCalled()

    component.focused('min')
    key(min, 'Tab')
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('isNull(date) re-derives the fields from a newly given date', async () => {
    const { component, hour, min } = mount({ currentDate: new Date(2026, 0, 15, 9, 7) })
    expect(component.isNull()).toBe(false)

    const another = new Date(2026, 5, 1, 3, 45)
    expect(component.isNull(another)).toBe(false)
    await tick()
    expect(hour.textContent?.trim()).toBe('03')
    expect(min.textContent?.trim()).toBe('45')
  })
})
