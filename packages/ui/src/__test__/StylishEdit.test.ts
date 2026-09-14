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
import StylishEdit from '../components/StylishEdit.svelte'

let target: HTMLElement

interface Mounted {
  component: StylishEdit
  host: HTMLElement
  input: HTMLInputElement
}

function mount (props: Record<string, unknown> = {}): Mounted {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new StylishEdit({ target: host, props })
  return { component, host, input: host.querySelector('input') as HTMLInputElement }
}

async function type (input: HTMLInputElement, value: string): Promise<void> {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await tick()
}

describe('StylishEdit', () => {
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

  it('dispatches change, keyup, blur and input', async () => {
    const { component, input } = mount({ value: '' })
    const onChange = vi.fn()
    const onKeyup = vi.fn()
    const onBlur = vi.fn()
    const onInput = vi.fn()
    component.$on('change', onChange)
    component.$on('keyup', onKeyup)
    component.$on('blur', onBlur)
    component.$on('input', onInput)

    await type(input, 'abc')
    expect(onInput).toHaveBeenCalledTimes(1)

    input.dispatchEvent(new Event('change', { bubbles: true }))
    expect(onChange).toHaveBeenCalledTimes(1)

    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', bubbles: true }))
    expect(onKeyup).toHaveBeenCalledTimes(1)

    input.dispatchEvent(new Event('blur', { bubbles: true }))
    expect(onBlur).toHaveBeenCalledTimes(1)
  })

  it('passes disabled, id and name down to the input', () => {
    const { input } = mount({ disabled: true, id: 'my-id', name: 'my-name' })
    expect(input.disabled).toBe(true)
    expect(input.id).toBe('my-id')
    expect(input.name).toBe('my-name')
  })

  it('shows the label only when set', () => {
    expect(mount({ label: 'ui:string:Ok' as IntlString }).host.querySelector('.label')).not.toBeNull()
    expect(mount().host.querySelector('.label')).toBeNull()
  })

  it('toggles the nolabel class based on the label prop', () => {
    expect(mount({ label: 'ui:string:Ok' as IntlString }).input.classList.contains('nolabel')).toBe(false)
    expect(mount().input.classList.contains('nolabel')).toBe(true)
  })

  it('adds the error class and wraps error text through the class', () => {
    const { host } = mount({ error: 'bad value' })
    expect(host.querySelector('.editbox')?.classList.contains('error')).toBe(true)
    expect(mount().host.querySelector('.editbox')?.classList.contains('error')).toBe(false)
  })

  it('sets the wrapper width from the width prop', () => {
    expect(mount({ width: '20rem' }).host.querySelector('.editbox')?.getAttribute('style')).toBe('width: 20rem')
    expect(mount().host.querySelector('.editbox')?.getAttribute('style')).toBe('')
  })
})
