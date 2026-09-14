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
import ButtonGroup from '../components/ButtonGroup.svelte'
import type { ButtonItem } from '../types'

const ICON = 'ui:icon:Check' as Asset
const ITEMS: ButtonItem[] = [
  { id: 'a', label: 'ui:string:Ok' as IntlString, icon: ICON },
  { id: 'b', label: 'ui:string:Cancel' as IntlString }
]

let target: HTMLElement

function mount (props: Record<string, unknown>): { host: HTMLElement, component: ButtonGroup } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new ButtonGroup({ target: host, props })
  return { host, component }
}

describe('ButtonGroup', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders one button per item', () => {
    const { host } = mount({ items: ITEMS })
    expect(host.querySelectorAll('button.antiButton')).toHaveLength(2)
  })

  it('selects an item on click and dispatches select with its id', () => {
    const { host, component } = mount({ items: ITEMS })
    const onSelect = vi.fn()
    component.$on('select', onSelect)
    const [first] = host.querySelectorAll('button.antiButton')
    first.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ detail: 'a' }))
  })

  it('deselects an already-selected item by default, dispatching false', async () => {
    const { host, component } = mount({ items: ITEMS, selected: 'a' })
    const onSelect = vi.fn()
    component.$on('select', onSelect)
    const [first] = host.querySelectorAll('button.antiButton')
    expect(first.classList.contains('selected')).toBe(true)

    first.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ detail: false }))
    await tick()
    expect(first.classList.contains('selected')).toBe(false)
  })

  it('does not deselect when allowDeselected is false', () => {
    const { host, component } = mount({ items: ITEMS, selected: 'a', allowDeselected: false })
    const onSelect = vi.fn()
    component.$on('select', onSelect)
    const [first] = host.querySelectorAll('button.antiButton')
    first.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(onSelect).not.toHaveBeenCalled()
    expect(first.classList.contains('selected')).toBe(true)
  })

  it('uses the highlight class instead of selected when mode is highlighted', () => {
    const { host } = mount({ items: ITEMS, selected: 'a', mode: 'highlighted' })
    const [first] = host.querySelectorAll('button.antiButton')
    expect(first.classList.contains('highlight')).toBe(true)
    expect(first.classList.contains('selected')).toBe(false)
  })

  it('applies shared props to every button', () => {
    const { host } = mount({ items: ITEMS, props: { size: 'large' } })
    const buttons = host.querySelectorAll('button.antiButton')
    buttons.forEach((b) => { expect(b.classList.contains('large')).toBe(true) })
  })

  it('ids each button as btnGID-<item id>', () => {
    const { host } = mount({ items: ITEMS })
    const [first, second] = host.querySelectorAll('button.antiButton')
    expect(first.id).toBe('btnGID-a')
    expect(second.id).toBe('btnGID-b')
  })
})
