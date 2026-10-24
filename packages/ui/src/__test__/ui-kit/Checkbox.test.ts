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

import Checkbox from '../../ui-kit/checkbox/Checkbox.svelte'

const LABEL = getEmbeddedLabel('Show archived')

let target: HTMLElement
const mounted: Array<{ $destroy: () => void }> = []

function mount (props: ComponentProps<Checkbox>): {
  root: HTMLElement
  input: HTMLInputElement | null
  component: Checkbox
  changes: boolean[]
} {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new Checkbox({ target: host, props })
  mounted.push(component)
  const changes: boolean[] = []
  component.$on('change', (event: CustomEvent<boolean>) => changes.push(event.detail))
  const root = host.querySelector('.checkbox') as HTMLElement
  return { root, input: root.querySelector('input'), component, changes }
}

describe('ui-kit Checkbox', () => {
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

  it('is a native checkbox inside a label, primary medium rectangle by default', async () => {
    const { root, input } = mount({ label: LABEL })
    await tick()
    expect(root.tagName).toBe('LABEL')
    expect(input?.type).toBe('checkbox')
    expect([...root.classList]).toEqual(
      expect.arrayContaining(['checkbox--primary', 'checkbox--medium', 'checkbox--rectangle', 'checkbox--labelled'])
    )
    expect(root.querySelector('.checkbox__label')?.textContent?.trim()).toBe('Show archived')
  })

  it('toggles on click and reports the new state in change', async () => {
    const { input, component, changes } = mount({ 'aria-label': 'Select' })
    input?.click()
    await tick()
    expect(input?.checked).toBe(true)
    input?.click()
    await tick()
    expect(input?.checked).toBe(false)
    expect(changes).toEqual([true, false])
    component.$set({ checked: true })
    await tick()
    expect(input?.checked).toBe(true)
  })

  it('shows the mixed state and clears it on click', async () => {
    const { input, changes } = mount({ 'aria-label': 'Select all', checked: true, indeterminate: true })
    expect(input?.indeterminate).toBe(true)
    input?.click()
    await tick()
    expect(input?.indeterminate).toBe(false)
    expect(input?.checked).toBe(false)
    expect(changes).toEqual([false])
  })

  it('readonly keeps the state, stays focusable and is not faded', async () => {
    const { root, input, changes } = mount({ 'aria-label': 'Done', checked: true, readonly: true })
    input?.click()
    await tick()
    expect(input?.checked).toBe(true)
    expect(input?.disabled).toBe(false)
    expect(input?.getAttribute('aria-readonly')).toBe('true')
    expect(root.classList.contains('checkbox--readonly')).toBe(true)
    expect(root.classList.contains('checkbox--disabled')).toBe(false)
    expect(changes).toEqual([])
  })

  it('disabled, error and pass-through attributes go to the input', () => {
    const { input } = mount({ label: LABEL, disabled: true, error: true, id: 'recurrent', 'data-id': 'x' })
    expect(input?.disabled).toBe(true)
    expect(input?.getAttribute('aria-invalid')).toBe('true')
    expect(input?.id).toBe('recurrent')
    expect(input?.dataset.id).toBe('x')
  })

  it('keeps the click from the row around unless stopPropagation is false', () => {
    const onRow = vi.fn()
    target.addEventListener('click', onRow)
    const first = mount({ 'aria-label': 'Select' })
    first.input?.click()
    expect(onRow).not.toHaveBeenCalled()
    const second = mount({ 'aria-label': 'Select', stopPropagation: false })
    second.input?.click()
    expect(onRow).toHaveBeenCalled()
    target.removeEventListener('click', onRow)
  })

  it('kind, size, shape and color set the look', () => {
    const { root } = mount({
      'aria-label': 'Done',
      kind: 'positive',
      size: 'small',
      shape: 'round',
      color: 'var(--global-urgent-PriorityColor)'
    })
    expect([...root.classList]).toEqual(
      expect.arrayContaining(['checkbox--positive', 'checkbox--small', 'checkbox--round', 'checkbox--colored'])
    )
    expect(root.style.getPropertyValue('--_user-color')).toBe('var(--global-urgent-PriorityColor)')
  })

  it('decorative renders only a hidden box without an input', () => {
    const { root, input } = mount({ decorative: true, checked: true })
    expect(input).toBeNull()
    expect(root.getAttribute('aria-hidden')).toBe('true')
    expect(root.classList.contains('checkbox--checked')).toBe(true)
  })

  it('readonly keeps the mixed state on click', async () => {
    const { input, changes } = mount({ 'aria-label': 'Select all', checked: true, indeterminate: true, readonly: true })
    input?.click()
    await tick()
    expect(input?.indeterminate).toBe(true)
    expect(input?.checked).toBe(true)
    expect(changes).toEqual([])
  })

  it('follows indeterminate set from outside', async () => {
    const { input, component } = mount({ 'aria-label': 'Select all' })
    expect(input?.indeterminate).toBe(false)
    component.$set({ indeterminate: true })
    await tick()
    expect(input?.indeterminate).toBe(true)
    component.$set({ indeterminate: false })
    await tick()
    expect(input?.indeterminate).toBe(false)
  })

  it('a click on the label text toggles it', async () => {
    const { root, input, changes } = mount({ label: LABEL })
    ;(root.querySelector('.checkbox__label') as HTMLElement).click()
    await tick()
    expect(input?.checked).toBe(true)
    expect(changes).toEqual([true])
  })

  it('without a label renders no label element', () => {
    const { root } = mount({ 'aria-label': 'Select' })
    expect(root.classList.contains('checkbox--labelled')).toBe(false)
    expect(root.querySelector('.checkbox__label')).toBeNull()
  })

  it('decorative shows the mixed and disabled state', () => {
    const { root } = mount({ decorative: true, checked: true, indeterminate: true, disabled: true })
    expect(root.classList.contains('checkbox--indeterminate')).toBe(true)
    expect(root.classList.contains('checkbox--checked')).toBe(false)
    expect(root.classList.contains('checkbox--disabled')).toBe(true)
  })

  it('explicit undefined falls back to the defaults', async () => {
    const { root, component } = mount({ 'aria-label': 'Select', kind: 'negative', size: 'small', shape: 'round' })
    component.$set({ kind: undefined, size: undefined, shape: undefined })
    await tick()
    expect([...root.classList]).toEqual(
      expect.arrayContaining(['checkbox--primary', 'checkbox--medium', 'checkbox--rectangle'])
    )
    expect(root.className).not.toContain('undefined')
  })

  it('keeps the user color apart from the fill so that disabled can override it', () => {
    const { root } = mount({ label: LABEL, color: 'rgb(255, 0, 0)', disabled: true })
    expect(root.style.getPropertyValue('--_user-color')).toBe('rgb(255, 0, 0)')
    expect(root.style.getPropertyValue('--_color')).toBe('')
  })

  it('has a neutral kind for routine marks, still a real checkbox', () => {
    const { root, input, changes } = mount({ kind: 'neutral', shape: 'round', 'aria-label': 'Mark as read' })
    expect(root.classList.contains('checkbox--neutral')).toBe(true)
    expect(root.classList.contains('checkbox--round')).toBe(true)
    input?.click()
    expect(changes).toEqual([true])
  })
})
