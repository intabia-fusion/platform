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
import NestedMenu from '../components/NestedMenu.svelte'
import type { DropdownIntlItem } from '../types'
import { modalStore } from '../modals'

const ICON = 'ui:icon:Check' as Asset

function item (id: string, icon?: Asset): DropdownIntlItem {
  return { id, label: `ui:string:${id}` as IntlString, icon }
}

let target: HTMLElement

interface Mounted {
  component: NestedMenu
  host: HTMLElement
}

function mount (props: Partial<ComponentProps<NestedMenu>>): Mounted {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new NestedMenu({ target: host, props: props as ComponentProps<NestedMenu> })
  return { component, host }
}

describe('NestedMenu', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
    modalStore.set([])
  })

  afterEach(() => {
    target.remove()
    modalStore.set([])
  })

  it('renders nothing when items is empty and search is off', () => {
    const { host } = mount({ items: [] })
    expect(host.querySelectorAll('.menu-item, .antiPopup-submenu').length).toBe(0)
  })

  it('renders one plain menu-item per leaf item, and clicking runs onSelect and dispatches close', () => {
    const onSelect = vi.fn()
    const a = item('a')
    const b = item('b')
    const { host, component } = mount({
      items: [
        [a, []],
        [b, []]
      ],
      onSelect
    })
    const onClose = vi.fn()
    component.$on('close', onClose)

    const buttons = Array.from(host.querySelectorAll('button.menu-item'))
    expect(buttons.length).toBe(2)

    buttons[1].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(onSelect).toHaveBeenCalledWith(b)
    expect(onClose).toHaveBeenLastCalledWith(expect.objectContaining({ detail: b }))
  })

  it('shows the icon only when withIcon is set and the item has one', () => {
    const withIcon = item('a', ICON)
    const noIcon = item('b')
    const { host } = mount({
      items: [
        [withIcon, []],
        [noIcon, []]
      ],
      withIcon: true
    })
    const buttons = Array.from(host.querySelectorAll('button.menu-item'))
    expect(buttons[0].querySelector('.icon')).not.toBeNull()
    expect(buttons[1].querySelector('.icon')).toBeNull()

    const noneAtAll = mount({ items: [[withIcon, []]], withIcon: false })
    expect(noneAtAll.host.querySelector('.icon')).toBeNull()
  })

  it('renders an item with children as a submenu trigger instead of a plain button', () => {
    const parent = item('parent')
    const child = item('child')
    const { host } = mount({ items: [[parent, [child]]] })
    expect(host.querySelector('.antiPopup-submenu')).not.toBeNull()
    expect(host.querySelectorAll('button.menu-item').length).toBe(0)
  })

  it('falls back to a plain button for a with-children item once already nested (nestedFrom set)', () => {
    const parent = item('parent')
    const child = item('child')
    const { host } = mount({ items: [[parent, [child]]], nestedFrom: item('root') })
    // nestedFrom !== undefined disables the submenu-trigger branch even though item[1].length > 0.
    expect(host.querySelector('.antiPopup-submenu')).toBeNull()
    // one back button + one plain button for `parent`
    expect(host.querySelectorAll('button.menu-item').length).toBe(2)
  })

  it('renders a back entry with a divider when nestedFrom is set, and clicking it runs onSelect/close', () => {
    const onSelect = vi.fn()
    const root = item('root')
    const { host, component } = mount({ items: [], nestedFrom: root, onSelect })
    const onClose = vi.fn()
    component.$on('close', onClose)

    expect(host.querySelector('.divider')).not.toBeNull()
    const back = host.querySelector('button.menu-item') as HTMLButtonElement
    back.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(onSelect).toHaveBeenCalledWith(root)
    expect(onClose).toHaveBeenLastCalledWith(expect.objectContaining({ detail: root }))
  })

  it('dispatches close with no detail on ArrowLeft', () => {
    const { host, component } = mount({ items: [[item('a'), []]] })
    const onClose = vi.fn()
    component.$on('close', onClose)

    const button = host.querySelector('button.menu-item') as HTMLButtonElement
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onClose.mock.calls[0][0].detail).toBeNull()
  })

  // keyDown reads from `actionElements`, an array declared but never populated via bind:this -
  // pinned behaviour: ArrowDown/ArrowUp are dead code, no focus ever moves and nothing throws.
  it('does nothing on ArrowDown/ArrowUp - actionElements is never populated (suspected source bug)', () => {
    const { host } = mount({
      items: [
        [item('a'), []],
        [item('b'), []]
      ]
    })
    const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>('button.menu-item'))
    buttons[0].focus()
    expect(document.activeElement).toBe(buttons[0])

    buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(buttons[0])
  })

  it('shows the search box and results only when withSearch is on', async () => {
    const { host } = mount({ items: [[item('a'), []]], withSearch: true })
    expect(host.querySelector('.search-header')).not.toBeNull()
    // filteredItems starts at [] and only resolves to `items` after the async filter settles.
    await tick()
    await tick()
    expect(host.querySelectorAll('button.menu-item').length).toBe(1)

    const plain = mount({ items: [[item('a'), []]] })
    expect(plain.host.querySelector('.search-header')).toBeNull()
  })
})
