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
import Toggle from '../components/Toggle.svelte'

let target: HTMLElement

interface Mounted {
  component: Toggle
  host: HTMLElement
  label: HTMLLabelElement
  input: HTMLInputElement
}

function mount (props: Record<string, unknown> = {}): Mounted {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new Toggle({ target: host, props })
  return {
    component,
    host,
    label: host.querySelector('.toggle') as HTMLLabelElement,
    input: host.querySelector('input') as HTMLInputElement
  }
}

describe('Toggle', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('binds on both ways', async () => {
    const { component, input } = mount({ on: false })
    expect(input.checked).toBe(false)

    component.$set({ on: true })
    await tick()
    expect(input.checked).toBe(true)
  })

  it('dispatches change with the new value on toggle', async () => {
    const { component, input } = mount({ on: false })
    const onChange = vi.fn()
    component.$on('change', onChange)

    input.checked = true
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await tick()
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ detail: true }))
  })

  it('disables the input and applies the disabled class', () => {
    const { label, input } = mount({ disabled: true })
    expect(input.disabled).toBe(true)
    expect(label.classList.contains('disabled')).toBe(true)
  })

  it('does not toggle a disabled input on click', () => {
    const { input } = mount({ on: false, disabled: true })
    input.click()
    expect(input.checked).toBe(false)
  })

  it('passes the id through to the wrapping label', () => {
    expect(mount({ id: 'tg1' }).label.id).toBe('tg1')
  })
})
