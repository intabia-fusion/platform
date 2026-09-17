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
import DropdownLabelsIntl from '../components/DropdownLabelsIntl.svelte'
import DropdownLabelsPopupIntl from '../components/DropdownLabelsPopupIntl.svelte'
import type { DropdownIntlItem } from '../types'
import { modalStore } from '../modals'
import { popupstore, type CompAndProps } from '../popups'
import { get } from 'svelte/store'

const ICON = 'ui:icon:Check' as Asset

const ITEMS: DropdownIntlItem[] = [
  { id: 'a', label: 'ui:string:A' as IntlString },
  { id: 'b', label: 'ui:string:B' as IntlString }
]

let target: HTMLElement

interface Mounted {
  component: DropdownLabelsIntl
  host: HTMLElement
  button: HTMLButtonElement
}

function mount (props: Partial<ComponentProps<DropdownLabelsIntl>>): Mounted {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new DropdownLabelsIntl({ target: host, props: props as any })
  return { component, host, button: host.querySelector('button') as HTMLButtonElement }
}

describe('DropdownLabelsIntl', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
    modalStore.set([])
  })

  afterEach(() => {
    target.remove()
  })

  it('shows the label id text as no i18n loader is registered', () => {
    const { button } = mount({
      items: ITEMS,
      shouldUpdateUndefined: false,
      label: 'ui:string:Placeholder' as IntlString
    })
    expect(button.textContent).toContain('ui:string:Placeholder')
  })

  // shouldUpdateUndefined defaults true and both sets selected and dispatches 'selected' on mount,
  // unlike DropdownLabels which only sets the local value silently.
  it('auto-selects the first item on mount and dispatches selected', async () => {
    const host = document.createElement('div')
    target.appendChild(host)
    const merged = { items: ITEMS }
    const component = new DropdownLabelsIntl({
      target: host,
      props: merged as ComponentProps<DropdownLabelsIntl> as any
    })
    const onSelected = vi.fn()
    component.$on('selected', onSelected)
    await tick()
    // dispatch happens synchronously inside the reactive statement during instantiation, before $on is attached,
    // so re-trigger via an items update to observe it.
    component.$set({ items: [...ITEMS], selected: undefined })
    await tick()
    expect(onSelected).toHaveBeenLastCalledWith(expect.objectContaining({ detail: 'a' }))
    expect(host.querySelector('button')?.textContent).toContain('ui:string:A')
  })

  it('opens exactly one popup with the intl popup component and props on click', async () => {
    const { button } = mount({ items: ITEMS, selected: 'a', withSearch: true })
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick()

    const popups = get(popupstore)
    expect(popups.length).toBe(1)
    expect(popups[0].is).toBe(DropdownLabelsPopupIntl)
    expect(popups[0].props).toMatchObject({ items: ITEMS, selected: 'a', withSearch: true, multiselect: false })
  })

  it('does not open a second popup on a second click while the first is open', async () => {
    const { button } = mount({ items: ITEMS, selected: 'a' })
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick()
    expect(get(popupstore).length).toBe(1)
  })

  it('applying the result from the popup updates selected and dispatches selected', async () => {
    const { button, component } = mount({ items: ITEMS, selected: 'a' })
    const onSelected = vi.fn()
    component.$on('selected', onSelected)

    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick()
    const popup = get(popupstore)[0] as CompAndProps
    popup.onClose?.('b')
    await tick()

    expect(onSelected).toHaveBeenLastCalledWith(expect.objectContaining({ detail: 'b' }))
  })

  it('re-opens the popup with fresh items when items change while it is open', async () => {
    const { button, component } = mount({ items: ITEMS, selected: 'a' })
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick()
    const firstId = get(popupstore)[0].id

    const newItems: DropdownIntlItem[] = [...ITEMS, { id: 'c', label: 'ui:string:C' as IntlString }]
    component.$set({ items: newItems })
    await tick()

    const popups = get(popupstore)
    expect(popups.length).toBe(1)
    expect(popups[0].id).not.toBe(firstId)
    expect(popups[0].props).toMatchObject({ items: newItems })
  })

  it('renders every selected item in multiselect mode', () => {
    const { host } = mount({ items: ITEMS, multiselect: true, selected: ['a', 'b'], shouldUpdateUndefined: false })
    expect(host.querySelectorAll('.step-row').length).toBe(2)
  })

  it('carries icon, kind and size to the trigger button', () => {
    const { button } = mount({ items: ITEMS, icon: ICON, kind: 'primary', size: 'large', shouldUpdateUndefined: false })
    expect(button.classList.contains('primary')).toBe(true)
    expect(button.classList.contains('large')).toBe(true)
  })

  // Same as DropdownLabels: no explicit disabled guard in openPopup, only the native disabled attribute.
  it('sets the disabled attribute on the trigger, though the click handler has no disabled guard', async () => {
    const { button } = mount({ items: ITEMS, selected: 'a', disabled: true })
    expect(button.disabled).toBe(true)
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick()
    expect(get(popupstore).length).toBe(1)
  })

  it('passes an empty items list through without throwing', () => {
    const { button } = mount({ items: [], shouldUpdateUndefined: false })
    expect(button).not.toBeNull()
  })
})
