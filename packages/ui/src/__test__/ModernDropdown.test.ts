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
import { get } from 'svelte/store'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IntlString } from '@hcengineering/platform'
import type { ComponentProps } from 'svelte'
import ModernDropdown from '../components/ModernDropdown.svelte'
import ModernPopup from '../components/ModernPopup.svelte'
import { modalStore } from '../modals'
import { popupstore, type CompAndProps } from '../popups'
import type { DropdownIntlItem } from '../types'

const LABEL = 'ui:string:Ok' as IntlString

const items: DropdownIntlItem[] = [
  { id: 'a', label: LABEL },
  { id: 'b', label: LABEL },
  { id: 'c', label: LABEL }
]

let target: HTMLElement

interface Mounted {
  component: ModernDropdown
  host: HTMLElement
  button: HTMLButtonElement
}

function mount (props: Partial<ComponentProps<ModernDropdown>> = {}): Mounted {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new ModernDropdown({ target: host, props: props as ComponentProps<ModernDropdown> })
  return { component, host, button: host.querySelector('button.hulyButton') as HTMLButtonElement }
}

function click (el: HTMLElement): void {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
}

function lastPopup (): CompAndProps {
  const popups = get(popupstore)
  return popups[popups.length - 1]
}

describe('ModernDropdown', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
    modalStore.set([])
  })

  afterEach(() => {
    target.remove()
  })

  it('shows the placeholder when nothing is selected', () => {
    const { host } = mount({ items, autoSelect: false })
    expect(host.querySelector('.placeholder')).not.toBeNull()
  })

  it('auto-selects the first item on mount', () => {
    const { host } = mount({ items })
    expect(host.querySelector('.placeholder')).toBeNull()
  })

  it('opens ModernPopup via showPopup with the current items and selection', () => {
    const { button } = mount({ items, withSearch: true })
    click(button)

    const popups = get(popupstore)
    expect(popups).toHaveLength(1)
    expect(popups[0].is).toBe(ModernPopup)
    expect(popups[0].props.items).toBe(items)
    expect(popups[0].props.selected).toBe('a')
    expect(popups[0].props.multiselect).toBe(false)
    expect(popups[0].props.withSearch).toBe(true)
    expect(typeof (popups[0].element as any).getBoundingClientRect).toBe('function')
  })

  it('does not open the popup when disabled', () => {
    const { button } = mount({ items, disabled: true })
    click(button)
    expect(get(popupstore)).toHaveLength(0)
  })

  it('does not stack a second popup on a second click while already open', () => {
    const { button } = mount({ items })
    click(button)
    click(button)
    expect(get(popupstore)).toHaveLength(1)
  })

  it('selects the item the popup closes with, and dispatches selected', async () => {
    const { button, component } = mount({ items })
    const onSelected = vi.fn()
    component.$on('selected', onSelected)

    click(button)
    lastPopup().onClose?.('b')
    await tick()

    expect(onSelected).toHaveBeenLastCalledWith(expect.objectContaining({ detail: 'b' }))
  })

  it('reopens after a close, since closing resets the opened flag', () => {
    // the popup host calls onClose(result) then close() - both are needed to mimic a real close
    const { button } = mount({ items })
    click(button)
    lastPopup().onClose?.('b')
    lastPopup().close()
    click(button)
    expect(get(popupstore)).toHaveLength(1)
  })

  it('deselects the current item when allowDeselect and it is chosen again', async () => {
    // autoSelect: false - otherwise the autoSelect reactive block immediately reselects items[0]
    // as soon as `selected` becomes undefined (suspected bug, see report)
    const { button, component, host } = mount({ items, allowDeselect: true, selected: 'a', autoSelect: false })
    const onSelected = vi.fn()
    component.$on('selected', onSelected)

    click(button)
    lastPopup().onClose?.('a')
    await tick()

    expect(onSelected).toHaveBeenCalledTimes(1)
    // CustomEvent normalises an undefined detail to null per spec
    expect(onSelected.mock.calls[0][0].detail).toBeNull()
    expect(host.querySelector('.placeholder')).not.toBeNull()
  })

  it('applies an onUpdate result without closing the popup', () => {
    const { button, component } = mount({ items })
    const onSelected = vi.fn()
    component.$on('selected', onSelected)

    click(button)
    lastPopup().onUpdate?.('c')
    expect(onSelected).toHaveBeenLastCalledWith(expect.objectContaining({ detail: 'c' }))
    // opened flag is still true - a further click must not add a second popup
    click(button)
    expect(get(popupstore)).toHaveLength(1)
  })

  it('renders every selected item for multiselect, and accepts a full array from the popup', async () => {
    // pinned behaviour, not a desired one - multiselect defaults `selected` to [], so the autoSelect
    // reactive block (which only fires when `selected === undefined`) never runs for multiselect.
    const { button, component, host } = mount({ items, multiselect: true, selected: ['a'] })
    const onSelected = vi.fn()
    component.$on('selected', onSelected)

    expect(host.querySelectorAll('.step-row')).toHaveLength(1)

    click(button)
    lastPopup().onClose?.(['a', 'c'])
    await tick()

    expect(onSelected).toHaveBeenLastCalledWith(expect.objectContaining({ detail: ['a', 'c'] }))
    expect(host.querySelectorAll('.step-row')).toHaveLength(2)
  })

  it('reopens the popup with fresh props when items change while it is open', async () => {
    const { button, component } = mount({ items })
    click(button)
    const firstId = lastPopup().id

    const newItems: DropdownIntlItem[] = [...items, { id: 'd', label: LABEL }]
    component.$set({ items: newItems })
    await tick()

    const popups = get(popupstore)
    expect(popups).toHaveLength(1)
    expect(popups[0].props.items).toBe(newItems)
    expect(popups[0].id).not.toBe(firstId)
  })

  it('renders the dropdown arrow icon only when showDropdownIcon is set', () => {
    expect(mount({ items }).host.querySelector('.dropdown-arrow-icon')).toBeNull()
    expect(mount({ items, showDropdownIcon: true }).host.querySelector('.dropdown-arrow-icon')).not.toBeNull()
  })
})
