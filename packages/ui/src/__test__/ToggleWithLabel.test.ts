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
import ToggleWithLabel from '../components/ToggleWithLabel.svelte'

let target: HTMLElement

interface Mounted {
  component: ToggleWithLabel
  host: HTMLElement
  input: HTMLInputElement
}

function mount (props: Record<string, unknown> = {}): Mounted {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new ToggleWithLabel({ target: host, props: { label: 'ui:string:Ok' as IntlString, ...props } })
  return { component, host, input: host.querySelector('input') as HTMLInputElement }
}

describe('ToggleWithLabel', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders the label and, when given, the description', () => {
    expect(mount().host.querySelector('.caption')?.textContent).toContain('ui:string:Ok')
    expect(
      mount({ description: 'ui:string:Ok2' as IntlString }).host.querySelector('.caption span')?.textContent
    ).toContain('ui:string:Ok2')
  })

  it('renders no description span when description is not given', () => {
    expect(mount().host.querySelector('.caption span')).toBeNull()
  })

  it('binds on both ways through the inner toggle', async () => {
    const { component, input } = mount({ on: false })
    expect(input.checked).toBe(false)

    component.$set({ on: true })
    await tick()
    expect(input.checked).toBe(true)
  })

  it('dispatches its own change event with the new value on toggle', async () => {
    const { component, input } = mount({ on: false })
    const onChange = vi.fn()
    component.$on('change', onChange)

    input.checked = true
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await tick()
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ detail: true }))
  })

  it('forwards disabled down to the inner toggle input', () => {
    expect(mount({ disabled: true }).input.disabled).toBe(true)
    expect(mount({ disabled: false }).input.disabled).toBe(false)
  })

  it('does not toggle a disabled input on click', () => {
    const { input } = mount({ on: false, disabled: true })
    input.click()
    expect(input.checked).toBe(false)
  })
})
