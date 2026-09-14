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
import DropdownLabelsPopup from '../components/DropdownLabelsPopup.svelte'
import IconCheck from '../components/icons/Check.svelte'
import type { DropdownTextItem } from '../types'

let target: HTMLElement

function mount (props: Record<string, unknown> = {}): { host: HTMLElement, component: DropdownLabelsPopup } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new DropdownLabelsPopup({ target: host, props })
  return { host, component }
}

const ITEMS: DropdownTextItem[] = [
  { id: 'a', label: 'Alpha' },
  { id: 'b', label: 'Bravo' },
  { id: 'c', label: 'Charlie' }
]

/** ListView.select() throttles rapid calls via Date.now(); advance the clock between key presses. */
function mockClock (): { advance: () => void } {
  let now = 0
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  return {
    advance: () => {
      now += 30
    }
  }
}

describe('DropdownLabelsPopup', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
    vi.restoreAllMocks()
  })

  it('renders one menu-item button per item', () => {
    const { host } = mount({ items: ITEMS })
    expect(host.querySelectorAll('.menu-item')).toHaveLength(3)
  })

  it('shows the empty placeholder when there are no items', () => {
    const { host } = mount({ items: [] })
    expect(host.querySelectorAll('.menu-item')).toHaveLength(0)
    expect(host.querySelector('.empty-placeholder')).not.toBeNull()
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

    const buttons = host.querySelectorAll('.menu-item')
    ;(buttons[1] as HTMLButtonElement).click()
    expect(onClose).toHaveBeenLastCalledWith(expect.objectContaining({ detail: 'b' }))
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

  it('an exclusive item clears the rest of the selection, and toggles off on its own', () => {
    const items: DropdownTextItem[] = [...ITEMS, { id: 'x', label: 'Exclusive', exclusive: true }]
    const { host, component } = mount({ items, multiselect: true, selected: ['a', 'b'] })
    const onUpdate = vi.fn()
    component.$on('update', onUpdate)

    const buttons = host.querySelectorAll('.menu-item')
    ;(buttons[3] as HTMLButtonElement).click()
    expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ detail: ['x'] }))

    ;(buttons[3] as HTMLButtonElement).click()
    expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ detail: [] }))
  })

  it('a regular click drops any exclusive id already in the selection', () => {
    const items: DropdownTextItem[] = [...ITEMS, { id: 'x', label: 'Exclusive', exclusive: true }]
    const { host, component } = mount({ items, multiselect: true, selected: ['x'] })
    const onUpdate = vi.fn()
    component.$on('update', onUpdate)

    const buttons = host.querySelectorAll('.menu-item')
    ;(buttons[0] as HTMLButtonElement).click()
    expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ detail: ['a'] }))
  })

  it('filters the list by the search text, case-insensitively', async () => {
    const { host } = mount({ items: ITEMS })
    const input = host.querySelector('input') as HTMLInputElement
    input.value = 'bra'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await tick()
    expect(host.querySelectorAll('.menu-item')).toHaveLength(1)
    expect(host.querySelector('.label')?.textContent).toBe('Bravo')
  })

  it('hides the search box and offsets the list when enableSearch is off', () => {
    const { host } = mount({ items: ITEMS, enableSearch: false })
    expect(host.querySelector('input')).toBeNull()
    expect(host.querySelector('.scroll')?.classList.contains('mt-2')).toBe(true)
  })

  it('renders a category divider or separator label between items', () => {
    const items: DropdownTextItem[] = [
      { id: 'a', label: 'Alpha' },
      { id: 'b', label: 'Bravo', separatorBefore: true },
      { id: 'c', label: 'Charlie', separatorLabel: 'ui:string:More' as IntlString }
    ]
    const { host } = mount({ items })
    expect(host.querySelector('.menu-divider')).not.toBeNull()
    expect(host.querySelector('.hulyPopup-category')).not.toBeNull()
  })

  it('renders the item icon only when the item has one', () => {
    const items: DropdownTextItem[] = [
      { id: 'a', label: 'Alpha', icon: IconCheck as any },
      { id: 'b', label: 'Bravo' }
    ]
    const { host } = mount({ items })
    const buttons = host.querySelectorAll('.menu-item')
    expect(buttons[0].querySelector('svg')).not.toBeNull()
    expect(buttons[1].querySelector('svg')).toBeNull()
  })

  it('moves selection with ArrowDown/ArrowUp and confirms with Enter', () => {
    const clock = mockClock()
    const { host, component } = mount({ items: ITEMS })
    const onClose = vi.fn()
    component.$on('close', onClose)

    const div = host.querySelector('.selectPopup') as HTMLElement
    clock.advance()
    div.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowDown', bubbles: true, cancelable: true }))
    clock.advance()
    div.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowDown', bubbles: true, cancelable: true }))
    clock.advance()
    div.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true, cancelable: true }))

    expect(onClose).toHaveBeenLastCalledWith(expect.objectContaining({ detail: 'c' }))
  })
})
