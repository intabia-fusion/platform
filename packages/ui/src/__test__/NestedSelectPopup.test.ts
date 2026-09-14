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
import NestedSelectPopup from '../components/NestedSelectPopup.svelte'
import type { NestedSelectItem } from '../types'

let target: HTMLElement

interface Mounted {
  component: NestedSelectPopup
  host: HTMLElement
}

function mount (props: Record<string, unknown>): Mounted {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new NestedSelectPopup({ target: host, props: props as any })
  return { component, host }
}

function items (): NestedSelectItem[] {
  return [
    { id: 'a', label: 'ui:string:Alpha' as IntlString },
    {
      id: 'b',
      label: 'ui:string:Beta' as IntlString,
      children: [{ id: 'b1', label: 'ui:string:BetaChild' as IntlString }]
    }
  ]
}

describe('NestedSelectPopup', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders leaf items as buttons and items with children as submenus', () => {
    const { host } = mount({ items: items() })
    const box = host.querySelector('.box') as HTMLElement
    expect(box.querySelectorAll('button.menu-item')).toHaveLength(1)
    expect(box.querySelectorAll('.antiPopup-submenu')).toHaveLength(1)
  })

  it('toggles a leaf item and dispatches update with the new selection', () => {
    const { host, component } = mount({ items: items(), selectedValues: [] })
    const onUpdate = vi.fn()
    component.$on('update', onUpdate)
    const button = host.querySelector('.box > button.menu-item') as HTMLButtonElement

    button.click()
    expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ detail: ['a'] }))

    button.click()
    expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ detail: [] }))
  })

  it('calls onChange with the updated selection', () => {
    const onChange = vi.fn()
    const { host } = mount({ items: items(), onChange })
    const button = host.querySelector('.box > button.menu-item') as HTMLButtonElement
    button.click()
    expect(onChange).toHaveBeenCalledWith(['a'])
  })

  it('shows a check icon only for items in selectedValues', () => {
    const selected = mount({ items: items(), selectedValues: ['a'] })
    const none = mount({ items: items(), selectedValues: [] })
    const selectedButton = selected.host.querySelector('.box > button.menu-item') as HTMLElement
    const plainButton = none.host.querySelector('.box > button.menu-item') as HTMLElement

    expect(selectedButton.querySelector('.check')?.innerHTML).not.toBe('')
    expect(plainButton.querySelector('.check')?.innerHTML).toBe('')
  })

  it('toggles a parent item (with children) from its own row', () => {
    const { host, component } = mount({ items: items(), selectedValues: [] })
    const onUpdate = vi.fn()
    component.$on('update', onUpdate)
    const row = host.querySelector('.antiPopup-submenu .flex-row-center.w-full') as HTMLElement

    row.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ detail: ['b'] }))
  })

  it('filters top-level items by search text', async () => {
    const { host } = mount({ items: items() })
    const input = host.querySelector('.header input') as HTMLInputElement
    input.value = 'alpha'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await tick()

    const box = host.querySelector('.box') as HTMLElement
    expect(box.querySelectorAll('button.menu-item')).toHaveLength(1)
    expect(box.querySelectorAll('.antiPopup-submenu')).toHaveLength(0)
  })

  it('keeps a parent whose child matches the search, even if the parent label does not', async () => {
    const { host } = mount({ items: items() })
    const input = host.querySelector('.header input') as HTMLInputElement
    input.value = 'child'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await tick()

    const box = host.querySelector('.box') as HTMLElement
    expect(box.querySelectorAll('button.menu-item')).toHaveLength(0)
    expect(box.querySelectorAll('.antiPopup-submenu')).toHaveLength(1)
  })

  it('renders a spacer instead of a search header when not top-level', () => {
    const { host } = mount({ items: items(), isTopLevel: false })
    expect(host.querySelector('.header')).toBeNull()
    expect(host.querySelector('.menu-space')).not.toBeNull()
  })

  it('renders nothing in an empty list', () => {
    const { host } = mount({ items: [] })
    const box = host.querySelector('.box') as HTMLElement
    expect(box.children).toHaveLength(0)
  })
})
