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
import type { Asset } from '@hcengineering/platform'
import type { ComponentProps } from 'svelte'
import DropdownPopup from '../components/DropdownPopup.svelte'
import type { ListItem } from '../types'

const ICON = 'ui:icon:Check' as Asset

let target: HTMLElement

interface Mounted {
  component: DropdownPopup
  host: HTMLElement
}

function mount (props: Partial<ComponentProps<DropdownPopup>>): Mounted {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new DropdownPopup({ target: host, props: props as any })
  return { component, host }
}

function items (): ListItem[] {
  return [
    { _id: 'a', label: 'Alpha' },
    { _id: 'b', label: 'Beta' },
    { _id: 'c', label: 'Gamma', isSelectable: false }
  ]
}

describe('DropdownPopup', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders one item per entry with its label', () => {
    const { host } = mount({ icon: ICON, items: items() })
    const buttons = host.querySelectorAll('.menu-item')
    expect(buttons).toHaveLength(3)
    expect(buttons[0].textContent).toContain('Alpha')
  })

  it('focuses the search input on mount', async () => {
    const { host } = mount({ icon: ICON, items: items() })
    await tick()
    expect(document.activeElement).toBe(host.querySelector('.header input'))
  })

  it('hides the search header when withSearch is false', () => {
    const { host } = mount({ icon: ICON, items: items(), withSearch: false })
    expect(host.querySelector('.header')).toBeNull()
  })

  it('filters items by label text', async () => {
    const { host } = mount({ icon: ICON, items: items() })
    const input = host.querySelector('.header input') as HTMLInputElement
    input.value = 'bet'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await tick()

    const buttons = host.querySelectorAll('.menu-item')
    expect(buttons).toHaveLength(1)
    expect(buttons[0].textContent).toContain('Beta')
  })

  it('dispatches close with the item on click', () => {
    const { host, component } = mount({ icon: ICON, items: items() })
    const onClose = vi.fn()
    component.$on('close', onClose)

    host.querySelectorAll<HTMLButtonElement>('.menu-item')[0].click()
    expect(onClose).toHaveBeenLastCalledWith(expect.objectContaining({ detail: expect.objectContaining({ _id: 'a' }) }))
  })

  it('disables a non-selectable item and does not dispatch close on click', () => {
    const { host, component } = mount({ icon: ICON, items: items() })
    const onClose = vi.fn()
    component.$on('close', onClose)

    const buttons = host.querySelectorAll<HTMLButtonElement>('.menu-item')
    expect(buttons[2].disabled).toBe(true)
    buttons[2].click()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('marks the item matching selectedId with a check icon', () => {
    const { host } = mount({ icon: ICON, items: items(), selectedId: 'b' })
    const buttons = host.querySelectorAll('.menu-item')
    expect(buttons[1].querySelector('.check')).not.toBeNull()
    expect(buttons[0].querySelector('.check')).toBeNull()
  })

  // ListView.select() throttles updates to 25ms since mount, so keyboard nav needs to settle first.
  it('ArrowDown then Enter selects the next item', async () => {
    const { host, component } = mount({ icon: ICON, items: items() })
    const onClose = vi.fn()
    component.$on('close', onClose)
    await new Promise((resolve) => setTimeout(resolve, 30))

    const wrapper = host.querySelector('.selectPopup') as HTMLElement
    wrapper.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowDown', bubbles: true, cancelable: true }))
    wrapper.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true, cancelable: true }))
    expect(onClose).toHaveBeenLastCalledWith(expect.objectContaining({ detail: expect.objectContaining({ _id: 'b' }) }))
  })
})
