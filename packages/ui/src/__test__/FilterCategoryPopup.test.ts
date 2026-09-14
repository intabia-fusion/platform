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
import FilterCategoryPopup from '../components/FilterCategoryPopup.svelte'
import type { ActiveFilter, FilterCategory } from '../types'

let target: HTMLElement

interface Mounted {
  component: FilterCategoryPopup
  host: HTMLElement
}

function mount (props: Record<string, unknown>): Mounted {
  const host = document.createElement('div')
  target.appendChild(host)
  const base = { onFilterChange: vi.fn(), onFilterRemove: vi.fn() }
  const component = new FilterCategoryPopup({ target: host, props: { ...base, ...props } as any })
  return { component, host }
}

function categories (): FilterCategory[] {
  return [
    {
      id: 'cat1',
      label: 'ui:string:Cat1' as IntlString,
      options: [
        { id: 'opt1', label: 'ui:string:Opt1' as IntlString },
        { id: 'opt2', label: 'ui:string:Opt2' as IntlString }
      ]
    },
    { id: 'cat2', label: 'ui:string:Cat2' as IntlString, options: [] }
  ]
}

describe('FilterCategoryPopup', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders one button per category', () => {
    const { host } = mount({ categories: categories(), activeFilters: [] })
    expect(host.querySelectorAll('.category-item')).toHaveLength(2)
  })

  it('marks an active category and shows its active option label', () => {
    const active: ActiveFilter[] = [
      { categoryId: 'cat1', optionId: 'opt1', categoryLabel: 'ui:string:Cat1' as IntlString, optionLabel: 'ui:string:Opt1' as IntlString }
    ]
    const { host } = mount({ categories: categories(), activeFilters: active })
    const buttons = host.querySelectorAll('.category-item')
    expect(buttons[0].classList.contains('active')).toBe(true)
    expect(buttons[0].querySelector('.active-value')?.textContent).toBe('ui:string:Opt1')
    expect(buttons[1].classList.contains('active')).toBe(false)
  })

  it('switches to the options view on category click', async () => {
    const { host } = mount({ categories: categories(), activeFilters: [] })
    host.querySelectorAll<HTMLButtonElement>('.category-item')[0].click()
    await tick()

    expect(host.querySelector('.category-list')).toBeNull()
    expect(host.querySelector('.back-button')).not.toBeNull()
    expect(host.querySelectorAll('.option-item')).toHaveLength(2)
  })

  it('calls onFilterChange and dispatches close when an option is picked', async () => {
    const onFilterChange = vi.fn()
    const { host, component } = mount({ categories: categories(), activeFilters: [], onFilterChange })
    const onClose = vi.fn()
    component.$on('close', onClose)

    host.querySelectorAll<HTMLButtonElement>('.category-item')[0].click()
    await tick()
    host.querySelectorAll<HTMLButtonElement>('.option-item')[1].click()

    expect(onFilterChange).toHaveBeenCalledWith({
      categoryId: 'cat1',
      optionId: 'opt2',
      categoryLabel: 'ui:string:Cat1',
      optionLabel: 'ui:string:Opt2'
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('marks the currently active option as selected', async () => {
    const active: ActiveFilter[] = [
      { categoryId: 'cat1', optionId: 'opt2', categoryLabel: 'ui:string:Cat1' as IntlString, optionLabel: 'ui:string:Opt2' as IntlString }
    ]
    const { host } = mount({ categories: categories(), activeFilters: active })
    host.querySelectorAll<HTMLButtonElement>('.category-item')[0].click()
    await tick()

    const options = host.querySelectorAll('.option-item')
    expect(options[0].classList.contains('selected')).toBe(false)
    expect(options[1].classList.contains('selected')).toBe(true)
  })

  it('shows a clear-filter button only when the category has an active filter, and clears it on click', async () => {
    const onFilterRemove = vi.fn()
    const active: ActiveFilter[] = [
      { categoryId: 'cat1', optionId: 'opt1', categoryLabel: 'ui:string:Cat1' as IntlString, optionLabel: 'ui:string:Opt1' as IntlString }
    ]
    const { host, component } = mount({ categories: categories(), activeFilters: active, onFilterRemove })
    const onClose = vi.fn()
    component.$on('close', onClose)

    host.querySelectorAll<HTMLButtonElement>('.category-item')[0].click()
    await tick()
    const clearButton = host.querySelector<HTMLButtonElement>('.clear-option')
    expect(clearButton).not.toBeNull()

    clearButton?.click()
    expect(onFilterRemove).toHaveBeenCalledWith('cat1')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('hides the clear-filter button when the category has no active filter', async () => {
    const { host } = mount({ categories: categories(), activeFilters: [] })
    host.querySelectorAll<HTMLButtonElement>('.category-item')[0].click()
    await tick()
    expect(host.querySelector('.clear-option')).toBeNull()
  })

  it('returns to the categories view from the back button', async () => {
    const { host } = mount({ categories: categories(), activeFilters: [] })
    host.querySelectorAll<HTMLButtonElement>('.category-item')[0].click()
    await tick()
    host.querySelector<HTMLButtonElement>('.back-button')?.click()
    await tick()

    expect(host.querySelector('.category-list')).not.toBeNull()
    expect(host.querySelector('.option-list')).toBeNull()
  })

  it('renders no options for a category with an empty options list', async () => {
    const { host } = mount({ categories: categories(), activeFilters: [] })
    host.querySelectorAll<HTMLButtonElement>('.category-item')[1].click()
    await tick()

    expect(host.querySelectorAll('.option-item')).toHaveLength(0)
    expect(host.querySelector('.clear-option')).toBeNull()
  })
})
