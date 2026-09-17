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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'svelte'
import ListViewItem from '../components/ListViewItem.svelte'

let target: HTMLElement

function mount (props: Partial<ComponentProps<ListViewItem>> = {}): { component: ListViewItem, root: HTMLElement, item: HTMLElement } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new ListViewItem({ target: host, props: props as ComponentProps<ListViewItem> })
  const item = host.querySelector('.list-item') as HTMLElement
  return { component, root: host, item }
}

describe('ListViewItem', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders a list-item div', () => {
    const { item } = mount()
    expect(item).not.toBeNull()
  })

  it('applies selection class when selected', () => {
    const { item } = mount({ selected: true })
    expect(item.classList.contains('selection')).toBe(true)
  })

  it('applies lumia color schema', () => {
    const { item } = mount({ colorsSchema: 'lumia' })
    expect(item.classList.contains('lumia')).toBe(true)
  })

  it('applies addClass when provided', () => {
    const { item } = mount({ addClass: 'extra' })
    expect(item.classList.contains('extra')).toBe(true)
  })

  it('applies kind class', () => {
    const { item } = mount({ kind: 'thin' })
    expect(item.classList.contains('thin')).toBe(true)
  })

  it('forwards click events', () => {
    const onClick = vi.fn()
    const { component, item } = mount()
    component.$on('click', onClick)
    item.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
