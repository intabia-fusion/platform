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
import AccordionItem from '../components/AccordionItem.svelte'

let target: HTMLElement

function mount (props: Partial<ComponentProps<AccordionItem>> = {}): { component: AccordionItem, root: HTMLElement, button: HTMLButtonElement } {
  const host = document.createElement('div')
  target.appendChild(host)
  const merged = { id: 'test-acc', size: 'medium' as const, ...props }
  const component = new AccordionItem({ target: host, props: merged as ComponentProps<AccordionItem> })
  const button = host.querySelector('button') as HTMLButtonElement
  return { component, root: host, button }
}

describe('AccordionItem', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders the header button and content wrapper', () => {
    const { root, button } = mount()
    expect(button).not.toBeNull()
    expect(root.querySelector('.hulyAccordionItem-content')).not.toBeNull()
  })

  // Default: getTreeCollapsed(id) returns false, so collapsed = false and isOpen = true.
  it('toggles isOpen class on header when clicked', async () => {
    const { button } = mount()
    expect(button.classList.contains('isOpen')).toBe(true)

    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await tick()
    expect(button.classList.contains('isOpen')).toBe(false)
  })

  it('adds disabled class when disabled', () => {
    const { button } = mount({ disabled: true })
    expect(button.classList.contains('disabled')).toBe(true)
  })

  it('applies selected class when selected', () => {
    const { button } = mount({ selected: true })
    expect(button.classList.contains('selected')).toBe(true)
  })

  it('applies nested class when nested', () => {
    const { root, button } = mount({ nested: true })
    expect(button.classList.contains('nested')).toBe(true)
    expect(root.querySelector('.hulyAccordionItem-container')?.classList.contains('nested')).toBe(true)
  })

  it('shows a counter when counter is a number', () => {
    const { root } = mount({ counter: 5 })
    expect(root.textContent).toContain('5')
  })

  it('dispatches select when label is clicked while selectable', () => {
    const onSelect = vi.fn()
    const { root, component } = mount({ selectable: true })
    const label = root.querySelector('.hulyAccordionItem-header__label')
    component.$on('select', onSelect)
    label?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })
})
