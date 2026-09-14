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
import type { IntlString } from '@hcengineering/platform'
import type { ComponentProps } from 'svelte'
import DropdownLabelsPopupIntl from '../components/DropdownLabelsPopupIntl.svelte'
import IconCheck from '../components/icons/Check.svelte'
import type { DropdownIntlItem } from '../types'

let target: HTMLElement

function mount (props: Partial<ComponentProps<DropdownLabelsPopupIntl>>): {
  host: HTMLElement
  component: DropdownLabelsPopupIntl
} {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new DropdownLabelsPopupIntl({
    target: host,
    props: props as ComponentProps<DropdownLabelsPopupIntl>
  })
  return { host, component }
}

const ITEMS: DropdownIntlItem[] = [
  { id: 'a', label: 'ui:string:Alpha' as IntlString },
  { id: 'b', label: 'ui:string:Bravo' as IntlString },
  { id: 'c', label: 'ui:string:Charlie' as IntlString }
]

describe('DropdownLabelsPopupIntl', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders one menu-item button per item, labelled with the string id (no loader registered)', () => {
    const { host } = mount({ items: ITEMS })
    const buttons = host.querySelectorAll('.menu-item')
    expect(buttons).toHaveLength(3)
    expect(buttons[0].textContent).toContain('ui:string:Alpha')
  })

  it('marks the selected item with a checkmark, single select', () => {
    const { host } = mount({ items: ITEMS, selected: 'b' })
    const buttons = host.querySelectorAll('.menu-item')
    expect(buttons[0].querySelector('.check svg')).toBeNull()
    expect(buttons[1].querySelector('.check svg')).not.toBeNull()
  })

  it('marks every selected item, multiselect', () => {
    const { host } = mount({ items: ITEMS, multiselect: true, selected: ['a', 'c'] })
    const buttons = host.querySelectorAll('.menu-item')
    expect(buttons[0].querySelector('.check svg')).not.toBeNull()
    expect(buttons[1].querySelector('.check svg')).toBeNull()
    expect(buttons[2].querySelector('.check svg')).not.toBeNull()
  })

  it('dispatches close with the item id on click, single select', () => {
    const { host, component } = mount({ items: ITEMS })
    const onClose = vi.fn()
    component.$on('close', onClose)
    ;(host.querySelectorAll('.menu-item')[2] as HTMLButtonElement).click()
    expect(onClose).toHaveBeenLastCalledWith(expect.objectContaining({ detail: 'c' }))
  })

  it('toggles an item into and out of the selection, multiselect, and dispatches update', () => {
    const { host, component } = mount({ items: ITEMS, multiselect: true, selected: ['a'] })
    const onUpdate = vi.fn()
    component.$on('update', onUpdate)

    const buttons = host.querySelectorAll('.menu-item')
    ;(buttons[1] as HTMLButtonElement).click()
    expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ detail: ['a', 'b'] }))
    ;(buttons[0] as HTMLButtonElement).click()
    expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ detail: ['b'] }))
  })

  // multiselect click only takes the "update" branch when selected is already an array;
  // with selected left undefined it falls through to the single-select close path.
  it('falls back to dispatching close when multiselect has no array selection yet', () => {
    const { host, component } = mount({ items: ITEMS, multiselect: true })
    const onClose = vi.fn()
    component.$on('close', onClose)
    ;(host.querySelectorAll('.menu-item')[0] as HTMLButtonElement).click()
    expect(onClose).toHaveBeenLastCalledWith(expect.objectContaining({ detail: 'a' }))
  })

  it('renders the item icon only when the item has one', () => {
    const items: DropdownIntlItem[] = [
      { id: 'a', label: 'ui:string:Alpha' as IntlString, icon: IconCheck as any },
      { id: 'b', label: 'ui:string:Bravo' as IntlString }
    ]
    const { host } = mount({ items })
    const buttons = host.querySelectorAll('.menu-item')
    expect(buttons[0].querySelector('svg')).not.toBeNull()
    expect(buttons[1].querySelector('svg')).toBeNull()
  })

  it('moves focus between buttons with ArrowDown/ArrowUp, wrapping at the ends', () => {
    const { host } = mount({ items: ITEMS })
    const buttons = host.querySelectorAll('.menu-item') as NodeListOf<HTMLButtonElement>
    const div = host.querySelector('.selectPopup') as HTMLElement

    // No button focused yet: ArrowDown from the container focuses the first one.
    div.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(buttons[0])

    buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(buttons[1])

    // Wraps from the last button back to the first.
    buttons[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(buttons[0])

    // Wraps from the first button back to the last.
    buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(buttons[2])
  })

  it('does not render a search box by default', () => {
    const { host } = mount({ items: ITEMS })
    expect(host.querySelector('input')).toBeNull()
    expect(host.querySelector('.menu-space')).not.toBeNull()
  })

  it('renders a search box and dispatches search on input, when withSearch is on', async () => {
    const { host, component } = mount({ items: ITEMS, withSearch: true })
    const onSearch = vi.fn()
    component.$on('search', onSearch)

    const input = host.querySelector('input') as HTMLInputElement
    expect(input).not.toBeNull()
    input.value = 'br'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    expect(onSearch).toHaveBeenLastCalledWith(expect.objectContaining({ detail: 'br' }))
  })

  it('filters items by their translated (here: id-fallback) label text', async () => {
    const { host } = mount({ items: ITEMS, withSearch: true })
    // fillSearchMap resolves the translate() promises asynchronously.
    await tick()
    await tick()

    const input = host.querySelector('input') as HTMLInputElement
    input.value = 'bravo'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await tick()

    expect(host.querySelectorAll('.menu-item')).toHaveLength(1)
  })
})
