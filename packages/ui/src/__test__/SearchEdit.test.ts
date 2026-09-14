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
import type { ComponentProps } from 'svelte'
import SearchEdit from '../components/SearchEdit.svelte'

let target: HTMLElement

interface Mounted {
  component: SearchEdit
  host: HTMLElement
  input: HTMLInputElement
  wrapper: HTMLElement
}

function mount (props: Partial<ComponentProps<SearchEdit>> = {}): Mounted {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new SearchEdit({ target: host, props: props as ComponentProps<SearchEdit> })
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

describe('SearchEdit', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
    vi.useRealTimers()
  })

  it('renders a text input with the search icon', () => {
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

  it('debounces change: dispatches change only after 500ms', async () => {
    const { component, input } = mount({ value: '' })
    const onChange = vi.fn()
    component.$on('change', onChange)

    await type(input, 'abc')
    expect(onChange).not.toHaveBeenCalled()

    vi.advanceTimersByTime(499)
    expect(onChange).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ detail: 'abc' }))
  })

  it('dispatches change immediately on Enter, bypassing the delay', async () => {
    const { component, input } = mount({ value: '' })
    const onChange = vi.fn()
    component.$on('change', onChange)

    await type(input, 'abc')
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ detail: 'abc' }))
  })

  // EditWithIcon's clear button dispatches its own 'change' immediately, but SearchEdit's on:change
  // handler only calls restartTimer() - so the outer 'change' event is still debounced, not immediate.
  it('clears the value via the close button, but still debounces the outer change event', async () => {
    const { component, host, input } = mount({ value: 'abc' })
    const onChange = vi.fn()
    component.$on('change', onChange)

    const clearButton = host.querySelector('button') as HTMLButtonElement
    clearButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await tick()
    expect(input.value).toBe('')
    expect(onChange).not.toHaveBeenCalled()

    vi.advanceTimersByTime(500)
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ detail: '' }))
  })

  it('carries kind in the class list, ghost by default', () => {
    expect(mount().wrapper.classList.contains('ghost')).toBe(true)
    expect(mount({ kind: 'secondary' }).wrapper.classList.contains('secondary')).toBe(true)
  })

  it('sets the width from the width prop, defaulting to 12rem', () => {
    expect(mount().wrapper.getAttribute('style')).toBe('width: 12rem')
    expect(mount({ width: '20rem' }).wrapper.getAttribute('style')).toBe('width: 20rem')
  })
})
