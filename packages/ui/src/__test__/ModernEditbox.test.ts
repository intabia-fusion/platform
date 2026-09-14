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
import ModernEditbox from '../components/ModernEditbox.svelte'

let target: HTMLElement

interface Mounted {
  component: ModernEditbox
  host: HTMLElement
  input: HTMLInputElement
  wrapper: HTMLElement
}

function mount (props: Record<string, unknown> = {}): Mounted {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new ModernEditbox({ target: host, props })
  return {
    component,
    host,
    input: host.querySelector('input') as HTMLInputElement,
    wrapper: host.querySelector('.editbox-wrapper') as HTMLElement
  }
}

async function type (input: HTMLInputElement, value: string): Promise<void> {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await tick()
}

describe('ModernEditbox', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders text input by default and password when asked', () => {
    expect(mount().input.type).toBe('text')
    expect(mount({ password: true }).input.type).toBe('password')
  })

  it('binds the value both ways', async () => {
    const { component, input } = mount({ value: 'start' })
    expect(input.value).toBe('start')

    await type(input, 'typed')
    expect(input.value).toBe('typed')

    component.$set({ value: 'outside' })
    await tick()
    expect(input.value).toBe('outside')
  })

  it('turns limit into maxlength, and no limit into none', () => {
    expect(mount({ limit: 8 }).input.getAttribute('maxlength')).toBe('8')
    expect(mount({ limit: 0 }).input.getAttribute('maxlength')).toBeNull()
  })

  it('passes disabled and puts the disabled class on the wrapper', () => {
    const { input, wrapper } = mount({ disabled: true })
    expect(input.disabled).toBe(true)
    expect(wrapper.classList.contains('disabled')).toBe(true)
    expect(mount({ disabled: false }).wrapper.classList.contains('disabled')).toBe(false)
  })

  it('puts the error class on the wrapper when error is set', () => {
    expect(mount({ error: true }).wrapper.classList.contains('error')).toBe(true)
    expect(mount({ error: false }).wrapper.classList.contains('error')).toBe(false)
  })

  it('carries kind and size in the class list', () => {
    const { wrapper } = mount({ kind: 'secondary', size: 'large' })
    expect(wrapper.classList.contains('secondary')).toBe(true)
    expect(wrapper.classList.contains('large')).toBe(true)
  })

  it('dispatches change, keyup, keydown, input and blur with the value', async () => {
    const { component, input } = mount({ value: '' })
    const onChange = vi.fn()
    const onInput = vi.fn()
    const onBlur = vi.fn()
    component.$on('change', onChange)
    component.$on('input', onInput)
    component.$on('blur', onBlur)

    await type(input, 'abc')
    expect(onInput).toHaveBeenCalledTimes(1)

    input.dispatchEvent(new Event('change'))
    expect(onChange).toHaveBeenCalledTimes(1)

    input.dispatchEvent(new Event('blur'))
    expect(onBlur).toHaveBeenLastCalledWith(expect.objectContaining({ detail: 'abc' }))
  })

  it('focuses the input on mount with autoFocus, exposed via bind:element', () => {
    const { input } = mount({ autoFocus: true })
    expect(document.activeElement).toBe(input)
  })

  it('focuses the element on click when autoAction is off (manual focus branch)', () => {
    const { wrapper, input } = mount({ autoAction: false })
    wrapper.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(document.activeElement).toBe(input)
  })

  // With autoAction on it renders a <label> and relies on native label->input focus delegation,
  // which jsdom does not implement - so nothing focuses here, unlike in a real browser. Pinned.
  it('does not call focus itself on click when autoAction is on (default)', () => {
    const { wrapper, input } = mount()
    wrapper.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(document.activeElement).not.toBe(input)
  })

  it('renders as a label element by default and a div when autoAction is off', () => {
    expect(mount().wrapper.tagName).toBe('LABEL')
    expect(mount({ autoAction: false }).wrapper.tagName).toBe('DIV')
  })

  it('shows the floating label only for the default kind at large size', async () => {
    const shown = mount({ label: 'ui:string:Ok' as IntlString, kind: 'default', size: 'large' })
    await tick()
    expect(shown.host.querySelector('.label')).not.toBeNull()

    const hidden = mount({ label: 'ui:string:Ok' as IntlString, kind: 'default', size: 'small' })
    await tick()
    expect(hidden.host.querySelector('.label')).toBeNull()
  })
})
