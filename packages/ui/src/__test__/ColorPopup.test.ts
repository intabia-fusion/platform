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
import ColorPopup from '../components/ColorPopup.svelte'

let target: HTMLElement

interface ColorValue { id: number | string, color: number, label: string }

function mount (props: Record<string, unknown>): { host: HTMLElement, component: ColorPopup } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new ColorPopup({ target: host, props: props as any })
  return { host, component }
}

function values (n: number): ColorValue[] {
  return Array.from({ length: n }, (_, i) => ({ id: i, color: i, label: `color${i}` }))
}

/** ListView throttles selection changes within 25ms of the previous one; clear the window before driving keys. */
async function settle (): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 30))
}

describe('ColorPopup', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders one row per value with its label', () => {
    const { host } = mount({ value: values(3) })
    const rows = host.querySelectorAll('.menu-item')
    expect(rows.length).toBe(3)
    expect(rows[1].querySelector('.label')?.textContent).toBe('color1')
  })

  it('renders no rows for an empty value list', () => {
    const { host } = mount({ value: [] })
    expect(host.querySelectorAll('.menu-item').length).toBe(0)
  })

  it('dispatches close with the clicked item on row click', () => {
    const { host, component } = mount({ value: values(3) })
    const onClose = vi.fn()
    component.$on('close', onClose)

    host.querySelectorAll<HTMLButtonElement>('.menu-item')[1].dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    )
    expect(onClose).toHaveBeenLastCalledWith(expect.objectContaining({ detail: { id: 1, color: 1, label: 'color1' } }))
  })

  it('shows the check icon only on the row matching selected', () => {
    const { host } = mount({ value: values(3), selected: 1 })
    const rows = host.querySelectorAll('.menu-item')
    expect(rows[0].querySelector('.check svg')).toBeNull()
    expect(rows[1].querySelector('.check svg')).not.toBeNull()
    expect(rows[2].querySelector('.check svg')).toBeNull()
  })

  it('shows no check icon when selected is undefined', () => {
    const { host } = mount({ value: values(2) })
    expect(host.querySelector('.check svg')).toBeNull()
  })

  it('does not render a search box when searchable is off', () => {
    const { host } = mount({ value: values(2) })
    expect(host.querySelector('.header')).toBeNull()
  })

  it('filters rows by label when searchable', async () => {
    const { host } = mount({ value: values(3), searchable: true })
    const input = host.querySelector('input') as HTMLInputElement
    expect(input).not.toBeNull()

    input.value = 'color1'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await tick()

    expect(host.querySelectorAll('.menu-item').length).toBe(1)
    expect(host.querySelector('.label')?.textContent).toBe('color1')
  })

  it('filtering is case-insensitive', async () => {
    const { host } = mount({ value: values(3), searchable: true })
    const input = host.querySelector('input') as HTMLInputElement
    input.value = 'COLOR2'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await tick()
    expect(host.querySelectorAll('.menu-item').length).toBe(1)
  })

  it('ArrowDown then Enter selects the next row and dispatches close', async () => {
    const { host, component } = mount({ value: values(3) })
    const onClose = vi.fn()
    component.$on('close', onClose)
    const container = host.querySelector('.selectPopup') as HTMLElement

    await settle()
    container.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowDown', bubbles: true, cancelable: true }))
    await settle()
    container.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true, cancelable: true }))

    expect(onClose).toHaveBeenLastCalledWith(expect.objectContaining({ detail: { id: 1, color: 1, label: 'color1' } }))
  })

  it('ArrowUp clamps at the first row instead of going negative', async () => {
    const { host, component } = mount({ value: values(3) })
    const onClose = vi.fn()
    component.$on('close', onClose)
    const container = host.querySelector('.selectPopup') as HTMLElement

    await settle()
    container.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp', bubbles: true, cancelable: true }))
    await settle()
    container.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true, cancelable: true }))

    expect(onClose).toHaveBeenLastCalledWith(expect.objectContaining({ detail: { id: 0, color: 0, label: 'color0' } }))
  })
})
