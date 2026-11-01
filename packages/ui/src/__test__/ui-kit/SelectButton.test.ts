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

import { getEmbeddedLabel, type Asset } from '@hcengineering/platform'
import { tick, type ComponentProps } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import SelectButton from '../../ui-kit/select-button/SelectButton.svelte'
import SelectButtonWithContent from './SelectButtonWithContent.svelte'

const ICON = 'ui:icon:Settings' as Asset
const VALUE = getEmbeddedLabel('High')
const PLACEHOLDER = getEmbeddedLabel('No priority')

let target: HTMLElement
const mounted: Array<{ $destroy: () => void }> = []

function mount (props: ComponentProps<SelectButton>): {
  root: HTMLElement
  button: HTMLButtonElement
  component: SelectButton
} {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new SelectButton({ target: host, props })
  mounted.push(component)
  return {
    root: host.querySelector('.select-button') as HTMLElement,
    button: host.querySelector('button') as HTMLButtonElement,
    component
  }
}

describe('ui-kit SelectButton', () => {
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

  it('is a small secondary menu button by default', () => {
    const { button } = mount({ label: VALUE })
    expect(button.classList.contains('button--secondary')).toBe(true)
    expect(button.classList.contains('button--small')).toBe(true)
    expect(button.getAttribute('aria-haspopup')).toBe('true')
    expect(button.getAttribute('aria-expanded')).toBe('false')
  })

  it('reports an open popup through pressed', async () => {
    const { button, component } = mount({ label: VALUE })
    component.$set({ pressed: true })
    await tick()
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(button.classList.contains('button--pressed')).toBe(true)
  })

  it('shows the value and not the placeholder', () => {
    const { root } = mount({ label: VALUE, placeholder: PLACEHOLDER })
    expect(root.querySelector('.select-button__value')?.textContent?.trim()).toBe('High')
    expect(root.classList.contains('select-button--placeholder')).toBe(false)
  })

  it('shows the placeholder while there is no value', () => {
    const { root } = mount({ placeholder: PLACEHOLDER, icon: ICON })
    expect(root.querySelector('.select-button__value')?.textContent?.trim()).toBe('No priority')
    expect(root.classList.contains('select-button--placeholder')).toBe(true)
    expect(root.querySelector('.select-button__icon')).not.toBeNull()
  })

  it('keeps the button color for an empty accented button', () => {
    const { root, button } = mount({ placeholder: PLACEHOLDER, kind: 'brand' })
    expect(button.classList.contains('button--brand')).toBe(true)
    expect(root.classList.contains('select-button--placeholder')).toBe(false)
  })

  it('keeps the disabled look for an empty disabled button', () => {
    const { root, button } = mount({ placeholder: PLACEHOLDER, disabled: true })
    expect(button.disabled).toBe(true)
    expect(root.classList.contains('select-button--placeholder')).toBe(false)
  })

  it('renders slot markup as the value, or the placeholder when empty is set', async () => {
    const host = document.createElement('div')
    target.appendChild(host)
    const component = new SelectButtonWithContent({ target: host, props: {} })
    mounted.push(component)
    expect(host.querySelector('.select-button__value--content .content')).not.toBeNull()

    component.$set({ empty: true })
    await tick()
    expect(host.querySelector('.content')).toBeNull()
    expect(host.querySelector('.select-button__value')?.textContent?.trim()).toBe('ui:string:NotSelected')
  })

  it('draws the chevron only when asked', async () => {
    const { root, component } = mount({ label: VALUE })
    expect(root.querySelector('.select-button__chevron')).toBeNull()

    component.$set({ chevron: 'hover' })
    await tick()
    expect(root.querySelector('.select-button__chevron')).not.toBeNull()
    expect(root.classList.contains('select-button--chevron-hover')).toBe(true)
  })

  it('swaps the value icon for the spinner while loading', () => {
    const { root, button } = mount({ label: VALUE, icon: ICON, loading: true })
    expect(root.querySelector('.select-button__icon')).toBeNull()
    expect(button.classList.contains('button--loading')).toBe(true)
    expect(root.classList.contains('select-button--loading')).toBe(true)
  })

  it('stretches to the width of the place only with fullWidth', async () => {
    const { root, component } = mount({ label: VALUE })
    expect(root.classList.contains('select-button--full-width')).toBe(false)
    component.$set({ fullWidth: true })
    await tick()
    expect(root.classList.contains('select-button--full-width')).toBe(true)
  })

  it('takes the field look only with field', async () => {
    const { root, component } = mount({ label: VALUE })
    expect(root.classList.contains('select-button--field')).toBe(false)
    component.$set({ field: true })
    await tick()
    expect(root.classList.contains('select-button--field')).toBe(true)
  })

  it('centers the value and the chevron only with justify center', async () => {
    const { root, component } = mount({ label: VALUE, fullWidth: true })
    expect(root.classList.contains('select-button--center')).toBe(false)
    component.$set({ justify: 'center' })
    await tick()
    expect(root.classList.contains('select-button--center')).toBe(true)
  })

  it('forwards clicks and passes attributes to the button', () => {
    const onClick = vi.fn()
    const { button, component } = mount({ label: VALUE, id: 'priority', 'data-id': 'btn-priority' })
    component.$on('click', onClick)
    button.click()
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(button.id).toBe('priority')
    expect(button.dataset.id).toBe('btn-priority')
  })

  it('is a square icon without a value text, in the placeholder color while empty', async () => {
    const { root, button, component } = mount({ icon: ICON, tooltip: { label: PLACEHOLDER } })
    expect(button.classList.contains('button--icon-only')).toBe(true)
    expect(root.classList.contains('select-button--placeholder')).toBe(true)
    expect(root.querySelector('.select-button__value')).toBeNull()

    component.$set({ empty: false })
    await tick()
    const set = root.querySelector('button') as HTMLButtonElement
    expect(set.classList.contains('button--icon-only')).toBe(true)
    expect(root.classList.contains('select-button--placeholder')).toBe(false)

    component.$set({ empty: undefined, placeholder: PLACEHOLDER })
    await tick()
    const shown = root.querySelector('button') as HTMLButtonElement
    expect(shown.classList.contains('button--icon-only')).toBe(false)
    expect(root.querySelector('.select-button__value')?.textContent).toBe('No priority')
  })

  // Translations of ui strings are not loaded here: a name shows up as its key.
  it('is never nameless while empty without a placeholder', async () => {
    const { button: text } = mount({ chevron: true })
    await new Promise((resolve) => setTimeout(resolve))
    expect(text.textContent?.trim()).toBe('ui:string:NotSelected')

    const { button: hinted } = mount({ chevron: true, tooltip: { label: getEmbeddedLabel('Priority') } })
    await new Promise((resolve) => setTimeout(resolve))
    expect(hinted.textContent?.trim()).toBe('Priority')

    const { button: square } = mount({ icon: ICON })
    await new Promise((resolve) => setTimeout(resolve))
    expect(square.classList.contains('button--icon-only')).toBe(true)
    expect(square.getAttribute('aria-label')).toBe('ui:string:NotSelected')

    const { button: labelled } = mount({ icon: ICON, 'aria-label': 'Priority' })
    expect(labelled.getAttribute('aria-label')).toBe('Priority')
  })
})
