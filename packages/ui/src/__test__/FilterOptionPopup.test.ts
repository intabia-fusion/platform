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
import FilterOptionPopup from '../components/FilterOptionPopup.svelte'

let target: HTMLElement

function mount (props: Partial<ComponentProps<FilterOptionPopup>> = {}): { component: FilterOptionPopup, root: HTMLElement } {
  const host = document.createElement('div')
  target.appendChild(host)
  const merged = {
    category: { id: 'c1', label: 'Category', options: [{ id: 'o1', label: 'Option 1' }, { id: 'o2', label: 'Option 2' }] } as any,
    activeFilters: [],
    onFilterChange: () => {},
    onFilterRemove: () => {},
    ...props
  }
  const component = new FilterOptionPopup({ target: host, props: merged as ComponentProps<FilterOptionPopup> })
  return { component, root: host }
}

describe('FilterOptionPopup', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders category label in header', () => {
    const { root } = mount()
    expect(root.textContent).toContain('Category')
  })

  it('renders one button per option', () => {
    const { root } = mount()
    expect(root.querySelectorAll('.option-item').length).toBe(2)
  })

  it('marks selected option', () => {
    const { root } = mount({ activeFilters: [{ categoryId: 'c1', optionId: 'o1' } as any] })
    const first = root.querySelectorAll('.option-item')[0]
    expect(first.classList.contains('selected')).toBe(true)
  })

  it('calls onFilterChange when option clicked', () => {
    const onFilterChange = vi.fn()
    const { root } = mount({ onFilterChange })
    root.querySelectorAll('.option-item')[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onFilterChange).toHaveBeenCalled()
  })

  it('shows clear button when filter is active', () => {
    const { root } = mount({ activeFilters: [{ categoryId: 'c1', optionId: 'o1' } as any] })
    expect(root.querySelector('.clear-option')).not.toBeNull()
  })
})
