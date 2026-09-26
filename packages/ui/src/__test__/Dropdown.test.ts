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
import type { ComponentProps } from 'svelte'
import Dropdown from '../components/Dropdown.svelte'
import DropdownPopup from '../components/DropdownPopup.svelte'
import type { ListItem } from '../types'
import { modalStore } from '../modals'
import { popupstore, type CompAndProps } from '../popups'
import { get } from 'svelte/store'

const ICON = 'ui:icon:Check' as Asset

const ITEMS: ListItem[] = [
  { _id: 'a', label: 'Alpha' },
  { _id: 'b', label: 'Beta' }
]

let target: HTMLElement

interface Mounted {
  component: Dropdown
  host: HTMLElement
  button: HTMLButtonElement
}

function mount (props: Partial<ComponentProps<Dropdown>>): Mounted {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new Dropdown({ target: host, props: props as any })
  return { component, host, button: host.querySelector('button') as HTMLButtonElement }
}

describe('Dropdown', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
    modalStore.set([])
  })

  afterEach(() => {
    target.remove()
  })

  it('shows the placeholder label when nothing is selected', () => {
    const { button } = mount({ items: ITEMS, placeholder: 'ui:string:Placeholder' as IntlString })
    expect(button.textContent).toContain('ui:string:Placeholder')
  })

  it('shows the selected item label instead of the placeholder', () => {
    const { button } = mount({ items: ITEMS, selected: ITEMS[1], placeholder: 'ui:string:Placeholder' as IntlString })
    expect(button.textContent).toContain('Beta')
  })

  it('opens exactly one popup with the dropdown popup component and props on click', async () => {
    const { button } = mount({
      items: ITEMS,
      placeholder: 'ui:string:Placeholder' as IntlString,
      label: 'ui:string:Title' as IntlString
    })
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick()

    const popups = get(popupstore)
    expect(popups.length).toBe(1)
    expect(popups[0].is).toBe(DropdownPopup)
    expect(popups[0].props).toMatchObject({ title: 'ui:string:Title', items: ITEMS, withSearch: true })
  })

  it('does not open a second popup on a second click while the first is open', async () => {
    const { button } = mount({ items: ITEMS, placeholder: 'ui:string:Placeholder' as IntlString })
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick()
    expect(get(popupstore).length).toBe(1)
  })

  // Unlike DropdownLabels/DropdownLabelsIntl/NestedDropdown, this component's click handler
  // explicitly checks `!disabled`, so disabled really blocks opening even via a synthetic click.
  it('does not open the popup when disabled', async () => {
    const { button } = mount({ items: ITEMS, placeholder: 'ui:string:Placeholder' as IntlString, disabled: true })
    expect(button.disabled).toBe(true)
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick()
    expect(get(popupstore).length).toBe(0)
  })

  it('applying the result from the popup updates selected and dispatches selected', async () => {
    const { button, component } = mount({ items: ITEMS, placeholder: 'ui:string:Placeholder' as IntlString })
    const onSelected = vi.fn()
    component.$on('selected', onSelected)

    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick()
    const popup = get(popupstore)[0] as CompAndProps
    popup.onClose?.(ITEMS[1])
    await tick()

    expect(onSelected).toHaveBeenLastCalledWith(expect.objectContaining({ detail: ITEMS[1] }))
    expect(button.textContent).toContain('Beta')
  })

  it("falls back to the component's own icon when the selected item has none", () => {
    const { button } = mount({
      items: ITEMS,
      selected: ITEMS[0],
      icon: ICON,
      placeholder: 'ui:string:Placeholder' as IntlString
    })
    expect(button.querySelector('.btn-icon')).not.toBeNull()
  })

  it('carries kind, size and justify to the trigger button', () => {
    const { button } = mount({
      items: ITEMS,
      placeholder: 'ui:string:Placeholder' as IntlString,
      kind: 'primary',
      size: 'large',
      justify: 'left'
    })
    expect(button.classList.contains('primary')).toBe(true)
    expect(button.classList.contains('large')).toBe(true)
    expect(button.classList.contains('jf-left')).toBe(true)
  })

  it('passes an empty items list through without throwing', () => {
    const { button } = mount({ items: [], placeholder: 'ui:string:Placeholder' as IntlString })
    expect(button).not.toBeNull()
  })
})
