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
import Switcher from '../components/Switcher.svelte'
import type { TabItem } from '../types'

let target: HTMLElement

function makeItems (): TabItem[] {
  return [
    { id: 'a', label: 'ui:string:A' as any, action: vi.fn() },
    { id: 'b', label: 'ui:string:B' as any, action: vi.fn() },
    { id: 'c', label: 'ui:string:C' as any }
  ]
}

interface Mounted {
  component: Switcher
  host: HTMLElement
  radios: HTMLInputElement[]
  items: TabItem[]
}

function mount (props: Record<string, unknown> = {}): Mounted {
  const host = document.createElement('div')
  target.appendChild(host)
  const items = (props.items as TabItem[] | undefined) ?? makeItems()
  const component = new Switcher({ target: host, props: { name: 'sw', ...props, items } })
  return { component, host, radios: Array.from(host.querySelectorAll('input[type=radio]')), items }
}

describe('Switcher', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders one radio per item, sharing the given name', () => {
    const { radios } = mount()
    expect(radios).toHaveLength(3)
    expect(radios.every((r) => r.name === 'sw')).toBe(true)
  })

  it('checks the radio matching selected', () => {
    const { radios } = mount({ selected: 'b' })
    expect(radios.map((r) => r.checked)).toEqual([false, true, false])
  })

  it('carries the kind class on the container', () => {
    const { host } = mount({ kind: 'subtle' })
    expect(host.querySelector('.switcher-container')?.classList.contains('subtle')).toBe(true)
  })

  it('dispatches select with the item when a radio changes', async () => {
    const { component, radios, items } = mount({ selected: 'a' })
    const onSelect = vi.fn()
    component.$on('select', onSelect)

    radios[1].dispatchEvent(new Event('change', { bubbles: true }))
    await tick()
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ detail: items[1] }))
  })

  it('calls the item action when present, and does not throw when absent', async () => {
    const { radios, items } = mount({ selected: 'a' })
    radios[1].dispatchEvent(new Event('change', { bubbles: true }))
    await tick()
    expect(items[1].action).toHaveBeenCalledTimes(1)

    // item 'c' (index 2) has no action - must not throw
    radios[2].dispatchEvent(new Event('change', { bubbles: true }))
    await tick()
  })

  it('hides the title/label when onlyIcons is set, but keeps the icon', () => {
    const items: TabItem[] = [{ id: 'x', label: 'lbl' as any, icon: 'ui:icon:Check' as any }]
    const { host } = mount({ items, onlyIcons: true })
    const el = host.querySelector('.switcher-element') as HTMLElement
    expect(el.querySelector('span')).toBeNull()
    expect(el.querySelector('.icon')).not.toBeNull()
  })
})
