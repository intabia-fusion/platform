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

import { tick, type ComponentProps } from 'svelte'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import NumberInput from '../../ui-kit/number-input/NumberInput.svelte'

let target: HTMLElement
const mounted: Array<{ $destroy: () => void }> = []

function mount (props: ComponentProps<NumberInput>): {
  root: HTMLElement
  input: HTMLInputElement
  minus: HTMLButtonElement
  plus: HTMLButtonElement
  component: NumberInput
  changes: Array<number | null>
} {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new NumberInput({ target: host, props })
  mounted.push(component)
  const changes: Array<number | null> = []
  component.$on('change', (event: CustomEvent<number | null>) => changes.push(event.detail))
  const root = host.querySelector('.number-input') as HTMLElement
  const [minus, plus] = Array.from(root.querySelectorAll('button'))
  return { root, input: root.querySelector('input') as HTMLInputElement, minus, plus, component, changes }
}

async function commit (input: HTMLInputElement, text: string): Promise<void> {
  input.value = text
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await tick()
}

async function key (input: HTMLInputElement, name: string): Promise<void> {
  input.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }))
  await tick()
}

describe('ui-kit NumberInput', () => {
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

  it('is a small number field between named minus and plus buttons', async () => {
    const { root, input, minus, plus } = mount({ value: 3, min: 1, max: 10 })
    expect(root.classList.contains('number-input--small')).toBe(true)
    expect(input.type).toBe('number')
    expect(input.value).toBe('3')
    expect(input.min).toBe('1')
    expect(input.max).toBe('10')
    expect(minus.classList.contains('button--extra-small')).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(minus.getAttribute('aria-label')).not.toBeNull()
    expect(plus.getAttribute('aria-label')).not.toBeNull()
  })

  it('steps by step with the buttons and the arrow keys, within min and max', async () => {
    const { input, minus, plus, changes } = mount({ value: 8, min: 0, max: 10, step: 2 })
    plus.click()
    await tick()
    expect(input.value).toBe('10')
    expect(plus.disabled).toBe(true)
    await key(input, 'ArrowUp')
    expect(input.value).toBe('10')
    await key(input, 'ArrowDown')
    minus.click()
    await tick()
    expect(input.value).toBe('6')
    expect(changes).toEqual([10, 8, 6])
  })

  it('reports Enter and the native change that follows it once', async () => {
    const { input, changes } = mount({ value: 2 })
    input.value = '7'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await key(input, 'Enter')
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await tick()
    expect(changes).toEqual([7])
  })

  it('keeps the steppers out of the Tab order: the arrow keys step the field', async () => {
    const { minus, plus } = mount({ value: 2 })
    await tick()
    expect(minus.tabIndex).toBe(-1)
    expect(plus.tabIndex).toBe(-1)
  })

  it('is named by aria-label, or by a visible label with aria-labelledby', () => {
    const { input: named } = mount({ value: 1, 'aria-label': 'Seats', 'aria-describedby': 'seats-hint' })
    expect(named.getAttribute('aria-label')).toBe('Seats')
    expect(named.getAttribute('aria-describedby')).toBe('seats-hint')
    const { input: labelled } = mount({ value: 1, 'aria-label': 'Seats', 'aria-labelledby': 'seats-label' })
    expect(labelled.getAttribute('aria-labelledby')).toBe('seats-label')
    expect(labelled.hasAttribute('aria-label')).toBe(false)
  })

  it('brings a typed value into range and precision on commit, not while typing', async () => {
    const { input, changes } = mount({ value: 5, min: 1, max: 100, fractionDigits: 0 })
    input.value = '0'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await tick()
    expect(input.value).toBe('0')
    expect(changes).toEqual([])

    input.dispatchEvent(new Event('change', { bubbles: true }))
    await tick()
    expect(input.value).toBe('1')
    await commit(input, '99999')
    expect(input.value).toBe('100')
    await commit(input, '7.6')
    expect(input.value).toBe('8')
    expect(changes).toEqual([1, 100, 8])
  })

  it('reports null for an empty field and steps from zero', async () => {
    const { input, plus, changes } = mount({ value: 4 })
    await commit(input, '')
    expect(changes).toEqual([null])
    plus.click()
    await tick()
    expect(input.value).toBe('1')
  })

  it('drops the float noise of fractional steps', async () => {
    const { input, plus } = mount({ value: 0.1, step: 0.2 })
    plus.click()
    await tick()
    expect(input.value).toBe('0.3')
  })

  it('shows a new value set by the place and disables everything with disabled', async () => {
    const { input, minus, plus, component } = mount({ value: 1 })
    component.$set({ value: 42, disabled: true })
    await tick()
    expect(input.value).toBe('42')
    expect(input.disabled).toBe(true)
    expect(minus.disabled).toBe(true)
    expect(plus.disabled).toBe(true)
  })

  it('keeps an integer wider than 12 digits exact on commit and stepping', async () => {
    const { input, plus, changes } = mount({})
    await commit(input, '1234567890123')
    expect(changes).toEqual([1234567890123])
    expect(input.value).toBe('1234567890123')
    plus.click()
    await tick()
    expect(input.value).toBe('1234567890124')
  })

  it('drops the float noise of a fractional step on a large value too', async () => {
    const { input, plus } = mount({ value: 100000.1, step: 0.2 })
    plus.click()
    await tick()
    expect(input.value).toBe('100000.3')
  })
})
