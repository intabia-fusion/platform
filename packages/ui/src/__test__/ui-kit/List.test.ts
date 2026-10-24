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

import type { ListProps } from '../../ui-kit/list/types'
import ListWithItems from './ListWithItems.svelte'

const lazyRows = vi.hoisted(() => ({ show: [] as Array<(visible: boolean, unsubscribe?: () => void) => void> }))

vi.mock('../../lazy', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isLazyEnabled: () => true,
  lazyObserver: (_node: Element, callback: (visible: boolean, unsubscribe?: () => void) => void) => {
    lazyRows.show.push(callback)
    return { destroy: () => {} }
  }
}))

const ITEMS = ['alpha', 'beta', 'gamma']

let target: HTMLElement
const mounted: Array<{ $destroy: () => void }> = []

function mount (props: ListProps<string>): { root: HTMLElement, rows: HTMLElement[], component: ListWithItems } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new ListWithItems({ target: host, props: { props } })
  mounted.push(component)
  const root = host.querySelector('.list') as HTMLElement
  return { root, rows: Array.from(host.querySelectorAll('.list__row')), component }
}

describe('ui-kit List', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
    Element.prototype.scrollIntoView = vi.fn()
  })

  afterEach(() => {
    mounted.splice(0).forEach((component) => {
      component.$destroy()
    })
    target.remove()
  })

  it('renders a listbox of options with the item slot', () => {
    const { root, rows } = mount({ count: ITEMS.length, items: ITEMS, 'aria-label': 'People' })
    expect(root.getAttribute('role')).toBe('listbox')
    expect(root.getAttribute('aria-label')).toBe('People')
    expect(rows.map((row) => row.getAttribute('role'))).toEqual(['option', 'option', 'option'])
    expect(rows.map((row) => row.textContent)).toEqual(['0:alpha', '1:beta', '2:gamma'])
    expect(rows[0].getAttribute('aria-selected')).toBe('true')
    expect(root.classList.contains('list--inset')).toBe(true)
  })

  it('renders nothing without rows, only indexes without items', () => {
    expect(mount({ count: 0 }).root).toBeNull()
    expect(mount({ count: 2 }).rows.map((row) => row.textContent)).toEqual(['0:undefined', '1:undefined'])
  })

  it('moves the current row by select(), clamped, and reports it', async () => {
    const { rows, component } = mount({ count: ITEMS.length, items: ITEMS })
    const onSelect = vi.fn<(event: CustomEvent<number>) => void>()
    component.$on('select', onSelect)
    component.select(5)
    await tick()
    expect(rows[2].getAttribute('aria-selected')).toBe('true')
    expect(rows[2].classList.contains('list__row--current')).toBe(true)
    component.select(-1)
    await tick()
    expect(rows[0].getAttribute('aria-selected')).toBe('true')
    expect(onSelect.mock.calls.map(([event]) => event.detail)).toEqual([2, 0])
  })

  it('reports a click on a row and marks the highlighted one', () => {
    const { rows, component } = mount({ count: ITEMS.length, items: ITEMS, highlighted: 1 })
    const onActivate = vi.fn<(event: CustomEvent<number>) => void>()
    component.$on('activate', onActivate)
    rows[2].click()
    expect(onActivate.mock.calls[0][0].detail).toBe(2)
    expect(rows[1].classList.contains('list__row--highlighted')).toBe(true)
  })

  it('marks the current row neutrally by default and with the selection tint on request', () => {
    expect(mount({ count: 1 }).root.classList.contains('list--tint')).toBe(false)
    expect(mount({ count: 1, tone: 'tint' }).root.classList.contains('list--tint')).toBe(true)
  })

  it('switches off inset and own scroll', () => {
    const { root } = mount({ count: 1, inset: false, scroll: false })
    expect(root.classList.contains('list--inset')).toBe(false)
    expect(root.classList.contains('list--scroll')).toBe(false)
  })

  it('walks the rows by keys of the focused list or of a field that forwards them, Enter activates', async () => {
    const { root, rows, component } = mount({ count: ITEMS.length, items: ITEMS })
    const onSelect = vi.fn<(event: CustomEvent<number>) => void>()
    const onActivate = vi.fn<(event: CustomEvent<number>) => void>()
    component.$on('select', onSelect)
    component.$on('activate', onActivate)
    expect(root.tabIndex).toBe(0)
    expect(root.getAttribute('aria-activedescendant')).toBe(rows[0].id)

    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect(component.onKeydown(new KeyboardEvent('keydown', { key: 'Home' }))).toBe(true)
    expect(component.onKeydown(new KeyboardEvent('keydown', { key: 'a' }))).toBe(false)
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await tick()
    expect(onSelect.mock.calls.map(([event]) => event.detail)).toEqual([1, 2, 2, 0])
    expect(onActivate.mock.calls.map(([event]) => event.detail)).toEqual([0])
    expect(root.getAttribute('aria-activedescendant')).toBe(rows[0].id)
  })

  it('leaves keys inside the row markup to it', () => {
    const { root, component } = mount({ count: ITEMS.length, items: ITEMS })
    const onSelect = vi.fn()
    component.$on('select', onSelect)
    root.querySelector('.value')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('moves the current row with the pointer unless hoverSelects is off, not on the category', async () => {
    const { rows, component, root } = mount({ count: ITEMS.length, items: ITEMS })
    const onSelect = vi.fn<(event: CustomEvent<number>) => void>()
    component.$on('select', onSelect)
    const move = (element: Element, x: number): void => {
      element.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, screenX: x, screenY: 0 }))
    }
    move(rows[2], 0)
    move(rows[2], 10)
    await tick()
    expect(onSelect.mock.calls.map(([event]) => event.detail)).toEqual([2])
    move(root.querySelector('.category') as Element, 20)
    move(root.querySelector('.category') as Element, 40)
    expect(onSelect).toHaveBeenCalledTimes(1)

    const off = mount({ count: ITEMS.length, items: ITEMS, hoverSelects: false })
    const offSelect = vi.fn()
    off.component.$on('select', offSelect)
    move(off.rows[1], 60)
    move(off.rows[1], 80)
    expect(offSelect).not.toHaveBeenCalled()
  })

  it('scrolls the slot of a lazy row that is not mounted yet', () => {
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    const { root, component } = mount({ count: ITEMS.length, items: ITEMS, lazy: true, rowMinHeight: '2rem' })
    component.select(2)
    const slot = root.querySelector('[data-index="2"]') as HTMLElement
    expect(scroll.mock.contexts).toEqual([slot])
    expect(slot.style.minHeight).toBe('2rem')
  })

  it('points aria-activedescendant at a lazy row only once it is in the page', async () => {
    lazyRows.show.length = 0
    const { root } = mount({ count: ITEMS.length, items: ITEMS, lazy: true, selection: 1 })
    await tick()
    expect(root.querySelector('.list__row')).toBeNull()
    expect(root.hasAttribute('aria-activedescendant')).toBe(false)

    lazyRows.show[1](true)
    await new Promise((resolve) => setTimeout(resolve, 0))
    await tick()
    const row = root.querySelector('.list__row') as HTMLElement
    expect(row.id).not.toBe('')
    expect(root.getAttribute('aria-activedescendant')).toBe(row.id)
  })
})
