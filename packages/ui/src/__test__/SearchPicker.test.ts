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
import type { ComponentProps } from 'svelte'
import SearchPicker from '../components/SearchPicker.svelte'

let target: HTMLElement

function mount (props: Partial<ComponentProps<SearchPicker>> = {}): { component: SearchPicker, root: HTMLElement, input: HTMLInputElement } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new SearchPicker({ target: host, props: props as ComponentProps<SearchPicker> })
  const input = host.querySelector('input') as HTMLInputElement
  return { component, root: host, input }
}

describe('SearchPicker', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders input with placeholder', () => {
    const { input } = mount({ placeholder: 'Search...', value: '', items: [] })
    expect(input).not.toBeNull()
    expect(input.placeholder).toBe('Search...')
  })

  it('renders chips for each item', () => {
    const { root } = mount({ items: [{ id: '1', label: 'One' }, { id: '2', label: 'Two' }], value: '' })
    const chips = root.querySelectorAll('.chip')
    expect(chips.length).toBe(2)
  })

  it('focuses input when container is clicked', () => {
    const { root, input } = mount({ items: [], value: '' })
    const container = root.querySelector('.search-picker') as HTMLElement
    container.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(document.activeElement).toBe(input)
  })
})
