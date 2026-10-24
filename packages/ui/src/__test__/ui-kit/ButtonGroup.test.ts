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
import { getEmbeddedLabel, type Asset } from '@hcengineering/platform'
import { tick, type ComponentProps } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ButtonGroup from '../../ui-kit/button-group/ButtonGroup.svelte'

const ITEMS = [
  { id: 'info', icon: 'ui:icon:Info' as Asset, tooltip: { label: getEmbeddedLabel('Info') } },
  { id: 'history', icon: 'ui:icon:History' as Asset, tooltip: { label: getEmbeddedLabel('History') } }
]

let target: HTMLElement
const mounted: Array<{ $destroy: () => void }> = []

function mount (props: ComponentProps<ButtonGroup>): {
  root: HTMLElement
  buttons: HTMLButtonElement[]
  component: ButtonGroup
} {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new ButtonGroup({ target: host, props })
  mounted.push(component)
  const root = host.querySelector('.button-group') as HTMLElement
  return { root, buttons: Array.from(root.querySelectorAll('button')), component }
}

describe('ui-kit ButtonGroup', () => {
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

  it('is a group of ghost small toggles, ids kept as btnGID-<item id>', () => {
    const { root, buttons } = mount({ items: ITEMS, 'aria-label': 'Aside' })
    expect(root.getAttribute('role')).toBe('group')
    expect(root.getAttribute('aria-label')).toBe('Aside')
    expect(buttons.map((b) => b.id)).toEqual(['btnGID-info', 'btnGID-history'])
    expect(buttons[0].classList.contains('button--ghost')).toBe(true)
    expect(buttons[0].classList.contains('button--small')).toBe(true)
    expect(buttons.every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true)
  })

  it('turns one item on, switches to another and turns it off again', async () => {
    const { buttons, component } = mount({ items: ITEMS })
    const onSelect = vi.fn<(event: CustomEvent<string | null>) => void>()
    component.$on('select', onSelect)

    buttons[0].click()
    await tick()
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true')
    buttons[1].click()
    await tick()
    expect(buttons[0].getAttribute('aria-pressed')).toBe('false')
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true')
    buttons[1].click()
    await tick()
    expect(buttons[1].getAttribute('aria-pressed')).toBe('false')
    expect(onSelect.mock.calls.map(([event]) => event.detail)).toEqual(['info', 'history', null])
  })

  it('keeps the item on without allowDeselect', async () => {
    const { buttons, component } = mount({ items: ITEMS, selected: 'info', allowDeselect: false })
    const onSelect = vi.fn()
    component.$on('select', onSelect)

    buttons[0].click()
    await tick()
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('passes kind, size and icon size to every toggle', () => {
    const { buttons } = mount({ items: ITEMS, kind: 'secondary', size: 'extra-small', iconSize: 'medium' })
    expect(buttons.every((b) => b.classList.contains('button--secondary'))).toBe(true)
    expect(buttons.every((b) => b.classList.contains('button--extra-small'))).toBe(true)
    expect(buttons[0].querySelector('svg.svg-medium')).not.toBeNull()
  })

  it('falls back to ghost and small when kind and size are passed as undefined', async () => {
    const { buttons, component } = mount({ items: ITEMS, kind: 'secondary', size: 'large' })
    component.$set({ kind: undefined, size: undefined })
    await tick()
    expect(buttons[0].classList.contains('button--ghost')).toBe(true)
    expect(buttons[0].classList.contains('button--small')).toBe(true)
  })

  it('names icon-only items by their tooltip and keeps a disabled item off', async () => {
    const { buttons, component } = mount({ items: [ITEMS[0], { ...ITEMS[1], disabled: true }] })
    const onSelect = vi.fn()
    component.$on('select', onSelect)
    await tick()
    expect(buttons[0].getAttribute('aria-label')).toBe('Info')
    expect(buttons[1].disabled).toBe(true)

    buttons[1].click()
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('follows selected set from outside', async () => {
    const { buttons, component } = mount({ items: ITEMS, selected: 'info' })
    component.$set({ selected: 'history' })
    await tick()
    expect(buttons[0].getAttribute('aria-pressed')).toBe('false')
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true')
  })
})
