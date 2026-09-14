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
import TabList from '../components/TabList.svelte'
import { deviceOptionsStore } from '../index'
import type { TabItem } from '../types'

const ICON = 'ui:icon:Check' as Asset

const items: TabItem[] = [
  { id: 'a', label: 'Alpha' },
  { id: 'b', labelIntl: 'ui:string:Ok' as IntlString },
  { id: 'c', label: 'Gamma' }
]

let target: HTMLElement

interface Mounted {
  component: TabList
  host: HTMLElement
}

function mount (props: Record<string, unknown> = {}): Mounted {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new TabList({ target: host, props: { items, ...props } })
  return { component, host }
}

function tabs (host: HTMLElement): HTMLElement[] {
  return Array.from(host.querySelectorAll('.tablist-container > *')) as HTMLElement[]
}

describe('TabList', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders one tab per item, with data-id and the right label source', () => {
    const { host } = mount()
    const rows = tabs(host)
    expect(rows).toHaveLength(3)
    expect(rows[0].dataset.id).toBe('tab-a')
    expect(rows[0].textContent).toContain('Alpha')
    expect(rows[1].textContent).toContain('ui:string:Ok') // unregistered IntlString shows its id
  })

  it('selects the first item by default when selected is left at its default', () => {
    const { host } = mount()
    expect(tabs(host)[0].classList.contains('selected')).toBe(true)
    expect(tabs(host)[1].classList.contains('selected')).toBe(false)
  })

  it('throws on construction with an empty items array and no selected - pinned behaviour', () => {
    // `if (selected === '') selected = items[0].id` runs unconditionally at init, before the
    // `{#if items.length > 0}` guard in the markup - suspected source bug, not fixed here.
    expect(() => mount({ items: [] })).toThrow()
  })

  it('renders nothing when items is empty but selected is supplied explicitly', () => {
    const { host } = mount({ items: [], selected: 'x' })
    expect(host.querySelector('.tablist-container')).toBeNull()
  })

  it('selects a tab on click and dispatches select with the item', async () => {
    const { host, component } = mount()
    const onSelect = vi.fn()
    component.$on('select', onSelect)

    tabs(host)[2].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await tick()

    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ detail: items[2] }))
    expect(tabs(host)[2].classList.contains('selected')).toBe(true)
    expect(tabs(host)[0].classList.contains('selected')).toBe(false)
  })

  it('multiselect starts with nothing selected, and click toggles membership', async () => {
    const { host, component } = mount({ multiselect: true })
    const onSelect = vi.fn()
    component.$on('select', onSelect)
    expect(tabs(host).some((t) => t.classList.contains('selected'))).toBe(false)

    tabs(host)[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await tick()
    expect(tabs(host)[0].classList.contains('selected')).toBe(true)
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ detail: items[0] }))

    tabs(host)[1].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await tick()
    expect(tabs(host)[0].classList.contains('selected')).toBe(true)
    expect(tabs(host)[1].classList.contains('selected')).toBe(true)

    tabs(host)[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await tick()
    expect(tabs(host)[0].classList.contains('selected')).toBe(false)
    expect(tabs(host)[1].classList.contains('selected')).toBe(true)
  })

  it('carries kind, size and expansion in the container class list', () => {
    const { host } = mount({ kind: 'separated-free', size: 'small', expansion: 'stretch' })
    const container = host.querySelector('.tablist-container') as HTMLElement
    expect(container.classList.contains('separated-free')).toBe(true)
    expect(container.classList.contains('small')).toBe(true)
    expect(container.classList.contains('stretch')).toBe(true)
  })

  it('renders an icon, a color swatch, or neither, per item', () => {
    const { host } = mount({
      items: [
        { id: 'i', label: 'i', icon: ICON },
        { id: 'c', label: 'c', color: '#ff0000' },
        { id: 'n', label: 'n' }
      ]
    })
    const rows = tabs(host)
    expect(rows[0].querySelector('.icon')).not.toBeNull()
    expect(rows[1].querySelector('.color')).not.toBeNull()
    expect((rows[1].querySelector('.color') as HTMLElement).style.backgroundColor).toBe('rgb(255, 0, 0)')
    expect(rows[2].querySelector('.icon')).toBeNull()
    expect(rows[2].querySelector('.color')).toBeNull()
  })

  it('renders no label span when an item has neither label nor labelIntl', () => {
    const { host } = mount({ items: [{ id: 'x', icon: ICON }] })
    expect(tabs(host)[0].querySelector('.overflow-label')).toBeNull()
  })

  it('marks each tab onlyIcons when the prop is set', () => {
    const { host } = mount({ onlyIcons: true })
    expect(tabs(host).every((t) => t.classList.contains('onlyIcons'))).toBe(true)
  })

  it('switches to the adaptive dropdown when the device size is within adaptiveShrink', () => {
    deviceOptionsStore.update((d) => ({ ...d, size: 'sm' }))
    try {
      const { host } = mount({ adaptiveShrink: 'md' })
      expect(host.querySelector('.tablist-container')).toBeNull()
      expect(host.querySelector('button.antiButton')).not.toBeNull() // DropdownLabelsIntl's trigger
    } finally {
      deviceOptionsStore.update((d) => ({ ...d, size: null }))
    }
  })

  it('stays with the plain tablist when the device size is outside adaptiveShrink', () => {
    deviceOptionsStore.update((d) => ({ ...d, size: 'xl' }))
    try {
      const { host } = mount({ adaptiveShrink: 'md' })
      expect(host.querySelector('.tablist-container')).not.toBeNull()
    } finally {
      deviceOptionsStore.update((d) => ({ ...d, size: null }))
    }
  })
})
