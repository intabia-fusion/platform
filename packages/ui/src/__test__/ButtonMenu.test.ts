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
import { get } from 'svelte/store'
import type { IntlString } from '@hcengineering/platform'
import ButtonMenu from '../components/ButtonMenu.svelte'
import ModernPopup from '../components/ModernPopup.svelte'
import type { DropdownIntlItem } from '../types'
import { modalStore } from '../modals'
import { popupstore } from '../popups'

function item (id: string): DropdownIntlItem {
  return { id, label: `ui:string:${id}` as IntlString }
}

let target: HTMLElement

interface Mounted {
  component: ButtonMenu
  button: HTMLButtonElement
}

function mount (props: Record<string, unknown>): Mounted {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new ButtonMenu({ target: host, props })
  return { component, button: host.querySelector('button') as HTMLButtonElement }
}

describe('ButtonMenu', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
    modalStore.set([])
  })

  afterEach(() => {
    target.remove()
    modalStore.set([])
  })

  it('renders a button carrying kind, size and the menu class', () => {
    const { button } = mount({ items: [item('a')], kind: 'primary', size: 'small' })
    expect(button.classList.contains('hulyButton')).toBe(true)
    expect(button.classList.contains('primary')).toBe(true)
    expect(button.classList.contains('small')).toBe(true)
    expect(button.classList.contains('menu')).toBe(true)
  })

  it('passes disabled through to the button', () => {
    expect(mount({ items: [item('a')], disabled: true }).button.disabled).toBe(true)
    expect(mount({ items: [item('a')], disabled: false }).button.disabled).toBe(false)
  })

  it('opens a ModernPopup with the given items on click', () => {
    const items = [item('a'), item('b')]
    const { button } = mount({ items })
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

    const popups = get(popupstore)
    expect(popups.length).toBe(1)
    expect(popups[0].is).toBe(ModernPopup)
    expect(popups[0].props.items).toBe(items)
  })

  it('does not open a second popup while one is already open', () => {
    const { button } = mount({ items: [item('a'), item('b')] })
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(get(popupstore).length).toBe(1)
  })

  it('auto-selects a single item without ever opening a popup', () => {
    const single = item('only')
    const { component, button } = mount({ items: [single], autoSelectionIfOne: true })
    const onSelected = vi.fn()
    component.$on('selected', onSelected)

    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(onSelected).toHaveBeenLastCalledWith(expect.objectContaining({ detail: 'only' }))
    expect(get(popupstore).length).toBe(0)
  })

  it('dispatches selected and re-arms once the popup resolves', () => {
    const { component, button } = mount({ items: [item('a'), item('b')] })
    const onSelected = vi.fn()
    component.$on('selected', onSelected)

    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    // Mirrors PopupInstance._close: it calls onClose(result) then close() to drop the entry.
    const popup = get(popupstore)[0]
    popup.onClose?.('b')
    popup.close()

    expect(onSelected).toHaveBeenLastCalledWith(expect.objectContaining({ detail: 'b' }))
    expect(get(popupstore).length).toBe(0)

    // opened was reset by onClose, so a further click can open a new popup.
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(get(popupstore).length).toBe(1)
  })

  it('closes and reopens the popup with fresh items when items change while open', async () => {
    const first = [item('a'), item('b')]
    const { component, button } = mount({ items: first })
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(get(popupstore).length).toBe(1)

    const second = [item('a'), item('c')]
    component.$set({ items: second })
    await tick()

    const popups = get(popupstore)
    expect(popups.length).toBe(1)
    expect(popups[0].props.items).toBe(second)
  })
})
