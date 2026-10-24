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

import { readFileSync } from 'fs'
import { join } from 'path'
import { tick, type ComponentProps } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import Slider from '../../ui-kit/slider/Slider.svelte'

let target: HTMLElement
const mounted: Array<{ $destroy: () => void }> = []

function mount (props: ComponentProps<Slider>): { root: HTMLElement, input: HTMLInputElement, component: Slider } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new Slider({ target: host, props })
  mounted.push(component)
  return {
    root: host.querySelector('.slider') as HTMLElement,
    input: host.querySelector('input') as HTMLInputElement,
    component
  }
}

function listen (component: Slider, name: 'input' | 'change'): Mock<(event: CustomEvent<number>) => void> {
  const handler = vi.fn<(event: CustomEvent<number>) => void>()
  component.$on(name, handler)
  return handler
}

// What the browser does on a drag step or a key press: a new value, then the event.
function move (input: HTMLInputElement, value: string, type: 'input' | 'change'): void {
  input.value = value
  input.dispatchEvent(new Event(type, { bubbles: true }))
}

function ratio (input: HTMLInputElement): string {
  return input.style.getPropertyValue('--_ratio')
}

describe('ui-kit Slider', () => {
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

  it('is a native range from 0 to 100 with step 1, medium by default', () => {
    const { root, input } = mount({ value: 40, 'aria-label': 'Zoom' })
    expect(input.type).toBe('range')
    expect(input.min).toBe('0')
    expect(input.max).toBe('100')
    expect(input.step).toBe('1')
    expect(input.value).toBe('40')
    expect(ratio(input)).toBe('0.4')
    expect(root.classList.contains('slider--medium')).toBe(true)
    expect(input.disabled).toBe(false)
  })

  it('is named by aria-label or aria-labelledby and passes attributes through', () => {
    expect(mount({ 'aria-label': 'Blur radius' }).input.getAttribute('aria-label')).toBe('Blur radius')
    const { input } = mount({ 'aria-labelledby': 'caption', id: 'blur', 'data-id': 'blur-radius' })
    expect(input.getAttribute('aria-labelledby')).toBe('caption')
    expect(input.id).toBe('blur')
    expect(input.dataset.id).toBe('blur-radius')
  })

  it('keeps the value when max is above 100: the bounds are set before the value', () => {
    const { input } = mount({ value: 500, max: 1000, 'aria-label': 'Position' })
    expect(input.value).toBe('500')
    expect(ratio(input)).toBe('0.5')
  })

  it('follows min, max and step and clamps the fill to the range', async () => {
    const { input, component } = mount({ value: 1, min: 0.5, max: 10, step: 0.5, size: 'small', 'aria-label': 'Blur' })
    expect(input.min).toBe('0.5')
    expect(input.step).toBe('0.5')
    expect(Number(ratio(input))).toBeCloseTo(0.5 / 9.5)

    component.$set({ value: 20 })
    await tick()
    expect(ratio(input)).toBe('1')
    component.$set({ value: -3 })
    await tick()
    expect(ratio(input)).toBe('0')
    component.$set({ value: Number.NaN })
    await tick()
    expect(ratio(input)).toBe('0')
  })

  it('draws an empty fill for an empty range instead of dividing by zero', () => {
    expect(ratio(mount({ value: 0, max: 0, 'aria-label': 'Position' }).input)).toBe('0')
  })

  it('reports every move in input and the committed value in change, and updates value', async () => {
    const { input, component } = mount({ value: 10, 'aria-label': 'Zoom' })
    const onInput = listen(component, 'input')
    const onChange = listen(component, 'change')

    move(input, '25', 'input')
    move(input, '30', 'input')
    await tick()
    expect(onInput.mock.calls.map(([event]) => event.detail)).toEqual([25, 30])
    expect(onChange).not.toHaveBeenCalled()
    expect(ratio(input)).toBe('0.3')

    move(input, '30', 'change')
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0].detail).toBe(30)
  })

  it('passes fractional values as numbers', () => {
    const { input, component } = mount({ value: 1, min: 0.5, max: 10, step: 0.5, 'aria-label': 'Blur' })
    const onChange = listen(component, 'change')
    move(input, '4.5', 'change')
    expect(onChange.mock.calls[0][0].detail).toBe(4.5)
  })

  it('takes any value with step any, such as a playback position', () => {
    const { input, component } = mount({ value: 12.34, max: 37.4, step: 'any', 'aria-label': 'Position' })
    expect(input.step).toBe('any')
    expect(input.value).toBe('12.34')
    const onChange = listen(component, 'change')
    move(input, '37.4', 'change')
    expect(onChange.mock.calls[0][0].detail).toBe(37.4)
  })

  it('is disabled natively', () => {
    const { root, input } = mount({ value: 40, disabled: true, 'aria-label': 'Zoom' })
    expect(input.disabled).toBe(true)
    expect(root.classList.contains('slider--disabled')).toBe(true)
  })

  it('writes the value after the track only with showValue, formatted and announced', async () => {
    const plain = mount({ value: 40, 'aria-label': 'Zoom' })
    expect(plain.root.querySelector('.slider__value')).toBeNull()
    expect(plain.input.hasAttribute('aria-valuetext')).toBe(false)

    const shown = mount({ value: 40, showValue: true, 'aria-label': 'Zoom' })
    const valueEl = shown.root.querySelector('.slider__value') as HTMLElement
    expect(valueEl.textContent).toBe('40')
    expect(valueEl.getAttribute('aria-hidden')).toBe('true')
    expect(valueEl.style.minWidth).toBe('3ch')

    const time = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
    const { root, input, component } = mount({
      value: 65,
      max: 600,
      showValue: true,
      formatValue: time,
      'aria-label': 'Position'
    })
    expect(root.querySelector('.slider__value')?.textContent).toBe('1:05')
    expect(input.getAttribute('aria-valuetext')).toBe('1:05')
    component.$set({ value: 125 })
    await tick()
    expect(input.getAttribute('aria-valuetext')).toBe('2:05')
  })

  it('rounds the value to the step grid, counted from min, for the fill and the text', async () => {
    const stepped = mount({ value: 33, step: 10, showValue: true, 'aria-label': 'Zoom' })
    expect(stepped.root.querySelector('.slider__value')?.textContent).toBe('30')
    expect(ratio(stepped.input)).toBe('0.3')

    const shifted = mount({ value: 33, min: 5, max: 105, step: 10, showValue: true, 'aria-label': 'Zoom' })
    expect(shifted.root.querySelector('.slider__value')?.textContent).toBe('35')
    expect(ratio(shifted.input)).toBe('0.3')

    // The last grid point under max: the native range never rests above it.
    const short = mount({ value: 99, max: 95, step: 10, showValue: true, 'aria-label': 'Zoom' })
    expect(short.root.querySelector('.slider__value')?.textContent).toBe('90')

    const fraction = mount({ value: 0.34, max: 1, step: 0.1, showValue: true, 'aria-label': 'Opacity' })
    expect(fraction.root.querySelector('.slider__value')?.textContent).toBe('0.3')

    const timed = mount({ value: 33, step: 10, formatValue: (v: number) => `${v}%`, 'aria-label': 'Zoom' })
    expect(timed.input.getAttribute('aria-valuetext')).toBe('30%')

    stepped.component.$set({ value: 47 })
    await tick()
    expect(stepped.root.querySelector('.slider__value')?.textContent).toBe('50')
  })

  it('keeps the value as is for step any', () => {
    const { root } = mount({ value: 33.3, step: 'any', showValue: true, 'aria-label': 'Zoom' })
    expect(root.querySelector('.slider__value')?.textContent).toBe('33.3')
  })

  // jsdom computes no styles: the look is pinned in the source.
  it('rests on a track of 1.5:1 contrast and answers hover with a halo, not with a darker thumb', () => {
    const source = readFileSync(join(__dirname, '../../ui-kit/slider/Slider.svelte'), 'utf8')
    expect(source).toMatch(/--_rest:\s*color-mix\(in srgb, var\(--global-tertiary-TextColor\) 50%/)
    expect(source).not.toContain('--_accent-hover')
    expect(source).toMatch(/box-shadow:\s*0 0 0 var\(--spacing-0_5\) var\(--_halo\)/)
  })
})
