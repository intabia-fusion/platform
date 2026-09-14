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
import EditBox from '../components/EditBox.svelte'

let target: HTMLElement

interface Mounted {
  component: EditBox
  host: HTMLElement
  input: HTMLInputElement
}

function mount (props: Record<string, unknown> = {}): Mounted {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new EditBox({ target: host, props })
  return { component, host, input: host.querySelector('input, textarea') as HTMLInputElement }
}

/** What the browser does on typing: set the DOM value, then let svelte's binding read it back. */
async function type (input: HTMLInputElement, value: string): Promise<void> {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await tick()
}

describe('EditBox', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders the element the format asks for', () => {
    expect(mount().input.tagName).toBe('INPUT')
    expect(mount({ format: 'text' }).input.type).toBe('text')
    expect(mount({ format: 'number' }).input.type).toBe('number')
    expect(mount({ format: 'password' }).input.type).toBe('password')
    expect(mount({ format: 'text-multiline' }).input.tagName).toBe('TEXTAREA')
  })

  it('binds the value both ways', async () => {
    const { component, input } = mount({ value: 'start' })
    const onValue = vi.fn()
    component.$on('value', onValue)
    expect(input.value).toBe('start')

    await type(input, 'typed')
    expect(onValue).toHaveBeenLastCalledWith(expect.objectContaining({ detail: 'typed' }))

    component.$set({ value: 'from outside' })
    await tick()
    expect(input.value).toBe('from outside')
  })

  it('turns limit into maxlength, and no limit into none', () => {
    expect(mount({ limit: 5 }).input.getAttribute('maxlength')).toBe('5')
    expect(mount({ limit: 0 }).input.getAttribute('maxlength')).toBeNull()
  })

  it('dispatches input and value on typing, and value on blur', async () => {
    const { component, input } = mount({ value: '' })
    const onInput = vi.fn()
    const onValue = vi.fn()
    const onBlur = vi.fn()
    component.$on('input', onInput)
    component.$on('value', onValue)
    component.$on('blur', onBlur)

    await type(input, 'abc')
    expect(onInput).toHaveBeenCalledTimes(1)
    expect(onValue).toHaveBeenLastCalledWith(expect.objectContaining({ detail: 'abc' }))

    input.dispatchEvent(new Event('blur'))
    expect(onBlur).toHaveBeenLastCalledWith(expect.objectContaining({ detail: 'abc' }))
  })

  // floorFractionDigits rounds rather than floors - pinned as current behaviour, see its TODO.
  it('rounds a number value to maxDigitsAfterPoint', async () => {
    const { input } = mount({ format: 'number', value: 2.567, maxDigitsAfterPoint: 2 })
    await tick()
    expect(input.value).toBe('2.57')
  })

  it('leaves the value alone when maxDigitsAfterPoint is not set', async () => {
    const { input } = mount({ format: 'number', value: 2.567 })
    await tick()
    expect(input.value).toBe('2.567')
  })

  it('runs a formatter over the value', async () => {
    const { input } = mount({ value: 'abc', formatter: (v: string | number) => String(v).toUpperCase() })
    await tick()
    expect(input.value).toBe('ABC')
  })

  it('clamps a number to minValue and maxValue on change', async () => {
    const { component, input } = mount({ format: 'number', value: 5, minValue: 1, maxValue: 10 })
    const onValue = vi.fn()
    component.$on('value', onValue)

    await type(input, '42')
    input.dispatchEvent(new Event('change'))
    await tick()
    expect(input.value).toBe('10')

    await type(input, '-3')
    input.dispatchEvent(new Event('change'))
    await tick()
    expect(input.value).toBe('1')
  })

  it('clamps on blur as well as on change', async () => {
    const { input } = mount({ format: 'number', value: 5, maxValue: 10 })
    await type(input, '99')
    input.dispatchEvent(new Event('blur'))
    await tick()
    expect(input.value).toBe('10')
  })

  // An inverted range is nonsense, and clamping to either end would be a guess.
  it('leaves the value alone when maxValue is below minValue', async () => {
    const { input } = mount({ format: 'number', value: 5, minValue: 10, maxValue: 1 })
    await type(input, '42')
    input.dispatchEvent(new Event('change'))
    await tick()
    expect(input.value).toBe('42')
  })

  it('does not clamp a text format, whatever the bounds say', async () => {
    const { input } = mount({ value: '5', minValue: 1, maxValue: 10 })
    await type(input, '42')
    input.dispatchEvent(new Event('change'))
    await tick()
    expect(input.value).toBe('42')
  })

  it('passes disabled down to the input', () => {
    expect(mount({ disabled: true }).input.disabled).toBe(true)
    expect(mount({ disabled: false }).input.disabled).toBe(false)
  })

  it('focuses the input when the box is clicked', () => {
    const { host, input } = mount()
    const box = host.querySelector('.antiEditBox') as HTMLElement
    box.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(document.activeElement).toBe(input)
  })

  it('focuses on mount with autoFocus, and exposes focusInput', () => {
    const auto = mount({ autoFocus: true })
    expect(document.activeElement).toBe(auto.input)

    const plain = mount()
    expect(document.activeElement).not.toBe(plain.input)
    plain.component.focusInput()
    expect(document.activeElement).toBe(plain.input)
  })

  // jsdom does no layout, so the measuring span is 0 wide and the floor of 50px is what shows.
  it('sizes itself from the text only when shrink is on', async () => {
    expect(mount({ shrink: false, value: 'abc' }).input.style.width).toBe('100%')
    expect(mount({ shrink: true, value: 'abc' }).input.style.width).toBe('50px')
    expect(mount({ shrink: true, kind: 'underline', value: 'abc' }).input.style.width).toBe('calc(0px + 1.125rem)')
    expect(mount({ shrink: true, format: 'number', maxWidth: '4rem', value: 1 }).input.style.width).toBe('4rem')
  })

  it('marks the label required only when asked', () => {
    const withLabel = mount({ label: 'ui:string:Ok' as any, required: true })
    expect(withLabel.host.querySelector('.required')).not.toBeNull()
    expect(mount({ label: 'ui:string:Ok' as any }).host.querySelector('.required')).toBeNull()
    expect(mount().host.querySelector('.mb-1')).toBeNull()
  })
})
