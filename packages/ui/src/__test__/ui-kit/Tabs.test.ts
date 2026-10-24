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
import { getEmbeddedLabel } from '@hcengineering/platform'
import { readFileSync } from 'fs'
import { join } from 'path'
import { tick, type ComponentProps } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import Tabs from '../../ui-kit/tabs/Tabs.svelte'

const ITEMS = [
  { id: 'general', label: getEmbeddedLabel('General') },
  { id: 'workspaces', label: getEmbeddedLabel('Workspaces') },
  { id: 'accounts', label: getEmbeddedLabel('Accounts') }
]

const source = readFileSync(join(__dirname, '../../ui-kit/tabs/Tabs.svelte'), 'utf8')

let target: HTMLElement
const mounted: Array<{ $destroy: () => void }> = []

function mount (props: ComponentProps<Tabs>): {
  root: HTMLElement
  tabs: HTMLButtonElement[]
  component: Tabs
} {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new Tabs({ target: host, props })
  mounted.push(component)
  const root = host.querySelector('.tabs') as HTMLElement
  return { root, tabs: Array.from(root.querySelectorAll('button')), component }
}

function key (element: HTMLElement, key: string): void {
  element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
}

describe('ui-kit Tabs', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    mounted.splice(0).forEach((component) => {
      component.$destroy()
    })
    target.remove()
  })

  it('is an underline medium tablist, ids kept as tab-<item id>', async () => {
    const { root, tabs } = mount({ items: ITEMS, selected: 'workspaces', 'aria-label': 'Admin' })
    await tick()
    expect(root.getAttribute('role')).toBe('tablist')
    expect(root.getAttribute('aria-label')).toBe('Admin')
    expect(root.classList.contains('tabs--medium')).toBe(true)
    expect(tabs.map((t) => t.getAttribute('role'))).toEqual(['tab', 'tab', 'tab'])
    expect(tabs.map((t) => t.dataset.id)).toEqual(['tab-general', 'tab-workspaces', 'tab-accounts'])
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false'])
    expect(tabs.map((t) => t.tabIndex)).toEqual([-1, 0, -1])
    expect(tabs[0].textContent?.trim()).toBe('General')
  })

  it('selects on click without reporting the selected tab again', async () => {
    const { tabs, component } = mount({ items: ITEMS, selected: 'general' })
    const onSelect = vi.fn<(event: CustomEvent<string>) => void>()
    component.$on('select', onSelect)

    tabs[0].click()
    tabs[1].click()
    await tick()
    expect(tabs[1].getAttribute('aria-selected')).toBe('true')
    expect(tabs.map((t) => t.tabIndex)).toEqual([-1, 0, -1])
    expect(onSelect.mock.calls.map(([event]) => event.detail)).toEqual(['workspaces'])
  })

  it('moves with Left / Right, Home and End, skipping disabled tabs', async () => {
    const items = ITEMS.map((it) => ({ ...it, disabled: it.id === 'workspaces' }))
    const { tabs, component } = mount({ items })
    const onSelect = vi.fn<(event: CustomEvent<string>) => void>()
    component.$on('select', onSelect)
    expect(tabs.map((t) => t.tabIndex)).toEqual([0, -1, -1])

    key(tabs[0], 'ArrowRight')
    await tick()
    expect(document.activeElement).toBe(tabs[2])
    key(tabs[2], 'ArrowRight')
    key(tabs[0], 'End')
    key(tabs[2], 'Home')
    // Up and Down belong to the content of a horizontal tablist.
    key(tabs[0], 'ArrowDown')
    await tick()
    expect(onSelect.mock.calls.map(([event]) => event.detail)).toEqual(['accounts', 'general', 'accounts', 'general'])
  })

  it('renders the small size', () => {
    const { root } = mount({ items: ITEMS, size: 'small' })
    expect(root.classList.contains('tabs--small')).toBe(true)
  })

  it('ignores a click on a disabled tab and keeps the tab stop on an enabled one', async () => {
    const items = ITEMS.map((it) => ({ ...it, disabled: it.id === 'general' }))
    const { tabs, component } = mount({ items, selected: 'general' })
    const onSelect = vi.fn()
    component.$on('select', onSelect)
    tabs[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await tick()
    expect(onSelect).not.toHaveBeenCalled()
    expect(tabs.map((t) => t.tabIndex)).toEqual([-1, 0, -1])
  })

  it('falls back to the default size when size is later set to undefined', async () => {
    const { root, component } = mount({ items: ITEMS, size: 'small' })
    expect(root.classList.contains('tabs--small')).toBe(true)
    component.$set({ size: undefined })
    await tick()
    expect(root.classList.contains('tabs--medium')).toBe(true)
    expect(root.className).not.toContain('undefined')
  })

  it('links a tab to its panel with the given id and aria-controls', () => {
    const { tabs } = mount({
      items: [
        { id: 'general', label: getEmbeddedLabel('General'), tabId: 'tab-general-el', controls: 'panel-general' },
        { id: 'accounts', label: getEmbeddedLabel('Accounts') }
      ],
      selected: 'general'
    })
    expect(tabs[0].id).toBe('tab-general-el')
    expect(tabs[0].getAttribute('aria-controls')).toBe('panel-general')
    expect(tabs[1].hasAttribute('id')).toBe(false)
    expect(tabs[1].hasAttribute('aria-controls')).toBe(false)
  })

  // jsdom computes no layout: the row must not be pulled out over its neighbours, the edge rings go inside it.
  it('keeps the row in place and draws the ring of the edge tabs inside it', () => {
    expect(source).not.toMatch(/margin-inline:\s*calc\(-1/)
    expect(source).not.toMatch(/padding-inline:\s*var\(--_ring/)
    expect(source).toMatch(/:first-child/)
    expect(source).toMatch(/:last-child/)
  })
})
