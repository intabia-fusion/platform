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
import type { ButtonItem } from '../types'
import type { ComponentProps } from 'svelte'
import Panel from '../components/Panel.svelte'

let target: HTMLElement

function mount (props: Partial<ComponentProps<Panel>> = {}): { host: HTMLElement, component: Panel } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new Panel({ target: host, props: props as ComponentProps<Panel> })
  return { host, component }
}

describe('Panel', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('shows the close button by default and dispatches close on click', () => {
    const { host, component } = mount()
    const onClose = vi.fn()
    component.$on('close', onClose)

    const closeBtn = host.querySelector('#btnPClose') as HTMLButtonElement
    expect(closeBtn).not.toBeNull()
    closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('hides the close button when allowClose is false', () => {
    const { host } = mount({ allowClose: false })
    expect(host.querySelector('#btnPClose')).toBeNull()
  })

  it('applies the embedded class from the embedded prop', () => {
    expect(mount({ embedded: true }).host.querySelector('.panel')?.classList.contains('embedded')).toBe(true)
    expect(mount({ embedded: false }).host.querySelector('.panel')?.classList.contains('embedded')).toBe(false)
  })

  it('renders the useMaxWidth toggle only when the prop is set, and toggles + dispatches on click', async () => {
    expect(mount().host.querySelector('#btnPClose')).not.toBeNull()
    const absent = mount({ useMaxWidth: undefined })
    // No max-width toggle button rendered at all: only the close button is present.
    expect(absent.host.querySelectorAll('button.antiButton').length).toBe(1)

    const { host, component } = mount({ useMaxWidth: false })
    const onMaxWidth = vi.fn()
    component.$on('maxWidth', onMaxWidth)
    const buttons = host.querySelectorAll('button.antiButton')
    const toggle = buttons[buttons.length - 1] as HTMLButtonElement
    expect(toggle.classList.contains('selected')).toBe(false)

    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await tick()
    expect(onMaxWidth).toHaveBeenLastCalledWith(expect.objectContaining({ detail: true }))
    expect(toggle.classList.contains('selected')).toBe(true)
  })

  it('renders the fullsize toggle only when isFullSize is true, and toggles + dispatches fullsize', async () => {
    expect(mount({ isFullSize: false }).host.querySelectorAll('button.antiButton').length).toBe(1)

    const { host, component } = mount({ isFullSize: true })
    const onFullsize = vi.fn()
    component.$on('fullsize', onFullsize)
    const buttons = host.querySelectorAll('button.antiButton')
    const toggle = buttons[buttons.length - 1] as HTMLButtonElement
    expect(toggle.classList.contains('selected')).toBe(false)

    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await tick()
    expect(onFullsize).toHaveBeenCalledTimes(1)
    expect(toggle.classList.contains('selected')).toBe(true)
  })

  // floatAside:true is required here: on every mount Panel re-derives panelWidth from the (always-0 in
  // jsdom) element width and, when not floating, that immediately collapses asideShown to false.
  it('setAside(false) hides the aside and getAside reflects it, without a customAside', () => {
    const { component } = mount({ floatAside: true })
    expect(component.getAside()).toBe(true)
    component.setAside(false)
    expect(component.getAside()).toBe(false)
    component.setAside(true)
    expect(component.getAside()).toBe(true)
  })

  it('setAside with a customAside id dispatches select and updates getAside', () => {
    const customAside: ButtonItem[] = [{ id: 'first' }, { id: 'second' }]
    const { component } = mount({ customAside, floatAside: true })
    const onSelect = vi.fn()
    component.$on('select', onSelect)

    expect(component.getAside()).toBe('first')
    component.setAside('second')
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ detail: 'second' }))
    expect(component.getAside()).toBe('second')

    // An id that isn't in customAside is a no-op: current selection and no new dispatch.
    component.setAside('missing')
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(component.getAside()).toBe('second')
  })

  // jsdom reports 0 for every clientWidth, and Panel re-derives panelWidth from the mounted element on
  // every update - so panelWidth always settles to 0 regardless of what a caller passes in as a prop.
  it('dispatches resize with panelWidth pinned to 0 (jsdom has no layout) and the given innerWidth', async () => {
    const { component } = mount({ panelWidth: 800, innerWidth: 10 })
    const onResize = vi.fn()
    component.$on('resize', onResize)

    component.$set({ innerWidth: 555 })
    await tick()
    expect(onResize).toHaveBeenLastCalledWith(
      expect.objectContaining({ detail: expect.objectContaining({ panelWidth: 0, innerWidth: 555 }) })
    )
  })
})
