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
import type { Asset, IntlString } from '@hcengineering/platform'
import ButtonBase from '../components/ButtonBase.svelte'

const ICON = 'ui:icon:Check' as Asset
const BASE = { kind: 'primary' as const, size: 'medium' as const, type: 'type-button' as const }

let target: HTMLElement

function mount (props: Record<string, unknown> = BASE): { button: HTMLButtonElement, component: ButtonBase } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new ButtonBase({ target: host, props })
  return { button: host.querySelector('button') as HTMLButtonElement, component }
}

describe('ButtonBase', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('carries kind, size, type and shape in the class list, defaulting shape to rectangle', () => {
    const { button } = mount(BASE)
    expect(button.classList.contains('primary')).toBe(true)
    expect(button.classList.contains('medium')).toBe(true)
    expect(button.classList.contains('type-button')).toBe(true)
    expect(button.classList.contains('rectangle')).toBe(true)
  })

  it('carries the round shape class when asked', () => {
    const { button } = mount({ ...BASE, shape: 'round' })
    expect(button.classList.contains('round')).toBe(true)
  })

  it('shows a spinner and disables the button while loading, hiding the icon', async () => {
    const { button, component } = mount({ ...BASE, icon: ICON, loading: true })
    expect(button.disabled).toBe(true)
    expect(button.querySelector('.spinner')).not.toBeNull()
    expect(button.querySelector('svg.svg-medium')).toBeNull()

    component.$set({ loading: false })
    await tick()
    expect(button.disabled).toBe(false)
    expect(button.querySelector('.spinner')).toBeNull()
    expect(button.querySelector('svg.svg-medium')).not.toBeNull()
  })

  it('stays disabled via the disabled prop, without a loading class', () => {
    const { button } = mount({ ...BASE, disabled: true })
    expect(button.disabled).toBe(true)
    expect(button.classList.contains('loading')).toBe(false)
  })

  it('carries the menu class when hasMenu is set', () => {
    const { button } = mount({ ...BASE, hasMenu: true })
    expect(button.classList.contains('menu')).toBe(true)
  })

  it('is icon-only only when icon is set with no title, label or default slot', async () => {
    const { button, component } = mount({ ...BASE, icon: ICON })
    expect(button.classList.contains('iconOnly')).toBe(true)

    component.$set({ label: 'ui:string:Ok' as IntlString })
    await tick()
    expect(button.classList.contains('iconOnly')).toBe(false)
  })

  it('dispatches click, stops propagation and prevents default', () => {
    const { button, component } = mount(BASE)
    const onClick = vi.fn()
    const onParent = vi.fn()
    component.$on('click', onClick)
    target.addEventListener('click', onParent)

    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    button.dispatchEvent(event)
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(onParent).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(true)
  })

  it('forwards keydown', () => {
    const { button, component } = mount(BASE)
    const onKeydown = vi.fn()
    component.$on('keydown', onKeydown)
    button.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }))
    expect(onKeydown).toHaveBeenCalledTimes(1)
  })

  it('focuses itself on mount when autoFocus is set', () => {
    const { button } = mount({ ...BASE, autoFocus: true })
    expect(document.activeElement).toBe(button)
  })

  it('exposes a focus() method that focuses the button', () => {
    const { button, component } = mount(BASE)
    expect(document.activeElement).not.toBe(button)
    component.focus()
    expect(document.activeElement).toBe(button)
  })

  it('passes id and dataId through', () => {
    const { button } = mount({ ...BASE, id: 'b1', dataId: 'd1' })
    expect(button.id).toBe('b1')
    expect(button.dataset.id).toBe('d1')
  })
})
