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
import type { ComponentProps } from 'svelte'
import ModernPopup from '../components/ModernPopup.svelte'
import type { DropdownIntlItem } from '../types'

const ICON = 'ui:icon:Check' as Asset

let target: HTMLElement

function mount (props: Partial<ComponentProps<ModernPopup>> = {}): { host: HTMLElement, component: ModernPopup } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new ModernPopup({ target: host, props: props as ComponentProps<ModernPopup> })
  return { host, component }
}

function items (n: number, extra: Partial<DropdownIntlItem> = {}): DropdownIntlItem[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `id${i}`,
    label: `label${i}` as IntlString,
    ...extra
  }))
}

describe('ModernPopup', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders one row per item', () => {
    const { host } = mount({ items: items(3) })
    expect(host.querySelectorAll('.hulyPopup-row').length).toBe(3)
  })

  it('shows the empty placeholder for an empty list', () => {
    const { host } = mount({ items: [] })
    expect(host.querySelectorAll('.hulyPopup-row').length).toBe(0)
    expect(host.querySelector('.empty-placeholder')).not.toBeNull()
  })

  it('dispatches close with the item id on click, single-select', () => {
    const { host, component } = mount({ items: items(3) })
    const onClose = vi.fn()
    component.$on('close', onClose)

    const rows = host.querySelectorAll<HTMLButtonElement>('.hulyPopup-row')
    rows[1].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onClose).toHaveBeenLastCalledWith(expect.objectContaining({ detail: 'id1' }))
  })

  it('multiselect: click adds and a second click removes, dispatching update', async () => {
    const { host, component } = mount({ items: items(3), multiselect: true, selected: [] })
    const onUpdate = vi.fn()
    component.$on('update', onUpdate)

    const rows = host.querySelectorAll<HTMLButtonElement>('.hulyPopup-row')
    rows[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ detail: ['id0'] }))

    component.$set({ selected: ['id0'] })
    await tick()
    host
      .querySelectorAll<HTMLButtonElement>('.hulyPopup-row')[0]
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ detail: [] }))
  })

  it('multiselect: an exclusive item clears the rest, selecting only itself', () => {
    const list = items(3)
    list[2].exclusive = true
    const { host, component } = mount({ items: list, multiselect: true, selected: ['id0'] })
    const onUpdate = vi.fn()
    component.$on('update', onUpdate)

    host
      .querySelectorAll<HTMLButtonElement>('.hulyPopup-row')[2]
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ detail: ['id2'] }))
  })

  it('multiselect: picking a normal item drops any exclusive selection', () => {
    const list = items(3)
    list[2].exclusive = true
    const { host, component } = mount({ items: list, multiselect: true, selected: ['id2'] })
    const onUpdate = vi.fn()
    component.$on('update', onUpdate)

    host
      .querySelectorAll<HTMLButtonElement>('.hulyPopup-row')[0]
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ detail: ['id0'] }))
  })

  it('marks the selected row and shows the check icon', () => {
    const { host } = mount({ items: items(3), selected: 'id1' })
    const rows = host.querySelectorAll('.hulyPopup-row')
    expect(rows[1].classList.contains('selected')).toBe(true)
    expect(rows[1].querySelector('svg')).not.toBeNull()
    expect(rows[0].classList.contains('selected')).toBe(false)
  })

  it('marks selected rows for an array of ids too', () => {
    const { host } = mount({ items: items(3), selected: ['id0', 'id2'] })
    const rows = host.querySelectorAll('.hulyPopup-row')
    expect(rows[0].classList.contains('selected')).toBe(true)
    expect(rows[1].classList.contains('selected')).toBe(false)
    expect(rows[2].classList.contains('selected')).toBe(true)
  })

  it('arrow keys move focus between rows and wrap around', () => {
    const { host } = mount({ items: items(3) })
    const rows = host.querySelectorAll<HTMLButtonElement>('.hulyPopup-row')

    rows[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect(document.activeElement).toBe(rows[1])

    rows[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect(document.activeElement).toBe(rows[0])

    rows[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    expect(document.activeElement).toBe(rows[2])
  })

  it('filters by label when withSearch is on, and dispatches search', async () => {
    const { host, component } = mount({ items: items(3), withSearch: true })
    const onSearch = vi.fn()
    component.$on('search', onSearch)

    const input = host.querySelector('input') as HTMLInputElement
    expect(input).not.toBeNull()
    input.value = 'label1'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await tick()

    expect(host.querySelectorAll('.hulyPopup-row').length).toBe(1)
    expect(onSearch).toHaveBeenLastCalledWith(expect.objectContaining({ detail: 'label1' }))
  })

  it('shows the empty placeholder when the search matches nothing', async () => {
    const { host } = mount({ items: items(3), withSearch: true })
    const input = host.querySelector('input') as HTMLInputElement
    input.value = 'nope'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await tick()

    expect(host.querySelectorAll('.hulyPopup-row').length).toBe(0)
    expect(host.querySelector('.empty-placeholder')).not.toBeNull()
  })

  it('does not render a search box without withSearch', () => {
    const { host } = mount({ items: items(2) })
    expect(host.querySelector('.search-wrapper')).toBeNull()
  })

  it('appends popupClass to the container classes', () => {
    const { host } = mount({ items: items(1), popupClass: 'wide' })
    expect(host.querySelector('.hulyPopup-container')?.classList.contains('wide')).toBe(true)
  })

  it('renders description as a second label line', () => {
    const list = items(1, { description: 'descLabel' as IntlString })
    const { host } = mount({ items: list })
    expect(host.querySelector('.hulyPopup-row__labels-wrapper')).not.toBeNull()
    expect(host.querySelectorAll('.hulyPopup-row__label').length).toBe(2)
  })

  it('renders formatted keys next to the row', () => {
    const list = items(1, { keys: ['Meta+K'] })
    const { host } = mount({ items: list })
    const row = host.querySelector('.hulyPopup-row') as HTMLElement
    expect(row.classList.contains('withKeys')).toBe(true)
    expect(row.querySelector('.hulyPopup-row__keys .key')?.textContent?.replace(/\s+/g, '')).toBe('Ctrl+K')
  })

  it('renders a separator label between groups', () => {
    const list = items(2)
    list[1].separatorLabel = 'sep' as IntlString
    const { host } = mount({ items: list })
    expect(host.querySelector('.hulyPopup-category')).not.toBeNull()
  })

  it('renders an icon slot once any item has an icon', () => {
    const list = items(2, {})
    list[0].icon = ICON
    const { host } = mount({ items: list })
    const rows = host.querySelectorAll('.hulyPopup-row')
    expect(rows[0].querySelector('.hulyPopup-row__icon svg')).not.toBeNull()
    // row without its own icon still reserves the icon slot once withIcons is true
    expect(rows[1].querySelector('.hulyPopup-row__icon')).not.toBeNull()
  })
})
