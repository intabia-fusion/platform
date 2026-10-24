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
import { tick, type ComponentProps } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import DateInput from '../../ui-kit/date/DateInput.svelte'

const VALUE = new Date(2026, 9, 5, 9, 7).getTime()

let target: HTMLElement
const mounted: Array<{ $destroy: () => void }> = []

function mount (props: ComponentProps<DateInput>): {
  root: HTMLElement
  parts: HTMLElement[]
  component: DateInput
  changes: Array<number | null>
} {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new DateInput({ target: host, props })
  mounted.push(component)
  const changes: Array<number | null> = []
  component.$on('change', (event: CustomEvent<number | null>) => changes.push(event.detail))
  const root = host.querySelector('.date-input') as HTMLElement
  return { root, parts: Array.from(root.querySelectorAll<HTMLElement>('[role="spinbutton"]')), component, changes }
}

function press (element: HTMLElement, key: string): void {
  element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
}

async function type (element: HTMLElement, keys: string): Promise<void> {
  for (const key of keys) {
    press((document.activeElement as HTMLElement) ?? element, key)
    await tick()
  }
}

describe('ui-kit DateInput', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    mounted.splice(0).forEach((component) => {
      component.$destroy()
    })
    target.remove()
  })

  it('shows the parts of the mode as spinbuttons, placeholders while empty', () => {
    const date = mount({ value: VALUE })
    expect(date.parts.map((p) => p.textContent?.trim())).toEqual(['05', '10', '2026'])
    expect(date.parts[0].getAttribute('aria-valuenow')).toBe('5')
    expect(date.root.getAttribute('role')).toBe('group')

    const dateTime = mount({ value: VALUE, mode: DateRangeMode.DATETIME })
    expect(dateTime.parts.map((p) => p.textContent?.trim())).toEqual(['05', '10', '2026', '09', '07'])

    const time = mount({ value: VALUE, mode: DateRangeMode.TIME })
    expect(time.parts).toHaveLength(2)

    const empty = mount({ value: null })
    expect(empty.parts.every((p) => p.classList.contains('date-input__part--empty'))).toBe(true)
  })

  it('types a whole date part by part, moving on by itself', async () => {
    const { parts, changes } = mount({ value: null })
    parts[0].focus()
    await type(parts[0], '24')
    expect(document.activeElement).toBe(parts[1])
    await type(parts[1], '12')
    await type(parts[2], '2026')
    expect(changes).toEqual([new Date(2026, 11, 24, new Date().getHours(), new Date().getMinutes()).getTime()])
  })

  it('moves on after one digit when a second cannot follow, and clamps to the maximum', async () => {
    const { parts } = mount({ value: VALUE })
    parts[0].focus()
    await type(parts[0], '4')
    expect(document.activeElement).toBe(parts[1])
    await type(parts[1], '19')
    // "1" then "9" is more than 12: the month stays at 12.
    expect(parts[1].textContent?.trim()).toBe('12')
  })

  it('changes only the time in the time mode and keeps the day', async () => {
    const { parts, changes } = mount({ value: VALUE, mode: DateRangeMode.TIME })
    parts[0].focus()
    await type(parts[0], '18')
    await type(parts[1], '45')
    expect(changes.at(-1)).toBe(new Date(2026, 9, 5, 18, 45).getTime())
  })

  it('steps a part with the arrows, wrapping inside it', async () => {
    const { parts, changes } = mount({ value: new Date(2026, 9, 5, 9, 59).getTime(), mode: DateRangeMode.TIME })
    parts[1].focus()
    press(parts[1], 'ArrowUp')
    await tick()
    expect(changes).toEqual([new Date(2026, 9, 5, 9, 0).getTime()])
  })

  it('reports null when a part is cleared, and the clear button empties the field', async () => {
    const { root, parts, changes } = mount({ value: VALUE, clearable: true })
    parts[2].focus()
    press(parts[2], 'Backspace')
    await tick()
    expect(changes).toEqual([null])
    expect(root.querySelector('button')).toBeNull()

    const other = mount({ value: VALUE, clearable: true })
    other.root.querySelector('button')?.click()
    await tick()
    expect(other.changes).toEqual([null])
    expect(other.parts.every((p) => p.classList.contains('date-input__part--empty'))).toBe(true)
  })

  it('submits on Enter and focuses a part on request', async () => {
    const { parts, component } = mount({ value: VALUE, mode: DateRangeMode.DATETIME })
    const onSubmit = vi.fn<(event: CustomEvent<number | null>) => void>()
    component.$on('submit', onSubmit)
    component.focus('hour')
    expect(document.activeElement).toBe(parts[3])
    press(parts[3], 'Enter')
    expect(onSubmit.mock.calls[0][0].detail).toBe(VALUE)
  })

  it('raises a half-typed day to 1 on leaving instead of rolling back a month', async () => {
    const { parts, changes } = mount({ value: VALUE })
    parts[0].focus()
    await type(parts[0], '0')
    parts[0].blur()
    await tick()
    expect(parts[0].textContent?.trim()).toBe('01')
    expect(changes).toEqual([new Date(2026, 9, 1, 9, 7).getTime()])
  })

  it('leaves a half-typed year incomplete', async () => {
    const { parts, changes } = mount({ value: VALUE })
    parts[2].focus()
    await type(parts[2], '20')
    press(parts[2], 'Enter')
    await tick()
    expect(changes).toEqual([])
  })

  it('takes no keys while disabled', async () => {
    const { parts, changes } = mount({ value: VALUE, disabled: true })
    expect(parts[0].tabIndex).toBe(-1)
    expect(parts[0].getAttribute('aria-disabled')).toBe('true')
    press(parts[0], 'ArrowUp')
    press(parts[0], 'Backspace')
    await tick()
    expect(changes).toEqual([])
    expect(parts[0].textContent?.trim()).toBe('05')
  })

  it('shows the parts again in a new time zone', async () => {
    const { parts, component } = mount({ value: VALUE, mode: DateRangeMode.TIME, timeZone: 'UTC' })
    const utc = new Date(VALUE).getUTCHours()
    expect(parts[0].textContent?.trim()).toBe(String(utc).padStart(2, '0'))
    component.$set({ timeZone: 'Asia/Kolkata' })
    await tick()
    // Kolkata is UTC+5:30 all year.
    expect(parts[1].textContent?.trim()).toBe(String((new Date(VALUE).getUTCMinutes() + 30) % 60).padStart(2, '0'))
  })

  it('takes a new value from the place', async () => {
    const { parts, component } = mount({ value: VALUE })
    component.$set({ value: new Date(2027, 0, 2).getTime() })
    await tick()
    expect(parts.map((p) => p.textContent?.trim())).toEqual(['02', '01', '2027'])
  })

  it('recomputes the maximum of the day after the month and the year are typed', async () => {
    const { parts } = mount({})
    expect(parts[0].getAttribute('aria-valuemax')).toBe('31')
    parts[1].focus()
    await type(parts[1], '02')
    parts[2].focus()
    await type(parts[2], '2026')
    expect(parts[0].getAttribute('aria-valuemax')).toBe('28')
  })

  it('resolves the defaults when the props are set to undefined later', async () => {
    const { root, parts, component } = mount({ mode: DateRangeMode.DATETIME, kind: 'ghost', size: 'large' })
    expect(parts).toHaveLength(5)
    component.$set({ mode: undefined, kind: undefined, size: undefined })
    await tick()
    expect(root.querySelectorAll('[role="spinbutton"]')).toHaveLength(3)
    expect(root.classList.contains('date-input--secondary')).toBe(true)
    expect(root.classList.contains('date-input--small')).toBe(true)
  })
})
