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
import type { IntlString } from '@hcengineering/platform'
import type { WizardModel } from '../types'
import Wizard from '../components/wizard/Wizard.svelte'
import Toggle from '../components/Toggle.svelte'

let target: HTMLElement

function mount (props: Record<string, unknown>): { host: HTMLElement, component: Wizard } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new Wizard({ target: host, props })
  return { host, component }
}

const items: WizardModel[] = [
  { label: 'ui:string:StepOne' as IntlString, component: Toggle, props: { id: 'step-0' } },
  { label: 'ui:string:StepTwo' as IntlString, component: Toggle, props: { id: 'step-1' } }
]

describe('Wizard', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders the selected item component with its props', () => {
    const { host } = mount({ items })
    const toggle = host.querySelector('label.toggle') as HTMLElement
    expect(toggle).not.toBeNull()
    expect(toggle.id).toBe('step-0')
  })

  it('switches the rendered step when selected changes', async () => {
    const { host, component } = mount({ items, selected: 0 })
    expect((host.querySelector('label.toggle') as HTMLElement).id).toBe('step-0')

    component.$set({ selected: 1 })
    await tick()
    expect((host.querySelector('label.toggle') as HTMLElement).id).toBe('step-1')
  })

  // selectedItem is `items[selected]`, undefined once the index runs off the array - guarded by `{#if selectedItem}`.
  it('renders no step content when selected is out of range', () => {
    const { host } = mount({ items, selected: 5 })
    expect(host.querySelector('label.toggle')).toBeNull()
  })

  it('forwards the change event dispatched by the active step component', async () => {
    const { host, component } = mount({ items })
    const onChange = vi.fn()
    component.$on('change', onChange)

    const checkbox = host.querySelector('input.chBox') as HTMLInputElement
    checkbox.checked = true
    checkbox.dispatchEvent(new Event('change', { bubbles: true }))
    await tick()

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ detail: true }))
  })

  it('mounts an empty wizard with no items and no selection without throwing', () => {
    expect(() => mount({ items: [] })).not.toThrow()
    const { host } = mount({ items: [], selected: 0 })
    expect(host.querySelector('label.toggle')).toBeNull()
  })
})
