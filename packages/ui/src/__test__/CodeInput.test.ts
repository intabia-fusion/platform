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
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ComponentProps } from 'svelte'
import CodeInput from '../components/CodeInput.svelte'

let target: HTMLElement

function mount (props: Partial<ComponentProps<CodeInput>> = {}): { component: CodeInput, root: HTMLElement, input: HTMLInputElement } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new CodeInput({ target: host, props: props as ComponentProps<CodeInput> })
  const input = host.querySelector('input') as HTMLInputElement
  return { component, root: host, input }
}

describe('CodeInput', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders an input inside a container', () => {
    const { root, input } = mount()
    expect(root.querySelector('.container')).not.toBeNull()
    expect(input).not.toBeNull()
  })

  it('applies kind class', () => {
    const { root } = mount({ kind: 'secondary' })
    expect(root.querySelector('.container')?.classList.contains('secondary')).toBe(true)
  })

  it('applies size class to input', () => {
    const { input } = mount({ size: 'medium' })
    expect(input.classList.contains('medium')).toBe(true)
  })

  it('passes id and name through', () => {
    const { input } = mount({ id: 'my-id', name: 'my-name' })
    expect(input.id).toBe('my-id')
    expect(input.name).toBe('my-name')
  })

  it('binds value two-way', async () => {
    const { component, input } = mount({ value: '42' })
    expect(input.value).toBe('42')

    input.value = '99'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await tick()
    // Svelte bind:value updates the prop
    expect(input.value).toBe('99')
  })

  it('sets inputmode and autocomplete', () => {
    const { input } = mount()
    expect(input.getAttribute('inputmode')).toBe('numeric')
    expect(input.getAttribute('autocomplete')).toBe('off')
  })
})
