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
import type { Asset, IntlString } from '@hcengineering/platform'
import ModernDropdownLabels from '../components/ModernDropdownLabels.svelte'
import ModernPopupLabels from '../components/ModernPopupLabels.svelte'
import { modalStore } from '../modals'
import { popupstore, type CompAndProps } from '../popups'
import type { DropdownTextItem } from '../types'

let target: HTMLElement

function mount (props: Record<string, unknown> = {}): { host: HTMLElement, component: ModernDropdownLabels } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new ModernDropdownLabels({ target: host, props })
  return { host, component }
}

const ITEMS: DropdownTextItem[] = [
  { id: 'a', label: 'Alpha' },
  { id: 'b', label: 'Bravo' },
  { id: 'c', label: 'Charlie' }
]

function openedPopup (): CompAndProps {
  const popups = get(popupstore)
  expect(popups).toHaveLength(1)
  return popups[0]
}

describe('ModernDropdownLabels', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
    modalStore.set([])
  })

  afterEach(() => {
    target.remove()
  })

  it('shows the placeholder label when nothing is selected and autoSelect is off', () => {
    const { host } = mount({ items: ITEMS, autoSelect: false })
    expect(host.querySelector('.placeholder-text')).not.toBeNull()
  })

  it('auto-selects the first item when selected is left undefined', () => {
    const { host } = mount({ items: ITEMS })
    expect(host.querySelector('.placeholder-text')).toBeNull()
    expect(host.querySelector('.content')?.textContent).toContain('Alpha')
  })

  // pinned behaviour, not a desired one - selected defaults to [] (not undefined) in multiselect
  // mode, and autoSelect only fires when selected === undefined, so it never kicks in here.
  it('does not auto-select in multiselect mode, since selected defaults to an empty array', () => {
    const { host } = mount({ items: ITEMS, multiselect: true })
    expect(host.querySelectorAll('.step-row')).toHaveLength(0)
    expect(host.querySelector('.placeholder-text')).not.toBeNull()
  })

  it('renders every selected item in multiselect mode, and the placeholder for an empty selection', () => {
    const multi = mount({ items: ITEMS, multiselect: true, selected: ['a', 'c'] })
    expect(multi.host.querySelectorAll('.step-row')).toHaveLength(2)

    const empty = mount({ items: ITEMS, multiselect: true, selected: [], autoSelect: false })
    expect(empty.host.querySelector('.placeholder-text')).not.toBeNull()
  })

  it('opens ModernPopupLabels on click, with the dropdown props', () => {
    const { host } = mount({ items: ITEMS, selected: 'b', multiselect: false, enableSearch: false })
    const button = host.querySelector('button') as HTMLButtonElement
    button.click()

    const popup = openedPopup()
    expect(popup.is).toBe(ModernPopupLabels)
    expect(popup.props).toEqual({
      placeholder: expect.any(String),
      items: ITEMS,
      multiselect: false,
      selected: 'b',
      enableSearch: false
    })
  })

  it('does not reopen the popup on a second click while it is already open', () => {
    const { host } = mount({ items: ITEMS })
    const button = host.querySelector('button') as HTMLButtonElement
    button.click()
    const firstId = openedPopup().id

    button.click()
    expect(get(popupstore)).toHaveLength(1)
    expect(get(popupstore)[0].id).toBe(firstId)
  })

  it('applies the popup result on close: sets selected and dispatches selected', async () => {
    const { host, component } = mount({ items: ITEMS, autoSelect: false })
    const onSelected = vi.fn()
    component.$on('selected', onSelected)

    ;(host.querySelector('button') as HTMLButtonElement).click()
    const popup = openedPopup()
    popup.onClose?.('c')
    popup.close() // the real popup host also removes the entry; onClose alone does not.
    await tick()

    expect(onSelected).toHaveBeenLastCalledWith(expect.objectContaining({ detail: 'c' }))
    expect(host.querySelector('.content')?.textContent).toContain('Charlie')
    // opened resets, so the popup can be reopened.
    ;(host.querySelector('button') as HTMLButtonElement).click()
    expect(get(popupstore)).toHaveLength(1)
  })

  it('ignores a null close result and leaves the selection untouched', async () => {
    const { host, component } = mount({ items: ITEMS, selected: 'a', autoSelect: false })
    const onSelected = vi.fn()
    component.$on('selected', onSelected)

    ;(host.querySelector('button') as HTMLButtonElement).click()
    openedPopup().onClose?.(null)
    await tick()

    expect(onSelected).not.toHaveBeenCalled()
    expect(host.querySelector('.content')?.textContent).toContain('Alpha')
  })

  it('deselects on close when allowDeselect is on and the same value is picked again', async () => {
    const { host, component } = mount({ items: ITEMS, selected: 'b', allowDeselect: true, autoSelect: false })
    const onSelected = vi.fn()
    component.$on('selected', onSelected)

    ;(host.querySelector('button') as HTMLButtonElement).click()
    openedPopup().onClose?.('b')
    await tick()

    expect(onSelected).toHaveBeenCalledTimes(1)
    // jsdom's CustomEvent turns an explicit `undefined` detail into null.
    expect(onSelected.mock.calls[0][0].detail).toBeNull()
    expect(host.querySelector('.placeholder-text')).not.toBeNull()
  })

  it('applies a live update from the popup without closing it', async () => {
    const { host, component } = mount({ items: ITEMS, multiselect: true, selected: ['a'] })
    const onSelected = vi.fn()
    component.$on('selected', onSelected)

    ;(host.querySelector('button') as HTMLButtonElement).click()
    openedPopup().onUpdate?.(['a', 'b'])
    await tick()

    expect(onSelected).toHaveBeenLastCalledWith(expect.objectContaining({ detail: ['a', 'b'] }))
    expect(host.querySelectorAll('.step-row')).toHaveLength(2)
    // still open: the popup entry is untouched by onUpdate.
    expect(get(popupstore)).toHaveLength(1)
  })

  it('renders the dropdown arrow icon only when showDropdownIcon is on', () => {
    const withArrow = mount({ items: ITEMS, showDropdownIcon: true })
    expect(withArrow.host.querySelector('.dropdown-arrow-icon')).not.toBeNull()

    const withoutArrow = mount({ items: ITEMS, showDropdownIcon: false })
    expect(withoutArrow.host.querySelector('.dropdown-arrow-icon')).toBeNull()
  })

  it('renders a ButtonIcon instead of ModernButton when showContent is off', () => {
    const withIcon = mount({ items: ITEMS, showContent: false, icon: 'ui:icon:Check' as Asset })
    expect(withIcon.host.querySelector('.content')).toBeNull()
    expect(withIcon.host.querySelector('button')).not.toBeNull()

    // No icon and no content: nothing renders inside the container.
    const bare = mount({ items: ITEMS, showContent: false })
    expect(bare.host.querySelector('button')).toBeNull()
  })

  it('falls back to NotSelected when there is neither a label nor a placeholder', () => {
    const { host } = mount({ items: [], placeholder: undefined, autoSelect: false })
    expect(host.querySelector('.placeholder-text')).not.toBeNull()
  })

  it('sizes the container from the width prop, or min-content/100% from wrap otherwise', () => {
    expect(mount({ items: ITEMS, width: '12rem' }).host.querySelector('.modern-dropdown-labels-container')?.getAttribute('style')).toContain('width: 12rem')
    expect(mount({ items: ITEMS, wrap: true }).host.querySelector('.modern-dropdown-labels-container')?.getAttribute('style')).toContain('width: 100%')
    expect(mount({ items: ITEMS }).host.querySelector('.modern-dropdown-labels-container')?.getAttribute('style')).toContain('width: min-content')
  })

  it('carries a custom label as tooltip content instead of the placeholder text', () => {
    const { host } = mount({ items: [], label: 'ui:string:Pick' as IntlString, autoSelect: false })
    expect(host.querySelector('.placeholder-text')?.textContent).toBe('ui:string:Pick')
  })
})
