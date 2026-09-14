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
import ListView from '../components/ListView.svelte'

let target: HTMLElement

function mount (props: Partial<ComponentProps<ListView>> = {}): { host: HTMLElement, component: ListView } {
  const host = document.createElement('div')
  target.appendChild(host)
  const merged = { count: 0, ...props }
  const component = new ListView({ target: host, props: merged as ComponentProps<ListView> })
  return { host, component }
}

const rowsOf = (host: HTMLElement): HTMLElement[] => Array.from(host.querySelectorAll('.list-item'))

describe('ListView', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-15T12:00:00'))
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    vi.useRealTimers()
    target.remove()
  })

  it('renders nothing when count is 0', () => {
    const { host } = mount({ count: 0 })
    expect(host.querySelector('.list-container')).toBeNull()
  })

  it('renders count placeholder rows when items is empty', () => {
    const { host } = mount({ count: 4 })
    expect(rowsOf(host)).toHaveLength(4)
  })

  // array = items.length > 0 ? items : Array(count) - the row count follows items, not count,
  // once items is non-empty; pinned as current behaviour.
  it('renders items.length rows, not count, once items is provided', () => {
    const { host } = mount({ count: 10, items: [{}, {}, {}] })
    expect(rowsOf(host)).toHaveLength(3)
  })

  it('marks the row at selection as selected', () => {
    const { host } = mount({ count: 3, selection: 1 })
    const rows = rowsOf(host)
    expect(rows[0].classList.contains('selection')).toBe(false)
    expect(rows[1].classList.contains('selection')).toBe(true)
    expect(rows[2].classList.contains('selection')).toBe(false)
  })

  it('marks the row at highlightIndex as highlighted', () => {
    const { host } = mount({ count: 3, highlightIndex: 2 })
    const rows = rowsOf(host)
    expect(rows[0].classList.contains('highlighted')).toBe(false)
    expect(rows[2].classList.contains('highlighted')).toBe(true)
  })

  it('carries kind and colorsSchema classes on every row', () => {
    const thin = rowsOf(mount({ count: 1, kind: 'thin', colorsSchema: 'lumia' }).host)[0]
    expect(thin.classList.contains('thin')).toBe(true)
    expect(thin.classList.contains('lumia')).toBe(true)
    expect(thin.classList.contains('default')).toBe(false)

    const full = rowsOf(mount({ count: 1, kind: 'full-size' }).host)[0]
    expect(full.classList.contains('full-size')).toBe(true)
    expect(full.classList.contains('default')).toBe(true)
  })

  it('appends addClass to every row', () => {
    const row = rowsOf(mount({ count: 1, addClass: 'my-extra' }).host)[0]
    expect(row.classList.contains('my-extra')).toBe(true)
  })

  it('sets overflow visible when noScroll, auto otherwise', () => {
    expect((mount({ count: 1 }).host.querySelector('.list-container') as HTMLElement).style.overflow).toBe('auto')
    expect(
      (mount({ count: 1, noScroll: true }).host.querySelector('.list-container') as HTMLElement).style.overflow
    ).toBe('visible')
  })

  it('dispatches click with the row index, independent of the selection debounce', () => {
    const { host, component } = mount({ count: 3 })
    const onClick = vi.fn()
    component.$on('click', onClick)
    rowsOf(host)[2].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(onClick).toHaveBeenLastCalledWith(expect.objectContaining({ detail: 2 }))
  })

  it('select() moves the selection, dispatches on-select, and scrolls the row into view', async () => {
    const { host, component } = mount({ count: 5 })
    vi.advanceTimersByTime(30) // clear the initial 25ms debounce window
    const onSelect = vi.fn()
    component.$on('on-select', onSelect)
    const scrollSpy = vi.spyOn(HTMLElement.prototype, 'scrollIntoView')

    component.select(3)
    await tick()

    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ detail: 3 }))
    expect(rowsOf(host)[3].classList.contains('selection')).toBe(true)
    expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'auto', block: 'nearest' })
    scrollSpy.mockRestore()
  })

  it('select() clamps out-of-range positions to [0, count - 1]', async () => {
    const { host, component } = mount({ count: 5 })
    vi.advanceTimersByTime(30)
    component.select(-3)
    await tick()
    expect(rowsOf(host)[0].classList.contains('selection')).toBe(true)

    vi.advanceTimersByTime(30)
    component.select(99)
    await tick()
    expect(rowsOf(host)[4].classList.contains('selection')).toBe(true)
  })

  it('debounces selection changes fired within 25ms of each other', async () => {
    const { host, component } = mount({ count: 5 })
    vi.advanceTimersByTime(30)
    component.select(1)
    await tick()
    expect(rowsOf(host)[1].classList.contains('selection')).toBe(true)

    // No time advance: the second call lands inside the debounce window and is dropped.
    component.select(4)
    await tick()
    expect(rowsOf(host)[1].classList.contains('selection')).toBe(true)
    expect(rowsOf(host)[4].classList.contains('selection')).toBe(false)
  })

  it('uses a custom getKey to key rows', () => {
    const getKey = vi.fn((index: number) => `row-${index}`)
    mount({ count: 3, getKey })
    expect(getKey).toHaveBeenCalledWith(0)
    expect(getKey).toHaveBeenCalledWith(1)
    expect(getKey).toHaveBeenCalledWith(2)
  })
})
