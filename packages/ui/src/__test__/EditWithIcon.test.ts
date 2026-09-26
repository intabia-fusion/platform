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
import type { Asset } from '@hcengineering/platform'
import type { ComponentProps } from 'svelte'
import EditWithIcon from '../components/EditWithIcon.svelte'

const ICON = 'ui:icon:Check' as Asset

let target: HTMLElement

interface Mounted {
  component: EditWithIcon
  host: HTMLElement
  input: HTMLInputElement
  wrapper: HTMLElement
}

function mount (props: Partial<ComponentProps<EditWithIcon>> = {}): Mounted {
  const host = document.createElement('div')
  target.appendChild(host)
  const merged = { icon: ICON, ...props }
  const component = new EditWithIcon({ target: host, props: merged as ComponentProps<EditWithIcon> })
  return {
    component,
    host,
    input: host.querySelector('input') as HTMLInputElement,
    wrapper: host.querySelector('.editbox') as HTMLElement
  }
}

async function type (input: HTMLInputElement, value: string): Promise<void> {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await tick()
}

describe('EditWithIcon', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders the icon and a text input', () => {
    const { host, input } = mount()
    expect(input.type).toBe('text')
    expect(host.querySelector('svg')).not.toBeNull()
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

  it('dispatches change, input and keydown', async () => {
    const { component, input } = mount({ value: '' })
    const onChange = vi.fn()
    const onInput = vi.fn()
    const onKeydown = vi.fn()
    component.$on('change', onChange)
    component.$on('input', onInput)
    component.$on('keydown', onKeydown)

    await type(input, 'abc')
    expect(onInput).toHaveBeenCalledTimes(1)

    input.dispatchEvent(new Event('change'))
    expect(onChange).toHaveBeenCalledTimes(1)

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(onKeydown).toHaveBeenCalledTimes(1)
  })

  it('shows a clear button only when there is a value, and clears it on click', async () => {
    const { component, host, input } = mount({ value: '' })
    expect(host.querySelectorAll('button').length).toBe(0)

    component.$set({ value: 'abc' })
    await tick()
    const clearButtons = host.querySelectorAll('button')
    expect(clearButtons.length).toBe(1)

    const onChange = vi.fn()
    component.$on('change', onChange)
    clearButtons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await tick()
    expect(input.value).toBe('')
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ detail: '' }))
  })

  it('focuses the input when the box is clicked', () => {
    const { wrapper, input } = mount()
    wrapper.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(document.activeElement).toBe(input)
  })

  it('focuses on mount with autoFocus, and via the exported focus()', () => {
    const auto = mount({ autoFocus: true })
    expect(document.activeElement).toBe(auto.input)

    const plain = mount()
    expect(document.activeElement).not.toBe(plain.input)
    plain.component.focus()
    expect(document.activeElement).toBe(plain.input)
  })

  it('shows a spinner when loading is on', () => {
    expect(mount({ loading: true }).host.querySelectorAll('svg').length).toBeGreaterThan(1)
    expect(mount({ loading: false }).host.querySelectorAll('svg').length).toBe(1)
  })

  it('carries kind and size in the class list', () => {
    const { wrapper } = mount({ kind: 'secondary', size: 'large' })
    expect(wrapper.classList.contains('secondary')).toBe(true)
    expect(wrapper.classList.contains('large')).toBe(true)
  })

  it('sets the wrapper width from the width prop', () => {
    expect(mount({ width: '10rem' }).wrapper.getAttribute('style')).toBe('width: 10rem')
    expect(mount().wrapper.getAttribute('style')).toBe('')
  })
})
