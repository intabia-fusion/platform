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
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Asset, IntlString } from '@hcengineering/platform'
import type { TabBase } from '../types'
import type { ComponentProps } from 'svelte'
import TabsControl from '../components/TabsControl.svelte'

const ICON = 'ui:icon:Check' as Asset

let target: HTMLElement

function mount (props: Partial<ComponentProps<TabsControl>>): { host: HTMLElement, component: TabsControl } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new TabsControl({ target: host, props: props as ComponentProps<TabsControl> })
  return { host, component }
}

const model: TabBase[] = [
  { label: 'ui:string:One' as IntlString, icon: ICON },
  { label: 'ui:string:Two' as IntlString }
]

describe('TabsControl', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders one tab per model entry, marking the selected one', () => {
    const { host } = mount({ model, selected: 1 })
    const tabs = host.querySelectorAll('.tab')
    expect(tabs).toHaveLength(2)
    expect(tabs[0].classList.contains('selected')).toBe(false)
    expect(tabs[1].classList.contains('selected')).toBe(true)
  })

  it('renders the icon only for tabs that have one', () => {
    const { host } = mount({ model })
    const tabs = host.querySelectorAll('.tab')
    expect(tabs[0].querySelector('svg.svg-small')).not.toBeNull()
    expect(tabs[1].querySelector('svg.svg-small')).toBeNull()
  })

  it('skips the label span for an empty label', () => {
    const withLabel: TabBase[] = [{ label: 'ui:string:One' as IntlString }]
    const withoutLabel: TabBase[] = [{ label: '' as IntlString }]
    expect(mount({ model: withLabel }).host.querySelector('.overflow-label')).not.toBeNull()
    expect(mount({ model: withoutLabel }).host.querySelector('.overflow-label')).toBeNull()
  })

  it('moves the selection to the clicked tab', async () => {
    const { host } = mount({ model, selected: 0 })
    const tabs = host.querySelectorAll('.tab')
    ;(tabs[1] as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await tick()

    const updated = host.querySelectorAll('.tab')
    expect(updated[0].classList.contains('selected')).toBe(false)
    expect(updated[1].classList.contains('selected')).toBe(true)
  })

  it('carries size and gap in the container class list', () => {
    const { host } = mount({ model, size: 'small', gap: 'medium', noMargin: true })
    const container = host.querySelector('.tabs-container') as HTMLElement
    expect(container.classList.contains('small')).toBe(true)
    expect(container.classList.contains('gap-medium')).toBe(true)
    expect(container.classList.contains('noMargin')).toBe(true)
  })

  it('applies maxTabWidth to the label span', () => {
    const { host } = mount({ model, maxTabWidth: '5rem' })
    const label = host.querySelector('.overflow-label') as HTMLElement
    expect(label.style.maxWidth).toBe('5rem')
  })
})
