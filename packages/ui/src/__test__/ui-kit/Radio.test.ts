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
import { getEmbeddedLabel } from '@hcengineering/platform'
import { tick, type ComponentProps } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import Radio from '../../ui-kit/radio/Radio.svelte'
import RadioGroup from '../../ui-kit/radio/RadioGroup.svelte'

const ITEMS = [
  { value: 'full', label: getEmbeddedLabel('Full rights') },
  { value: 'readonly', label: getEmbeddedLabel('Read only') },
  { value: 'none', label: getEmbeddedLabel('None'), disabled: true }
]

let target: HTMLElement
const mounted: Array<{ $destroy: () => void }> = []

function host (): HTMLElement {
  const element = document.createElement('div')
  target.appendChild(element)
  return element
}

function mountGroup (props: ComponentProps<RadioGroup>): {
  root: HTMLElement
  inputs: HTMLInputElement[]
  component: RadioGroup
  changes: string[]
} {
  const element = host()
  const component = new RadioGroup({ target: element, props })
  mounted.push(component)
  const changes: string[] = []
  component.$on('change', (event: CustomEvent<string>) => changes.push(event.detail))
  const root = element.querySelector('.radio-group') as HTMLElement
  return { root, inputs: Array.from(root.querySelectorAll('input')), component, changes }
}

describe('ui-kit Radio', () => {
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

  it('is a native radio checked when the group holds its value', async () => {
    const element = host()
    const component = new Radio({
      target: element,
      props: { value: 2, group: 1, name: 'n', label: getEmbeddedLabel('Two') }
    })
    mounted.push(component)
    const input = element.querySelector('input') as HTMLInputElement
    const root = element.querySelector('.radio') as HTMLElement
    expect(input.type).toBe('radio')
    expect(input.name).toBe('n')
    expect(input.checked).toBe(false)
    expect([...root.classList]).toEqual(expect.arrayContaining(['radio--primary', 'radio--medium', 'radio--labelled']))
    const changes: number[] = []
    component.$on('change', (event: CustomEvent<number>) => changes.push(event.detail))
    input.click()
    await tick()
    expect(input.checked).toBe(true)
    expect(changes).toEqual([2])
    component.$set({ group: 1 })
    await tick()
    expect(input.checked).toBe(false)
  })

  it('readonly keeps the selection and is not disabled', async () => {
    const element = host()
    const component = new Radio({
      target: element,
      props: { value: 'a', group: null, 'aria-label': 'A', readonly: true }
    })
    mounted.push(component)
    const input = element.querySelector('input') as HTMLInputElement
    input.click()
    await tick()
    expect(input.checked).toBe(false)
    expect(input.disabled).toBe(false)
    expect(input.hasAttribute('aria-readonly')).toBe(false)
  })

  it('readonly does not let arrows move the selection', () => {
    const element = host()
    mounted.push(new Radio({ target: element, props: { value: 'a', group: 'a', 'aria-label': 'A', readonly: true } }))
    const input = element.querySelector('input') as HTMLInputElement
    const arrow = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
    input.dispatchEvent(arrow)
    expect(arrow.defaultPrevented).toBe(true)
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    input.dispatchEvent(tab)
    expect(tab.defaultPrevented).toBe(false)
  })

  it('keeps the click from the row around unless stopPropagation is false', () => {
    const onRow = vi.fn()
    target.addEventListener('click', onRow)
    const first = host()
    mounted.push(new Radio({ target: first, props: { value: 'a', name: 'x', 'aria-label': 'A' } }))
    first.querySelector('input')?.click()
    expect(onRow).not.toHaveBeenCalled()
    const second = host()
    mounted.push(
      new Radio({ target: second, props: { value: 'b', name: 'y', 'aria-label': 'B', stopPropagation: false } })
    )
    second.querySelector('input')?.click()
    expect(onRow).toHaveBeenCalled()
    target.removeEventListener('click', onRow)
  })

  it('error, pass-through attributes and explicit undefined defaults', async () => {
    const element = host()
    const component = new Radio({
      target: element,
      props: { value: 'a', 'aria-label': 'A', error: true, id: 'opt', 'data-id': 'x', kind: 'negative', size: 'small' }
    })
    mounted.push(component)
    const input = element.querySelector('input') as HTMLInputElement
    const root = element.querySelector('.radio') as HTMLElement
    expect(input.hasAttribute('aria-invalid')).toBe(false)
    expect(input.id).toBe('opt')
    expect(input.dataset.id).toBe('x')
    expect(root.classList.contains('radio--error')).toBe(true)
    component.$set({ kind: undefined, size: undefined })
    await tick()
    expect([...root.classList]).toEqual(expect.arrayContaining(['radio--primary', 'radio--medium']))
    expect(root.className).not.toContain('undefined')
  })

  it('group is a radiogroup of radios sharing a generated name', () => {
    const { root, inputs } = mountGroup({ items: ITEMS, selected: 'full', 'aria-label': 'Grant' })
    expect(root.getAttribute('role')).toBe('radiogroup')
    expect(root.getAttribute('aria-label')).toBe('Grant')
    expect(inputs.length).toBe(3)
    expect(new Set(inputs.map((input) => input.name)).size).toBe(1)
    expect(inputs[0].name).not.toBe('')
    expect(inputs.map((input) => input.checked)).toEqual([true, false, false])
    expect(inputs[2].disabled).toBe(true)
  })

  it('two groups get different names', () => {
    const first = mountGroup({ items: ITEMS })
    const second = mountGroup({ items: ITEMS })
    expect(first.inputs[0].name).not.toBe(second.inputs[0].name)
  })

  it('selects an option, reports it and follows the prop', async () => {
    const { inputs, component, changes } = mountGroup({ items: ITEMS, selected: 'full' })
    inputs[1].click()
    await tick()
    expect(inputs.map((input) => input.checked)).toEqual([false, true, false])
    expect(changes).toEqual(['readonly'])
    component.$set({ selected: 'full' })
    await tick()
    expect(inputs.map((input) => input.checked)).toEqual([true, false, false])
  })

  it('readonly group keeps its selection and marks itself readonly', async () => {
    const { root, inputs, changes } = mountGroup({ items: ITEMS, selected: 'full', readonly: true })
    expect(root.getAttribute('aria-readonly')).toBe('true')
    inputs[1].click()
    await tick()
    // jsdom does not restore the previously checked radio of a cancelled click, a browser does.
    expect(inputs[1].checked).toBe(false)
    expect(changes).toEqual([])
  })

  it('passes size, kind and disabled to every option', () => {
    const { root, inputs } = mountGroup({ items: ITEMS, size: 'small', kind: 'positive', disabled: true })
    expect(root.classList.contains('radio-group--small')).toBe(true)
    const radios = Array.from(root.querySelectorAll('.radio'))
    expect(radios.every((radio) => radio.classList.contains('radio--small'))).toBe(true)
    expect(radios.every((radio) => radio.classList.contains('radio--positive'))).toBe(true)
    expect(inputs.every((input) => input.disabled)).toBe(true)
  })
})
