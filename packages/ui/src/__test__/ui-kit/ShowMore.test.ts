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
import { addStringsLoader, type Plugin } from '@hcengineering/platform'
import { tick } from 'svelte'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ShowMoreProps } from '../../ui-kit/show-more/types'
import ShowMoreWithContent from './ShowMoreWithContent.svelte'

type ResizeCallback = (entries: Array<{ target: Element }>) => void
const callbacks: ResizeCallback[] = []

// The shared stub never fires; this one lets a test report the content height the browser would measure.
beforeAll(() => {
  addStringsLoader('ui' as Plugin, async () => ({ string: { ShowMore: 'Show more', ShowLess: 'Show less' } }))
  ;(globalThis as any).ResizeObserver = class {
    constructor (callback: ResizeCallback) {
      callbacks.push(callback)
    }

    observe (): void {}
    unobserve (): void {}
    disconnect (): void {}
  }
})

let target: HTMLElement
const mounted: Array<{ $destroy: () => void }> = []

async function mount (
  props: ShowMoreProps,
  height: number
): Promise<{ root: HTMLElement, component: ShowMoreWithContent }> {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new ShowMoreWithContent({ target: host, props: { props } })
  mounted.push(component)
  const content = host.querySelector('.show-more__content') as HTMLElement
  Object.defineProperty(content, 'clientHeight', { configurable: true, value: height })
  const entries = [{ target: content }]
  callbacks.forEach((callback) => {
    callback(entries)
  })
  await new Promise((resolve) => setTimeout(resolve, 60))
  await tick()
  return { root: host.querySelector('.show-more') as HTMLElement, component }
}

function viewport (root: HTMLElement): HTMLElement {
  return root.querySelector('.show-more__viewport') as HTMLElement
}

describe('ui-kit ShowMore', () => {
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

  it('leaves content within the limit as is', async () => {
    const { root } = await mount({}, 200)
    expect(viewport(root).classList.contains('show-more__viewport--cropped')).toBe(false)
    expect(root.querySelector('button')).toBeNull()
  })

  it('crops taller content to the limit and toggles it with a button', async () => {
    const { root, component } = await mount({ limit: 100 }, 300)
    const onToggle = vi.fn<(event: CustomEvent<boolean>) => void>()
    component.$on('toggle', onToggle)
    const button = root.querySelector('button') as HTMLButtonElement

    expect(viewport(root).classList.contains('show-more__viewport--cropped')).toBe(true)
    expect(viewport(root).style.maxHeight).toBe('100px')
    expect(button.type).toBe('button')
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(button.getAttribute('aria-controls')).toBe(viewport(root).id)
    await vi.waitFor(() => {
      expect(button.textContent?.trim()).toBe('Show more')
    })

    button.click()
    await tick()
    expect(viewport(root).classList.contains('show-more__viewport--cropped')).toBe(false)
    expect(viewport(root).style.maxHeight).toBe('')
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(onToggle.mock.calls.map(([event]) => event.detail)).toEqual([true])
    await vi.waitFor(() => {
      expect(button.textContent?.trim()).toBe('Show less')
    })
  })

  it('crops without a button when not expandable', async () => {
    const { root } = await mount({ limit: 100, expandable: false }, 300)
    expect(viewport(root).classList.contains('show-more__viewport--cropped')).toBe(true)
    expect(root.querySelector('button')).toBeNull()
  })

  // Documented in ShowMoreProps: the crop is not inert, so a non-expandable ShowMore holds text only.
  it('leaves a non-expandable crop focusable, since nothing can open it', async () => {
    const { root } = await mount({ limit: 100, expandable: false }, 300)
    expect(viewport(root).hasAttribute('inert')).toBe(false)
  })

  it('shows everything when disabled', async () => {
    const { root } = await mount({ limit: 100, disabled: true }, 300)
    expect(viewport(root).classList.contains('show-more__viewport--cropped')).toBe(false)
    expect(root.querySelector('button')).toBeNull()
  })

  it('measures on mount, before the observer reports', async () => {
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get (this: HTMLElement) {
        return this.classList.contains('show-more__content') ? 300 : 0
      }
    })
    try {
      const host = document.createElement('div')
      target.appendChild(host)
      mounted.push(new ShowMoreWithContent({ target: host, props: { props: { limit: 100 } } }))
      await tick()
      expect(host.querySelector('.show-more__viewport--cropped')).not.toBeNull()
    } finally {
      if (original !== undefined) Object.defineProperty(HTMLElement.prototype, 'clientHeight', original)
    }
  })

  it('follows open set by the place, but keeps a non-expandable crop', async () => {
    const { root, component } = await mount({ limit: 100 }, 300)
    component.$set({ props: { limit: 100, open: true } })
    await tick()
    expect(viewport(root).classList.contains('show-more__viewport--cropped')).toBe(false)
    component.$set({ props: { limit: 100, open: true, expandable: false } })
    await tick()
    expect(viewport(root).classList.contains('show-more__viewport--cropped')).toBe(true)
  })

  it('opens when focus moves below the crop, not when it stays above', async () => {
    const { root, component } = await mount({ limit: 100 }, 300)
    const onToggle = vi.fn<(event: CustomEvent<boolean>) => void>()
    component.$on('toggle', onToggle)
    const view = viewport(root)
    view.getBoundingClientRect = () => ({ top: 0, bottom: 100 }) as unknown as DOMRect
    const above = document.createElement('a')
    above.getBoundingClientRect = () => ({ top: 10, bottom: 30 }) as unknown as DOMRect
    const below = document.createElement('a')
    below.getBoundingClientRect = () => ({ top: 150, bottom: 170 }) as unknown as DOMRect
    view.querySelector('.show-more__content')?.append(above, below)

    above.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    await tick()
    expect(onToggle).not.toHaveBeenCalled()
    below.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    await tick()
    expect(view.classList.contains('show-more__viewport--cropped')).toBe(false)
    expect(onToggle.mock.calls.map(([event]) => event.detail)).toEqual([true])
    below.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    await tick()
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('does not open a non-expandable crop on focus', async () => {
    const { root } = await mount({ limit: 100, expandable: false }, 300)
    const view = viewport(root)
    view.getBoundingClientRect = () => ({ top: 0, bottom: 100 }) as unknown as DOMRect
    const below = document.createElement('a')
    below.getBoundingClientRect = () => ({ top: 150, bottom: 170 }) as unknown as DOMRect
    view.querySelector('.show-more__content')?.append(below)
    below.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    await tick()
    expect(view.classList.contains('show-more__viewport--cropped')).toBe(true)
  })

  it('keeps the button click inside, so a clickable message around does not open', async () => {
    const { root } = await mount({ limit: 100 }, 300)
    const onOuterClick = vi.fn()
    target.addEventListener('click', onOuterClick)
    const button = root.querySelector('button') as HTMLButtonElement
    button.click()
    target.removeEventListener('click', onOuterClick)
    expect(onOuterClick).not.toHaveBeenCalled()
    await tick()
    expect(button.getAttribute('aria-expanded')).toBe('true')
  })

  it('reserves room under the content for the button only while open', async () => {
    const { root, component } = await mount({ limit: 100 }, 300)
    expect(root.classList.contains('show-more--open')).toBe(false)
    ;(root.querySelector('button') as HTMLButtonElement).click()
    await tick()
    expect(root.classList.contains('show-more--open')).toBe(true)
    ;(root.querySelector('button') as HTMLButtonElement).click()
    await tick()
    expect(root.classList.contains('show-more--open')).toBe(false)

    component.$set({ props: { limit: 100, open: true, expandable: false } })
    await tick()
    expect(root.classList.contains('show-more--open')).toBe(false)
  })

  it('reserves no room when open content fits the limit', async () => {
    const { root } = await mount({ limit: 100, open: true }, 80)
    expect(root.classList.contains('show-more--open')).toBe(false)
    expect(root.querySelector('button')).toBeNull()
  })

  it('drops the crop and the button when the content shrinks under the limit', async () => {
    const { root } = await mount({ limit: 100 }, 300)
    const content = root.querySelector('.show-more__content') as HTMLElement
    Object.defineProperty(content, 'clientHeight', { configurable: true, value: 80 })
    const entries = [{ target: content }]
    callbacks.forEach((callback) => {
      callback(entries)
    })
    await new Promise((resolve) => setTimeout(resolve, 60))
    await tick()
    expect(viewport(root).classList.contains('show-more__viewport--cropped')).toBe(false)
    expect(root.querySelector('button')).toBeNull()
  })
})
