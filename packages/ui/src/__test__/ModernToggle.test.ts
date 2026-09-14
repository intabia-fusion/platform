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
import ModernToggle from '../components/ModernToggle.svelte'

let target: HTMLElement

interface Mounted {
  component: ModernToggle
  host: HTMLElement
  label: HTMLLabelElement
  input: HTMLInputElement
}

function mount (props: Record<string, unknown> = {}): Mounted {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new ModernToggle({ target: host, props })
  return {
    component,
    host,
    label: host.querySelector('.toggle-container') as HTMLLabelElement,
    input: host.querySelector('input') as HTMLInputElement
  }
}

describe('ModernToggle', () => {
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

    component.$set({ checked: true })
    await tick()
    expect(input.checked).toBe(true)
  })

  it('forwards the native change event as a component event', async () => {
    const { component, input } = mount()
    const onChange = vi.fn()
    component.$on('change', onChange)
    input.checked = true
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await tick()
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('disables the input so clicking cannot toggle it', () => {
    const { input } = mount({ disabled: true, checked: false })
    expect(input.disabled).toBe(true)
    input.click()
    expect(input.checked).toBe(false)
  })

  it('carries the size class, large by default', () => {
    expect(mount().label.classList.contains('large')).toBe(true)
    expect(mount({ size: 'small' }).label.classList.contains('small')).toBe(true)
  })

  it('carries the background and disabled classes', () => {
    expect(mount({ background: true }).label.classList.contains('background')).toBe(true)
    expect(mount({ disabled: true }).label.classList.contains('disabled')).toBe(true)
  })

  it('is woLabel when neither label nor title is given', () => {
    expect(mount().label.classList.contains('woLabel')).toBe(true)
    expect(mount({ title: 'On' }).label.classList.contains('woLabel')).toBe(false)
    expect(mount({ label: 'ui:string:Ok' as IntlString }).label.classList.contains('woLabel')).toBe(false)
  })

  it('renders the title text and the Label id when given', () => {
    expect(mount({ title: 'My title' }).host.querySelector('.toggle-label')?.textContent).toContain('My title')
    expect(
      mount({ label: 'ui:string:Ok' as IntlString }).host.querySelector('.toggle-label')?.textContent
    ).toContain('ui:string:Ok')
  })
})
