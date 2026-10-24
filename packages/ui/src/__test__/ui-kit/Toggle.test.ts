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
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import Toggle from '../../ui-kit/toggle/Toggle.svelte'

const LABEL = getEmbeddedLabel('Private')
const DESCRIPTION = getEmbeddedLabel('Only members see it')

let target: HTMLElement
const mounted: Array<{ $destroy: () => void }> = []

function mount (props: ComponentProps<Toggle>): { root: HTMLLabelElement, input: HTMLInputElement, component: Toggle } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new Toggle({ target: host, props })
  mounted.push(component)
  return {
    root: host.querySelector('.toggle') as HTMLLabelElement,
    input: host.querySelector('input') as HTMLInputElement,
    component
  }
}

function changes (component: Toggle): Mock<(event: CustomEvent<boolean>) => void> {
  const onChange = vi.fn<(event: CustomEvent<boolean>) => void>()
  component.$on('change', onChange)
  return onChange
}

describe('ui-kit Toggle', () => {
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

  it('is a native checkbox with the switch role, medium and off by default', () => {
    const { root, input } = mount({ 'aria-label': 'Private' })
    expect(input.type).toBe('checkbox')
    expect(input.getAttribute('role')).toBe('switch')
    expect(input.checked).toBe(false)
    expect(root.classList.contains('toggle--medium')).toBe(true)
    expect(root.classList.contains('toggle--label-end')).toBe(true)
  })

  it('is brand by default and takes the other kinds', () => {
    expect(mount({ 'aria-label': 'Sync' }).root.classList.contains('toggle--brand')).toBe(true)
    expect(mount({ 'aria-label': 'Sync', kind: 'positive' }).root.classList.contains('toggle--positive')).toBe(true)
  })

  it('reports the new state in change and updates checked', async () => {
    const { input, component } = mount({ 'aria-label': 'Private' })
    const onChange = changes(component)

    input.click()
    await tick()
    expect(input.checked).toBe(true)
    input.click()
    await tick()
    expect(onChange.mock.calls.map(([event]) => event.detail)).toEqual([true, false])
  })

  it('follows checked set from outside without an event', async () => {
    const { input, component } = mount({ 'aria-label': 'Private' })
    const onChange = changes(component)
    component.$set({ checked: true })
    await tick()
    expect(input.checked).toBe(true)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('toggles from a click on its label text', async () => {
    const { root, input, component } = mount({ label: LABEL })
    const onChange = changes(component)
    await tick()
    const text = root.querySelector('.toggle__label') as HTMLElement
    expect(text.textContent).toBe('Private')

    text.click()
    await tick()
    expect(input.checked).toBe(true)
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('does not change when disabled', async () => {
    const { root, input, component } = mount({ label: LABEL, disabled: true })
    const onChange = changes(component)
    input.click()
    await tick()
    expect(input.disabled).toBe(true)
    expect(input.checked).toBe(false)
    expect(root.classList.contains('toggle--disabled')).toBe(true)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('keeps its state and look when readonly', async () => {
    const { root, input, component } = mount({ label: LABEL, checked: true, readonly: true })
    const onChange = changes(component)
    input.click()
    await tick()
    expect(input.checked).toBe(true)
    expect(input.disabled).toBe(false)
    expect(input.getAttribute('aria-readonly')).toBe('true')
    expect(root.classList.contains('toggle--readonly')).toBe(true)
    expect(root.classList.contains('toggle--disabled')).toBe(false)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('describes the switch by its description', async () => {
    const { root, input } = mount({ label: LABEL, description: DESCRIPTION })
    await tick()
    const description = root.querySelector('.toggle__description') as HTMLElement
    expect(description.textContent).toBe('Only members see it')
    expect(input.getAttribute('aria-describedby')).toBe(description.id)
  })

  it('names an unlabelled switch after its tooltip, unless aria-label is given', async () => {
    const tooltip = { label: getEmbeddedLabel('Blur') }
    const { input } = mount({ tooltip })
    await tick()
    expect(input.getAttribute('aria-label')).toBe('Blur')

    const named = mount({ tooltip, 'aria-label': 'Background blur' })
    await tick()
    expect(named.input.getAttribute('aria-label')).toBe('Background blur')

    const labelled = mount({ label: LABEL, tooltip })
    await tick()
    expect(labelled.input.hasAttribute('aria-label')).toBe(false)
  })

  it('passes size, label position, full width and native attributes through', () => {
    const { root, input } = mount({
      label: LABEL,
      size: 'extra-small',
      labelPosition: 'start',
      fullWidth: true,
      id: 'project-private',
      'data-id': 'private'
    })
    expect(root.classList.contains('toggle--extra-small')).toBe(true)
    expect(root.classList.contains('toggle--label-start')).toBe(true)
    expect(root.classList.contains('toggle--full-width')).toBe(true)
    expect(input.id).toBe('project-private')
    expect(input.dataset.id).toBe('private')
  })

  it('falls back to the default size when size is later set to undefined', async () => {
    const { root, component } = mount({ 'aria-label': 'Private', size: 'large' })
    component.$set({ size: undefined })
    await tick()
    expect(root.classList.contains('toggle--medium')).toBe(true)
    expect(root.className).not.toContain('undefined')
  })

  it('falls back to brand and the end label when kind and labelPosition are later set to undefined', async () => {
    const { root, component } = mount({ label: LABEL, kind: 'negative', labelPosition: 'start' })
    component.$set({ kind: undefined, labelPosition: undefined })
    await tick()
    expect(root.classList.contains('toggle--brand')).toBe(true)
    expect(root.classList.contains('toggle--label-end')).toBe(true)
    expect(root.className).not.toContain('undefined')
  })

  it('a description without a label is not rendered nor referenced', () => {
    const { root, input } = mount({ 'aria-label': 'Private' })
    expect(root.querySelector('.toggle__description')).toBeNull()
    expect(input.hasAttribute('aria-describedby')).toBe(false)
  })
})
