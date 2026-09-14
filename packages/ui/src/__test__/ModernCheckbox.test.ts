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
import ModernCheckbox from '../components/ModernCheckbox.svelte'

let target: HTMLElement

interface Mounted {
  component: ModernCheckbox
  host: HTMLElement
  input: HTMLInputElement
  element: HTMLDivElement
}

function mount (props: Record<string, unknown> = {}): Mounted {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new ModernCheckbox({ target: host, props })
  return {
    component,
    host,
    input: host.querySelector('input') as HTMLInputElement,
    element: host.querySelector('.checkbox-element') as HTMLDivElement
  }
}

describe('ModernCheckbox', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('binds checked both ways', async () => {
    const { component, input } = mount({ checked: false })
    expect(input.checked).toBe(false)

    input.checked = true
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await tick()

    component.$set({ checked: true })
    await tick()
    expect(input.checked).toBe(true)
  })

  it('forwards the native change event as a component event', async () => {
    const { component, input } = mount()
    const onChange = vi.fn()
    component.$on('change', onChange)
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await tick()
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('sets indeterminate on the input', () => {
    expect(mount({ indeterminate: true }).input.indeterminate).toBe(true)
    expect(mount({ indeterminate: false }).input.indeterminate).toBe(false)
  })

  it('sets required and disabled on the input', () => {
    expect(mount({ required: true }).input.required).toBe(true)
    expect(mount({ disabled: true }).input.disabled).toBe(true)
  })

  it('carries the disabled class on the wrapping label', () => {
    expect(mount({ disabled: true }).host.querySelector('label')?.classList.contains('disabled')).toBe(true)
  })

  it('carries the error class on the checkbox element', () => {
    expect(mount({ error: true }).element.classList.contains('error')).toBe(true)
    expect(mount().element.classList.contains('error')).toBe(false)
  })

  it('renders the plain label text when label is given', () => {
    const { host } = mount({ label: 'Agree' })
    expect(host.querySelector('.checkbox-label')?.textContent).toContain('Agree')
  })

  it('renders labelIntl through Label when given', () => {
    const { host } = mount({ labelIntl: 'ui:string:Ok' as IntlString })
    expect(host.querySelector('.checkbox-label')?.textContent).toContain('ui:string:Ok')
  })

  it('renders no label div when neither label, labelIntl nor a slot is given', () => {
    expect(mount().host.querySelector('.checkbox-label')).toBeNull()
  })

  it('generates an id when none is given, and passes a given one through', () => {
    expect(mount().input.id).toBeTruthy()
    expect(mount({ id: 'mcb' }).input.id).toBe('mcb')
  })
})
