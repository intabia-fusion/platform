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
import SelectPopup from '../components/SelectPopup.svelte'
import type { SelectPopupValueType } from '../types'

let target: HTMLElement

interface Mounted {
  component: SelectPopup
  host: HTMLElement
}

function mount (props: Partial<ComponentProps<SelectPopup>>): Mounted {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new SelectPopup({ target: host, props: props as any })
  return { component, host }
}

function values (): SelectPopupValueType[] {
  return [
    { id: 'a', text: 'Alpha' },
    { id: 'b', text: 'Beta' },
    { id: 'c', text: 'Gamma', isSelected: true }
  ]
}

interface FakeKeyboardEvent {
  code: string
  preventDefault: () => void
  stopPropagation: () => void
}

function keydown (code: string): FakeKeyboardEvent {
  return { code, preventDefault: vi.fn(), stopPropagation: vi.fn() }
}

describe('SelectPopup', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders one item per value, showing its text', () => {
    const { host } = mount({ value: values() })
    const items = host.querySelectorAll('.menu-item')
    expect(items).toHaveLength(3)
    expect(items[0].textContent).toContain('Alpha')
  })

  it('shows a check slot on every item only once one of them is selected', () => {
    const none = mount({ value: [{ id: 'a', text: 'Alpha' }] })
    expect(none.host.querySelector('.check')).toBeNull()

    const some = mount({ value: values() })
    expect(some.host.querySelectorAll('.check')).toHaveLength(3)
  })

  it('calls onSelect instead of dispatching close when onSelect is provided', () => {
    const onSelect = vi.fn()
    const { host, component } = mount({ value: values(), onSelect })
    const onClose = vi.fn()
    component.$on('close', onClose)

    host.querySelectorAll<HTMLButtonElement>('.menu-item')[1].click()
    expect(onSelect).toHaveBeenCalledWith('b')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('dispatches close with the id when onSelect is not provided', () => {
    const { host, component } = mount({ value: values() })
    const onClose = vi.fn()
    component.$on('close', onClose)

    host.querySelectorAll<HTMLButtonElement>('.menu-item')[0].click()
    expect(onClose).toHaveBeenLastCalledWith(expect.objectContaining({ detail: 'a' }))
  })

  it('shows an empty placeholder when there are no items', () => {
    const { host } = mount({ value: [] })
    expect(host.querySelector('.empty-placeholder')).not.toBeNull()
    expect(host.querySelectorAll('.menu-item')).toHaveLength(0)
  })

  it('filters items by search text', async () => {
    const { host } = mount({ value: values(), searchable: true })
    const input = host.querySelector('.header input') as HTMLInputElement
    input.value = 'bet'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await tick()

    const items = host.querySelectorAll('.menu-item')
    expect(items).toHaveLength(1)
    expect(items[0].textContent).toContain('Beta')
  })

  it('Enter selects the currently highlighted item via the exported onKeydown', () => {
    const onSelect = vi.fn()
    const { component } = mount({ value: values(), onSelect })
    const evt = keydown('Enter')
    expect(component.onKeydown(evt as unknown as KeyboardEvent)).toBe(true)
    expect(onSelect).toHaveBeenCalledWith('a')
    expect(evt.preventDefault).toHaveBeenCalled()
  })

  it('Tab dispatches close without an id', () => {
    const { component } = mount({ value: values() })
    const onClose = vi.fn()
    component.$on('close', onClose)
    expect(component.onKeydown(keydown('Tab') as unknown as KeyboardEvent)).toBe(true)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onClose.mock.calls[0][0].detail).toBeNull()
  })

  // ListView.select() throttles updates to 25ms since mount, so keyboard nav needs to settle first.
  it('ArrowDown moves the selection so a later Enter picks the next item', async () => {
    const onSelect = vi.fn()
    const { component } = mount({ value: values(), onSelect })
    await new Promise((resolve) => setTimeout(resolve, 30))

    component.onKeydown(keydown('ArrowDown') as unknown as KeyboardEvent)
    component.onKeydown(keydown('Enter') as unknown as KeyboardEvent)
    expect(onSelect).toHaveBeenCalledWith('b')
  })

  it('disables every item button while loading', () => {
    const { host } = mount({ value: values(), loading: true })
    host.querySelectorAll<HTMLButtonElement>('.menu-item').forEach((b) => {
      expect(b.disabled).toBe(true)
    })
  })

  it('applies width and embedded classes to the root', () => {
    const large = mount({ value: values(), width: 'large' })
    expect(large.host.querySelector('.selectPopup')?.classList.contains('max-width-40')).toBe(true)

    const full = mount({ value: values(), width: 'full' })
    expect(full.host.querySelector('.selectPopup')?.classList.contains('full-width')).toBe(true)

    const embedded = mount({ value: values(), embedded: true })
    expect(embedded.host.querySelector('.selectPopup')?.classList.contains('embedded')).toBe(true)
  })
})
