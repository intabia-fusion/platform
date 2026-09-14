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
import SearchInput from '../components/SearchInput.svelte'

let target: HTMLElement

interface Mounted {
  component: SearchInput
  host: HTMLElement
  input: HTMLInputElement
  wrapper: HTMLElement
}

function mount (props: Record<string, unknown> = {}): Mounted {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new SearchInput({ target: host, props })
  return {
    component,
    host,
    input: host.querySelector('input') as HTMLInputElement,
    wrapper: host.querySelector('.searchInput-wrapper') as HTMLElement
  }
}

async function type (input: HTMLInputElement, value: string): Promise<void> {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await tick()
}

describe('SearchInput', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
    vi.useRealTimers()
  })

  it('renders a text input', () => {
    expect(mount().input.type).toBe('text')
  })

  it('debounces change: dispatches change only after the delay', async () => {
    const { component, input } = mount({ value: '', delay: 500 })
    const onChange = vi.fn()
    component.$on('change', onChange)

    await type(input, 'abc')
    expect(onChange).not.toHaveBeenCalled()

    vi.advanceTimersByTime(499)
    expect(onChange).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ detail: 'abc' }))
  })

  it('restarts the timer on further typing, so only the final value is dispatched', async () => {
    const { component, input } = mount({ value: '', delay: 500 })
    const onChange = vi.fn()
    component.$on('change', onChange)

    await type(input, 'a')
    vi.advanceTimersByTime(300)
    await type(input, 'ab')
    vi.advanceTimersByTime(300)
    expect(onChange).not.toHaveBeenCalled()

    vi.advanceTimersByTime(200)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ detail: 'ab' }))
  })

  it('dispatches change immediately on Enter, bypassing the delay', async () => {
    const { component, input } = mount({ value: '', delay: 500 })
    const onChange = vi.fn()
    component.$on('change', onChange)

    await type(input, 'abc')
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ detail: 'abc' }))
  })

  it('clears the value and dispatches change on the clear button click', async () => {
    const { component, host, input } = mount({ value: 'abc' })
    const onChange = vi.fn()
    component.$on('change', onChange)

    const clearButton = host.querySelector('.searchInput-button') as HTMLButtonElement
    clearButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await tick()
    expect(input.value).toBe('')
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ detail: '' }))
    expect(document.activeElement).toBe(input)
  })

  it('carries kind and collapsed/filled state in the class list', () => {
    const { wrapper } = mount({ kind: 'ghost', collapsed: true, value: '' })
    expect(wrapper.classList.contains('ghost')).toBe(true)
    expect(wrapper.classList.contains('collapsed')).toBe(true)
    expect(wrapper.classList.contains('filled')).toBe(false)

    expect(mount({ value: 'abc' }).wrapper.classList.contains('filled')).toBe(true)
  })

  it('focuses the input on mount with autoFocus', () => {
    const { input } = mount({ autoFocus: true })
    expect(document.activeElement).toBe(input)
  })

  it('forwards focus and blur events', () => {
    const { component, input } = mount()
    const onFocus = vi.fn()
    const onBlur = vi.fn()
    component.$on('focus', onFocus)
    component.$on('blur', onBlur)

    input.dispatchEvent(new Event('focus', { bubbles: true }))
    expect(onFocus).toHaveBeenCalledTimes(1)
    input.dispatchEvent(new Event('blur', { bubbles: true }))
    expect(onBlur).toHaveBeenCalledTimes(1)
  })
})
