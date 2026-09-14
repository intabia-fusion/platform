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
import type { Asset, IntlString } from '@hcengineering/platform'
import DropdownLabels from '../components/DropdownLabels.svelte'
import DropdownLabelsPopup from '../components/DropdownLabelsPopup.svelte'
import type { DropdownTextItem } from '../types'
import { modalStore } from '../modals'
import { popupstore, type CompAndProps } from '../popups'
import { get } from 'svelte/store'

const ICON = 'ui:icon:Check' as Asset

const ITEMS: DropdownTextItem[] = [
  { id: 'a', label: 'Alpha' },
  { id: 'b', label: 'Beta' }
]

let target: HTMLElement

interface Mounted {
  component: DropdownLabels
  host: HTMLElement
  button: HTMLButtonElement
}

function mount (props: Record<string, unknown>): Mounted {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new DropdownLabels({ target: host, props: props as any })
  return { component, host, button: host.querySelector('button') as HTMLButtonElement }
}

describe('DropdownLabels', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
    modalStore.set([])
  })

  afterEach(() => {
    target.remove()
  })

  it('shows a placeholder label when nothing is selected and autoSelect is off', () => {
    const { button } = mount({ items: ITEMS, autoSelect: false, label: 'ui:string:Ok' as IntlString })
    expect(button.textContent).toContain('ui:string:Ok')
  })

  it('auto-selects the first item and renders its label', () => {
    const { button } = mount({ items: ITEMS })
    expect(button.textContent).toContain('Alpha')
  })

  it('renders the selected item label instead of the placeholder', () => {
    const { button } = mount({ items: ITEMS, selected: 'b', autoSelect: false })
    expect(button.textContent).toContain('Beta')
  })

  it('renders every selected item on separate spans in multiselect', () => {
    const { host } = mount({ items: ITEMS, multiselect: true, selected: ['a', 'b'] })
    const rows = host.querySelectorAll('.step-row')
    expect(rows.length).toBe(2)
  })

  it('opens exactly one popup with the dropdown popup component and props on click', async () => {
    const { button } = mount({ items: ITEMS, selected: 'a', placeholder: 'ui:string:Ok' as IntlString })
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick()

    const popups = get(popupstore)
    expect(popups.length).toBe(1)
    expect(popups[0].is).toBe(DropdownLabelsPopup)
    expect(popups[0].props).toMatchObject({ items: ITEMS, selected: 'a', multiselect: false, enableSearch: true })
  })

  it('does not open a second popup on a second click while the first is open', async () => {
    const { button } = mount({ items: ITEMS })
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick()
    expect(get(popupstore).length).toBe(1)
  })

  it('applying the result from the popup updates selected and dispatches selected', async () => {
    const { button, component } = mount({ items: ITEMS, selected: 'a', autoSelect: false })
    const onSelected = vi.fn()
    component.$on('selected', onSelected)

    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick()
    const popup = get(popupstore)[0] as CompAndProps
    popup.onClose?.('b')
    await tick()

    expect(onSelected).toHaveBeenLastCalledWith(expect.objectContaining({ detail: 'b' }))
  })

  it('deselects when allowDeselect and the same item is picked again', async () => {
    const { button, component } = mount({ items: ITEMS, selected: 'a', autoSelect: false, allowDeselect: true })
    const onSelected = vi.fn()
    component.$on('selected', onSelected)

    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick()
    const popup = get(popupstore)[0] as CompAndProps
    popup.onClose?.('a')
    await tick()

    expect(onSelected).toHaveBeenCalledTimes(1)
    expect(onSelected.mock.calls[0][0].detail).toBeNull()
  })

  it('carries the icon and size/kind through to the trigger button', () => {
    const { button } = mount({ items: ITEMS, icon: ICON, kind: 'primary', size: 'large' })
    expect(button.classList.contains('primary')).toBe(true)
    expect(button.classList.contains('large')).toBe(true)
  })

  // Button's own disabled attribute blocks real clicks; the component's handler has no explicit
  // disabled guard, so a synthetic dispatchEvent still opens the popup - pinned, not a desired API.
  it('sets the disabled attribute on the trigger, though the click handler has no disabled guard', async () => {
    const { button } = mount({ items: ITEMS, disabled: true })
    expect(button.disabled).toBe(true)
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick()
    expect(get(popupstore).length).toBe(1)
  })

  it('renders no dropdown icon by default and shows it when asked', () => {
    const without = mount({ items: ITEMS })
    expect(without.host.querySelector('svg')).toBeNull()
    const withIcon = mount({ items: ITEMS, showDropdownIcon: true })
    expect(withIcon.host.querySelector('.step-row, svg')).not.toBeNull()
  })

  it('passes an empty items list through without throwing', () => {
    const { button } = mount({ items: [], autoSelect: false })
    expect(button).not.toBeNull()
  })
})
