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

import TextArea from '../../ui-kit/text-area/TextArea.svelte'

let target: HTMLElement
const mounted: Array<{ $destroy: () => void }> = []

const description = getEmbeddedLabel('Description')

function mount (props: ComponentProps<TextArea>): {
  textarea: HTMLTextAreaElement
  component: TextArea
  inputs: string[]
  changes: string[]
} {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new TextArea({ target: host, props })
  mounted.push(component)
  const inputs: string[] = []
  const changes: string[] = []
  component.$on('input', (event: CustomEvent<string>) => inputs.push(event.detail))
  component.$on('change', (event: CustomEvent<string>) => changes.push(event.detail))
  return { textarea: host.querySelector('textarea') as HTMLTextAreaElement, component, inputs, changes }
}

async function flush (): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('ui-kit TextArea', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    mounted.splice(0).forEach((component) => {
      component.$destroy()
    })
    target.remove()
  })

  it('is a secondary small field of three rows named by its placeholder', async () => {
    const { textarea } = mount({ placeholder: description })
    await flush()
    expect(textarea.classList.contains('text-area--secondary')).toBe(true)
    expect(textarea.classList.contains('text-area--small')).toBe(true)
    expect(textarea.rows).toBe(3)
    expect(textarea.style.getPropertyValue('--_rows')).toBe('3')
    expect(textarea.classList.contains('text-area--limited')).toBe(false)
    expect(textarea.placeholder).toBe('Description')
    expect(textarea.getAttribute('aria-label')).toBe('Description')
  })

  it('reports every edit as input and the commit as change', async () => {
    const { textarea, inputs, changes, component } = mount({ placeholder: description })
    textarea.value = 'first line\nsecond'
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    await tick()
    expect(inputs).toEqual(['first line\nsecond'])
    textarea.dispatchEvent(new Event('change', { bubbles: true }))
    expect(changes).toEqual(['first line\nsecond'])
    component.$set({ value: 'from place' })
    await tick()
    expect(textarea.value).toBe('from place')
  })

  it('limits the growth with maxRows and marks ghost, medium and error', () => {
    const { textarea } = mount({
      'aria-label': 'Topic',
      kind: 'ghost',
      size: 'medium',
      rows: 2,
      maxRows: 6,
      error: true
    })
    expect(textarea.classList.contains('text-area--ghost')).toBe(true)
    expect(textarea.classList.contains('text-area--medium')).toBe(true)
    expect(textarea.classList.contains('text-area--limited')).toBe(true)
    expect(textarea.style.getPropertyValue('--_max-rows')).toBe('6')
    expect(textarea.getAttribute('aria-invalid')).toBe('true')
    expect(textarea.getAttribute('aria-label')).toBe('Topic')
    expect(textarea.classList.contains('text-area--inset')).toBe(false)
    const subtle = mount({ 'aria-label': 'Topic', kind: 'subtle' }).textarea
    expect(subtle.classList.contains('text-area--subtle') && subtle.classList.contains('text-area--ghost')).toBe(true)
    expect(
      mount({ 'aria-label': 'Topic', kind: 'ghost', inset: true }).textarea.classList.contains('text-area--inset')
    ).toBe(true)
  })

  it('passes readonly, disabled and the maximum length', () => {
    const { textarea } = mount({ placeholder: description, readonly: true, maxlength: 500 })
    expect(textarea.readOnly).toBe(true)
    expect(textarea.maxLength).toBe(500)
    const other = mount({ placeholder: description, disabled: true })
    expect(other.textarea.disabled).toBe(true)
  })

  it('grows to the height of its text after an edit', async () => {
    const { textarea } = mount({ placeholder: description })
    Object.defineProperty(textarea, 'scrollHeight', { configurable: true, get: () => 64 })
    textarea.value = 'one\ntwo\nthree'
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    await tick()
    expect(textarea.style.height).toBe('64px')
  })

  it('is named by a visible label of the place with aria-labelledby and passes keydown', async () => {
    const { textarea, component } = mount({
      'aria-labelledby': 'prompt-title',
      placeholder: description,
      'aria-describedby': 'prompt-hint'
    })
    await flush()
    expect(textarea.getAttribute('aria-labelledby')).toBe('prompt-title')
    expect(textarea.hasAttribute('aria-label')).toBe(false)
    expect(textarea.getAttribute('aria-describedby')).toBe('prompt-hint')
    const keys: string[] = []
    component.$on('keydown', (event: KeyboardEvent) => keys.push(event.key))
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(keys).toEqual(['Enter'])
  })

  it('takes the focus on mount', () => {
    const { textarea } = mount({ placeholder: description, autofocus: true })
    expect(document.activeElement).toBe(textarea)
  })

  it('refits in the next frame and only when the width changed, so the observer does not loop', async () => {
    const original = (globalThis as any).ResizeObserver
    const callbacks: Array<() => void> = []
    ;(globalThis as any).ResizeObserver = class {
      constructor (cb: () => void) {
        callbacks.push(cb)
      }

      observe (): void {}
      unobserve (): void {}
      disconnect (): void {}
    }
    try {
      const frames: FrameRequestCallback[] = []
      const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => frames.push(cb))
      const { textarea } = mount({ placeholder: description })
      let width = 100
      let height = 40
      Object.defineProperty(textarea, 'clientWidth', { get: () => width, configurable: true })
      Object.defineProperty(textarea, 'scrollHeight', { get: () => height, configurable: true })
      callbacks[0]()
      expect(frames).toHaveLength(1)
      expect(textarea.style.height).not.toBe('40px')
      frames.shift()?.(0)
      expect(textarea.style.height).toBe('40px')
      height = 90
      callbacks[0]()
      expect(frames).toHaveLength(0)
      width = 120
      callbacks[0]()
      frames.shift()?.(0)
      expect(textarea.style.height).toBe('90px')
      raf.mockRestore()
    } finally {
      ;(globalThis as any).ResizeObserver = original
    }
  })
})
