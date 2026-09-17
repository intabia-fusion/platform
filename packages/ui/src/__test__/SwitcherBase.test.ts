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
import type { ComponentProps } from 'svelte'
import SwitcherBase from '../components/SwitcherBase.svelte'

const ICON = 'ui:icon:Check' as Asset

let target: HTMLElement

interface Mounted {
  component: SwitcherBase
  host: HTMLElement
  label: HTMLLabelElement
  input: HTMLInputElement
}

function mount (props: Partial<ComponentProps<SwitcherBase>> = {}): Mounted {
  const host = document.createElement('div')
  target.appendChild(host)
  const merged = { id: 'a', name: 'grp', ...props }
  const component = new SwitcherBase({ target: host, props: merged as ComponentProps<SwitcherBase> })
  const label = host.querySelector('label.switcher-element__wrapper') as HTMLLabelElement
  return { component, host, label, input: host.querySelector('input') as HTMLInputElement }
}

describe('SwitcherBase', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders a radio input carrying name and checked', () => {
    const { input } = mount({ name: 'tabs', checked: true })
    expect(input.type).toBe('radio')
    expect(input.name).toBe('tabs')
    expect(input.checked).toBe(true)
  })

  it('builds data-id from the id prop', () => {
    const { label } = mount({ id: 'general' })
    expect(label.dataset.id).toBe('tab-general')
  })

  it('is woTitle by default, and not once a title or label is given', () => {
    const bare = mount()
    expect(bare.label.querySelector('.switcher-element')?.classList.contains('woTitle')).toBe(true)

    const withTitle = mount({ title: 'Foo' })
    expect(withTitle.label.querySelector('.switcher-element')?.classList.contains('woTitle')).toBe(false)

    const withLabel = mount({ label: 'ui:string:Ok' as IntlString })
    expect(withLabel.label.querySelector('.switcher-element')?.classList.contains('woTitle')).toBe(false)
  })

  it('carries the kind class, nuance by default', () => {
    expect(mount().label.querySelector('.switcher-element')?.classList.contains('nuance')).toBe(true)
    expect(mount({ kind: 'subtle' }).label.querySelector('.switcher-element')?.classList.contains('subtle')).toBe(true)
  })

  it('renders the icon only when given', () => {
    expect(mount().label.querySelector('.icon')).toBeNull()
    expect(mount({ icon: ICON }).label.querySelector('.icon')).not.toBeNull()
  })

  it('renders title text when given', () => {
    const { label } = mount({ title: 'Hello' })
    const spans = Array.from(label.querySelectorAll('.switcher-element > span'))
    expect(spans.some((s) => s.textContent === 'Hello')).toBe(true)
  })

  it('renders a badge span only when badge is given', () => {
    expect(mount().label.querySelector('.switcher-badge')).toBeNull()
    expect(mount({ badge: 'ui:string:Ok' as IntlString }).label.querySelector('.switcher-badge')).not.toBeNull()
  })

  it('forwards the native change event as a component event', async () => {
    const { component, input } = mount()
    const onChange = vi.fn()
    component.$on('change', onChange)

    input.dispatchEvent(new Event('change', { bubbles: true }))
    await tick()
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})
