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
import NumberInput from '../components/NumberInput.svelte'

let target: HTMLElement

interface Mounted {
  component: NumberInput
  host: HTMLElement
  input: HTMLInputElement
}

function mount (props: Record<string, unknown> = {}): Mounted {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new NumberInput({ target: host, props: { value: undefined, ...props } })
  return { component, host, input: host.querySelector('input') as HTMLInputElement }
}

async function type (input: HTMLInputElement, value: string): Promise<void> {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await tick()
}

describe('NumberInput', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders a number input', () => {
    expect(mount().input.type).toBe('number')
  })

  it('binds the value both ways', async () => {
    const { component, input } = mount({ value: 5 })
    expect(input.value).toBe('5')

    await type(input, '9')
    expect(input.value).toBe('9')

    component.$set({ value: 20 })
    await tick()
    expect(input.value).toBe('20')
  })

  // afterUpdate also runs computeSize, which dispatches 'input' again on every re-render - pinned, not just on:input.
  it('dispatches input while typing', async () => {
    const { component, input } = mount({ value: 1 })
    const onInput = vi.fn()
    component.$on('input', onInput)

    await type(input, '2')
    expect(onInput).toHaveBeenCalledTimes(2)
  })

  // setValue runs on every value change (not just native change/blur), so 'change' fires per keystroke - pinned.
  it('dispatches change on every value update, not only on native change', async () => {
    const { component, input } = mount({ value: 1 })
    const onChange = vi.fn()
    component.$on('change', onChange)

    await type(input, '2')
    expect(onChange).toHaveBeenCalled()
  })

  it('clamps to maxValue live while typing, no change/blur needed', async () => {
    const { input } = mount({ value: 5, maxValue: 10 })
    await type(input, '42')
    expect(input.value).toBe('10')
  })

  it('clamps to minValue live while typing', async () => {
    const { input } = mount({ value: 5, minValue: 1 })
    await type(input, '-3')
    expect(input.value).toBe('1')
  })

  // setValue returns early without clamping or dispatching change when the range is inverted - pinned behaviour.
  it('leaves the value alone when maxValue is below minValue', async () => {
    const { input } = mount({ value: 5, minValue: 10, maxValue: 1 })
    await type(input, '42')
    expect(input.value).toBe('42')
  })

  it('rounds the value to maxDigitsAfterPoint', async () => {
    const { input } = mount({ value: 2.567, maxDigitsAfterPoint: 2 })
    await tick()
    expect(input.value).toBe('2.57')
  })

  it('increments and decrements value via the stepper buttons', async () => {
    const { component, host } = mount({ value: 5 })
    const onChange = vi.fn()
    component.$on('change', onChange)
    const buttons = host.querySelectorAll('button')
    expect(buttons.length).toBe(2)

    buttons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await tick()
    expect(host.querySelector('input')?.value).toBe('6')
    expect(onChange).toHaveBeenCalled()

    buttons[1].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await tick()
    expect(host.querySelector('input')?.value).toBe('5')
  })

  it('steps from an undefined value as if it were 0', async () => {
    const { host } = mount({ value: undefined })
    const buttons = host.querySelectorAll('button')
    buttons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await tick()
    expect(host.querySelector('input')?.value).toBe('1')
  })

  it('passes disabled down to the input and both buttons', () => {
    const { input, host } = mount({ value: 1, disabled: true })
    expect(input.disabled).toBe(true)
    host.querySelectorAll('button').forEach((b) => { expect(b.disabled).toBe(true) })
  })

  it('focuses the input on mount with autoFocus, and exposes focusInput/selectInput', () => {
    const auto = mount({ value: 1, autoFocus: true })
    expect(document.activeElement).toBe(auto.input)

    const plain = mount({ value: 1 })
    expect(document.activeElement).not.toBe(plain.input)
    plain.component.focusInput()
    expect(document.activeElement).toBe(plain.input)
    expect(() => plain.component.selectInput()).not.toThrow()
  })

  it('marks the container focusable only when asked', () => {
    expect(mount({ value: 1, focusable: true }).host.querySelector('.focusable')).not.toBeNull()
    expect(mount({ value: 1, focusable: false }).host.querySelector('.focusable')).toBeNull()
  })

  it('focuses the input when the container is clicked', () => {
    const { host, input } = mount({ value: 1 })
    const container = host.querySelector('.editbox-container') as HTMLElement
    container.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(document.activeElement).toBe(input)
  })
})
