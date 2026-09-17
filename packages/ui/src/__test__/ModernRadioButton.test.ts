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
import ModernRadioButton from '../components/ModernRadioButton.svelte'

let target: HTMLElement

interface Mounted {
  component: ModernRadioButton
  host: HTMLElement
  input: HTMLInputElement
}

function mount (props: Partial<ComponentProps<ModernRadioButton>> = {}): Mounted {
  const host = document.createElement('div')
  target.appendChild(host)
  const merged = { value: 'a', ...props }
  const component = new ModernRadioButton({ target: host, props: merged as ComponentProps<ModernRadioButton> })
  return { component, host, input: host.querySelector('input') as HTMLInputElement }
}

describe('ModernRadioButton', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('is checked when group equals value', () => {
    expect(mount({ group: 'a', value: 'a' }).input.checked).toBe(true)
    expect(mount({ group: 'b', value: 'a' }).input.checked).toBe(false)
  })

  it('forwards the native change event as a component event', async () => {
    const { component, input } = mount({ group: 'b', value: 'a' })
    const onChange = vi.fn()
    component.$on('change', onChange)
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await tick()
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('disables the input and applies the disabled class', () => {
    const { host, input } = mount({ disabled: true })
    expect(input.disabled).toBe(true)
    expect(host.querySelector('.radioButton-container')?.classList.contains('disabled')).toBe(true)
  })

  it('carries the error class on the marker element', () => {
    expect(mount({ error: true }).host.querySelector('.radioButton-element')?.classList.contains('error')).toBe(true)
  })

  it('renders the plain label text when label is given', () => {
    expect(mount({ label: 'Choice A' }).host.querySelector('.radioButton-label')?.textContent).toContain('Choice A')
  })

  it('renders labelIntl through Label when given', () => {
    const { host } = mount({ labelIntl: 'ui:string:Ok' as IntlString })
    expect(host.querySelector('.radioButton-label')?.textContent).toContain('ui:string:Ok')
  })

  it('renders no label div when neither label, labelIntl nor a slot is given', () => {
    expect(mount().host.querySelector('.radioButton-label')).toBeNull()
  })

  it('generates an id when none is given, and passes a given one through', () => {
    expect(mount().input.id).toBeTruthy()
    expect(mount({ id: 'mrb' }).input.id).toBe('mrb')
  })
})
