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

import { getEmbeddedLabel } from '@hcengineering/platform'
import { tick, type ComponentProps } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import SearchInput from '../../ui-kit/search-input/SearchInput.svelte'

let target: HTMLElement
const mounted: Array<{ $destroy: () => void }> = []

function mount (props: ComponentProps<SearchInput>): {
  root: HTMLElement
  input: HTMLInputElement
  component: SearchInput
  changes: string[]
} {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new SearchInput({ target: host, props })
  mounted.push(component)
  const changes: string[] = []
  component.$on('change', (event: CustomEvent<string>) => changes.push(event.detail))
  const root = host.querySelector('.search-input') as HTMLElement
  return { root, input: root.querySelector('input') as HTMLInputElement, component, changes }
}

async function type (input: HTMLInputElement, text: string): Promise<void> {
  input.value = text
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await tick()
}

async function flush (): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('ui-kit SearchInput', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    vi.useRealTimers()
    mounted.splice(0).forEach((component) => {
      component.$destroy()
    })
    target.remove()
  })

  it('is a secondary small search field named by its placeholder', async () => {
    const { root, input } = mount({ placeholder: getEmbeddedLabel('Find a channel') })
    await flush()
    expect(root.classList.contains('search-input--secondary')).toBe(true)
    expect(root.classList.contains('search-input--small')).toBe(true)
    expect(input.type).toBe('search')
    expect(input.placeholder).toBe('Find a channel')
    expect(input.getAttribute('aria-label')).toBe('Find a channel')
    expect(root.querySelector('button')).toBeNull()
  })

  it('reports the query once typing settles, and at once on Enter', async () => {
    vi.useFakeTimers()
    const { input, changes } = mount({ delay: 300 })
    await type(input, 'ab')
    await type(input, 'abc')
    vi.advanceTimersByTime(299)
    expect(changes).toEqual([])
    vi.advanceTimersByTime(1)
    expect(changes).toEqual(['abc'])

    await type(input, 'abcd')
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    vi.advanceTimersByTime(300)
    expect(changes).toEqual(['abc', 'abcd'])
  })

  it('clears with a named button, reports an empty query and keeps the focus in the field', async () => {
    const { root, input, changes } = mount({ value: 'design' })
    expect(input.value).toBe('design')
    const clear = root.querySelector('button') as HTMLButtonElement
    await flush()
    expect(clear.getAttribute('aria-label')).toBe('ui:string:Clear')
    clear.click()
    await tick()
    expect(changes).toEqual([''])
    expect(input.value).toBe('')
    expect(document.activeElement).toBe(input)
    expect(root.querySelector('button')).toBeNull()
  })

  it('shows a new value set by the place', async () => {
    const { input, component } = mount({ value: 'one' })
    component.$set({ value: 'two' })
    await tick()
    expect(input.value).toBe('two')
  })

  it('marks collapsed and filled, sizes the clear button a step lower', async () => {
    const { root, input } = mount({ collapsed: true, size: 'medium', kind: 'ghost' })
    expect(root.classList.contains('search-input--collapsed')).toBe(true)
    expect(root.classList.contains('search-input--filled')).toBe(false)
    expect(root.classList.contains('search-input--ghost')).toBe(true)
    await type(input, 'q')
    expect(root.classList.contains('search-input--filled')).toBe(true)
    expect(root.querySelector('button')?.classList.contains('button--small')).toBe(true)
  })

  it('drops a pending query when the place sets its own value', async () => {
    vi.useFakeTimers()
    const { input, component, changes } = mount({ delay: 300 })
    await type(input, 'draft')
    component.$set({ value: 'set by place' })
    await tick()
    vi.advanceTimersByTime(300)
    expect(changes).toEqual([])
    expect(input.value).toBe('set by place')
  })

  it('shows a spinner in place of the search icon while loading', async () => {
    const { root, component } = mount({ loading: true })
    const icon = root.querySelector('.search-input__icon') as HTMLElement
    expect(icon.querySelector('.spinner')).not.toBeNull()
    expect(icon.querySelector('.spinner')?.getAttribute('aria-hidden')).toBe('true')
    component.$set({ loading: false })
    await tick()
    expect(icon.querySelector('.spinner')).toBeNull()
    expect(icon.querySelector('svg')).not.toBeNull()
  })

  it('passes keydown to the place and still reports Enter', async () => {
    const { input, component, changes } = mount({ value: '' })
    const keys: string[] = []
    component.$on('keydown', (event: KeyboardEvent) => keys.push(event.key))
    await type(input, 'ann')
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(keys).toEqual(['ArrowDown', 'Enter'])
    expect(changes).toEqual(['ann'])
  })

  it('is named by aria-label, or by a visible label with aria-labelledby', async () => {
    const { input: named } = mount({ 'aria-label': 'Find a member', 'aria-describedby': 'hint' })
    await flush()
    expect(named.getAttribute('aria-label')).toBe('Find a member')
    expect(named.getAttribute('aria-describedby')).toBe('hint')
    const { input: labelled } = mount({ 'aria-labelledby': 'members-title' })
    await flush()
    expect(labelled.getAttribute('aria-labelledby')).toBe('members-title')
    expect(labelled.hasAttribute('aria-label')).toBe(false)
  })

  it('takes the focus on mount with autofocus', () => {
    const { input } = mount({ autofocus: true })
    expect(document.activeElement).toBe(input)
  })
  it('clears a typed query on Escape and spends the key, an empty field lets it through', async () => {
    const { input, changes } = mount({ value: 'abc' })
    const press = (): KeyboardEvent => {
      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
      input.dispatchEvent(event)
      return event
    }
    expect(press().defaultPrevented).toBe(true)
    await tick()
    expect(input.value).toBe('')
    expect(changes).toEqual([''])
    expect(press().defaultPrevented).toBe(false)
  })
})
