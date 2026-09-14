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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IntlString } from '@hcengineering/platform'
import type { ComponentProps } from 'svelte'
import RadioButton from '../components/RadioButton.svelte'

let target: HTMLElement

interface Mounted {
  component: RadioButton
  host: HTMLElement
  wrapper: HTMLDivElement
  input: HTMLInputElement
}

function mount (props: Partial<ComponentProps<RadioButton>> = {}): Mounted {
  const host = document.createElement('div')
  target.appendChild(host)
  const merged = { value: 'a', ...props }
  const component = new RadioButton({ target: host, props: merged as ComponentProps<RadioButton> })
  return {
    component,
    host,
    wrapper: host.querySelector('.antiRadio') as HTMLDivElement,
    input: host.querySelector('input') as HTMLInputElement
  }
}

describe('RadioButton', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('is checked when group equals value, not otherwise', () => {
    expect(mount({ group: 'a', value: 'a' }).wrapper.classList.contains('checked')).toBe(true)
    expect(mount({ group: 'b', value: 'a' }).wrapper.classList.contains('checked')).toBe(false)
  })

  it('carries the disabled class and disables the input', () => {
    const { wrapper, input } = mount({ disabled: true })
    expect(wrapper.classList.contains('disabled')).toBe(true)
    expect(input.disabled).toBe(true)
  })

  it('carries the gap class', () => {
    expect(mount({ gap: 'large' }).wrapper.classList.contains('gap-large')).toBe(true)
    expect(mount().wrapper.classList.contains('gap-none')).toBe(true)
  })

  it('carries the kind class only for non-default kinds', () => {
    expect(mount({ kind: 'primary' }).wrapper.classList.contains('kind-primary')).toBe(true)
    expect(mount({ kind: 'positive' }).wrapper.classList.contains('kind-positive')).toBe(true)
    expect(mount({ kind: 'negative' }).wrapper.classList.contains('kind-negative')).toBe(true)
    const def = mount({ kind: 'default' }).wrapper
    expect(def.classList.contains('kind-primary')).toBe(false)
    expect(def.classList.contains('kind-positive')).toBe(false)
    expect(def.classList.contains('kind-negative')).toBe(false)
  })

  it('calls action once when clicking the wrapper selects a different value', () => {
    const action = vi.fn()
    const { wrapper } = mount({ group: 'a', value: 'b', action })
    wrapper.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(action).toHaveBeenCalledTimes(1)
  })

  it('does not call action when clicking the wrapper on the already-selected value', () => {
    const action = vi.fn()
    const { wrapper } = mount({ group: 'a', value: 'a', action })
    wrapper.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(action).not.toHaveBeenCalled()
  })

  it('does not call action when disabled', () => {
    const action = vi.fn()
    const { wrapper } = mount({ group: 'a', value: 'b', disabled: true, action })
    wrapper.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(action).not.toHaveBeenCalled()
  })

  it('renders labelIntl through Label when given, else the plain label string', () => {
    expect(mount({ label: 'plain text' }).host.querySelector('label')?.textContent).toContain('plain text')
    expect(mount({ labelIntl: 'ui:string:Ok' as IntlString }).host.querySelector('label')?.textContent).toContain(
      'ui:string:Ok'
    )
  })

  it('renders nothing for the label text when neither label nor labelIntl is set', () => {
    const { host } = mount()
    expect(host.querySelector('label')?.textContent?.trim()).toBe('')
  })

  it('applies labelOverflow and labelSize/labelGap classes to the label', () => {
    const { host } = mount({ labelOverflow: true, labelSize: 'large', labelGap: 'large' })
    const label = host.querySelector('label') as HTMLLabelElement
    expect(label.classList.contains('overflow-label')).toBe(true)
    expect(label.classList.contains('large')).toBe(true)
    expect(label.classList.contains('gap-large')).toBe(true)
  })

  it('associates the label with the input via id', () => {
    const { host, input } = mount({ id: 'ridA' })
    expect(input.id).toBe('ridA')
    expect(host.querySelector('label')?.getAttribute('for')).toBe('ridA')
  })

  it('generates an id when none is given', () => {
    const { input } = mount()
    expect(input.id).toBeTruthy()
  })

  // RadioButton has no on:change forward - only on:click on both the input and the wrapping div,
  // so a direct click on the input runs the action guard twice (input listener, then bubbled to the div).
  // Pinned behaviour, not a desired one - the double action() call looks like a latent bug.
  it('calls action twice when the click lands directly on the input (bubbles to the wrapper too)', () => {
    const action = vi.fn()
    const { input } = mount({ group: 'a', value: 'b', action })
    input.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(action).toHaveBeenCalledTimes(2)
  })
})
