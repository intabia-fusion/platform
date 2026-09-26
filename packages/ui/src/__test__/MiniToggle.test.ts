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
import type { ComponentProps } from 'svelte'
import MiniToggle from '../components/MiniToggle.svelte'

let target: HTMLElement

interface Mounted {
  component: MiniToggle
  host: HTMLElement
  input: HTMLInputElement
}

function mount (props: Partial<ComponentProps<MiniToggle>> = {}): Mounted {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new MiniToggle({ target: host, props: props as ComponentProps<MiniToggle> })
  return { component, host, input: host.querySelector('input') as HTMLInputElement }
}

describe('MiniToggle', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('binds on both ways through the checkbox', async () => {
    const { component, input } = mount({ on: false })
    expect(input.checked).toBe(false)

    component.$set({ on: true })
    await tick()
    expect(input.checked).toBe(true)
  })

  // The input forwards the native 'change' event as-is (detail undefined); the label span below
  // dispatches its own 'change' with detail = the new boolean. Two different event shapes for the
  // same component event name - pinned behaviour, not a desired one.
  it('forwards the native change event from the checkbox with no detail', async () => {
    const { component, input } = mount({ on: false })
    const onChange = vi.fn()
    component.$on('change', onChange)
    input.checked = true
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await tick()
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0].detail).toBeUndefined()
  })

  it('renders no label span when label is not given', () => {
    expect(mount().host.querySelector('.mini-toggle-label')).toBeNull()
  })

  it('clicking the label span toggles on and dispatches change with the new value', async () => {
    const { component, host, input } = mount({ on: false, label: 'ui:string:Ok' as IntlString })
    const onChange = vi.fn()
    component.$on('change', onChange)

    const span = host.querySelector('.mini-toggle-label') as HTMLElement
    span.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick()

    expect(input.checked).toBe(true)
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ detail: true }))
  })

  it('does not toggle on label click when disabled', async () => {
    const { host, input } = mount({ on: false, label: 'ui:string:Ok' as IntlString, disabled: true })
    const span = host.querySelector('.mini-toggle-label') as HTMLElement
    span.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick()
    expect(input.checked).toBe(false)
  })

  it('disables the checkbox input so clicking it cannot toggle', () => {
    const { input } = mount({ on: false, disabled: true })
    expect(input.disabled).toBe(true)
    input.click()
    expect(input.checked).toBe(false)
  })
})
