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
import Header from '../components/Header.svelte'
import { deviceOptionsStore } from '../index'
import { modalStore } from '../modals'

let target: HTMLElement

function mount (props: Partial<ComponentProps<Header>> = {}): {
  host: HTMLElement
  component: Header
  container: HTMLElement
} {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new Header({ target: host, props: props as ComponentProps<Header> })
  return { host, component, container: host.querySelector('.hulyHeader-container') as HTMLElement }
}

describe('Header', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
    modalStore.set([])
  })

  afterEach(() => {
    target.remove()
  })

  it('carries topIndent, hideSeparator and no-print straight from props', () => {
    const { container } = mount({ topIndent: true, hideSeparator: true, noPrint: true })
    expect(container.classList.contains('topIndent')).toBe(true)
    expect(container.classList.contains('hideSeparator')).toBe(true)
    expect(container.classList.contains('no-print')).toBe(true)
  })

  it('is single-row for the default and disabled adaptive modes, double-row for doubleRow', () => {
    expect(mount({ adaptive: 'default' }).container.classList.contains('doubleRow')).toBe(false)
    expect(mount({ adaptive: 'disabled' }).container.classList.contains('doubleRow')).toBe(false)
    expect(mount({ adaptive: 'doubleRow' }).container.classList.contains('doubleRow')).toBe(true)
  })

  it('renders no close button and no Esc hint for type-component', () => {
    const { container } = mount({ type: 'type-component' })
    expect(container.querySelector('.hulyHotKey-item')).toBeNull()
    expect(container.querySelectorAll('button').length).toBe(0)
  })

  it('renders the close button and Esc hint for type-popup and type-aside', () => {
    for (const type of ['type-popup', 'type-aside'] as const) {
      const { container } = mount({ type })
      expect(container.querySelector('.hulyHotKey-item')).not.toBeNull()
      expect(container.querySelectorAll('button').length).toBe(1)
    }
  })

  it('dispatches close on Escape for a closeable type, and clicking the close button', async () => {
    const { component, container } = mount({ type: 'type-popup' })
    const onClose = vi.fn()
    component.$on('close', onClose)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(onClose).toHaveBeenCalledTimes(1)

    const closeButton = container.querySelector('button') as HTMLButtonElement
    closeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('does not dispatch close on Escape for a non-closeable type', () => {
    const { component } = mount({ type: 'type-component' })
    const onClose = vi.fn()
    component.$on('close', onClose)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('does not dispatch close on Escape when closeOnEscape is false', () => {
    const { component } = mount({ type: 'type-popup', closeOnEscape: false })
    const onClose = vi.fn()
    component.$on('close', onClose)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(onClose).not.toHaveBeenCalled()
    // No hotkey hint either, since it is only shown when closeOnEscape is true.
    expect(document.querySelector('.hulyHotKey-item')).toBeNull()
  })

  it('suppresses Escape-close for type-aside while a popup is open', () => {
    const { component } = mount({ type: 'type-aside' })
    const onClose = vi.fn()
    component.$on('close', onClose)

    modalStore.set([
      {
        type: 'popup',
        id: 'p1',
        is: {} as any,
        props: {},
        close: () => {},
        options: { category: 'popup', overlay: true }
      }
    ])
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(onClose).not.toHaveBeenCalled()

    modalStore.set([])
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('toggles deviceOptionsStore.navigator.visible when the fullsize button is clicked', () => {
    deviceOptionsStore.update((d) => ({ ...d, navigator: { ...d.navigator, visible: false } }))
    const { container } = mount({ allowFullsize: true })
    const fullsizeButton = container.querySelector('button') as HTMLButtonElement
    expect(fullsizeButton).not.toBeNull()

    fullsizeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    let visible = false
    deviceOptionsStore.subscribe((d) => {
      visible = d.navigator.visible
    })()
    expect(visible).toBe(true)
  })

  it('dispatches resize with the current headerProps after an update', async () => {
    const { component } = mount()
    const onResize = vi.fn()
    component.$on('resize', onResize)

    component.$set({ hideActions: true })
    await tick()
    expect(onResize).toHaveBeenLastCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({ headerWidth: undefined, extraWidth: 0, spaceWidth: 0, titleWidth: 0 })
      })
    )
  })
})
