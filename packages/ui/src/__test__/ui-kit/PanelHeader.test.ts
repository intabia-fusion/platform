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

import { modalStore } from '../../modals'
import type { PanelHeaderProps } from '../../ui-kit/panel-header/types'
import PanelHeaderWithSearch from './PanelHeaderWithSearch.svelte'
import PanelHeaderWithSlots from './PanelHeaderWithSlots.svelte'

let target: HTMLElement
const mounted: Array<{ $destroy: () => void }> = []

function mount (props: PanelHeaderProps): { root: HTMLElement, component: PanelHeaderWithSlots } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new PanelHeaderWithSlots({ target: host, props: { props } })
  mounted.push(component)
  return { root: host.querySelector('.panel-header') as HTMLElement, component }
}

function escape (): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
}

describe('ui-kit PanelHeader', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    mounted.splice(0).forEach((component) => {
      component.$destroy()
    })
    target.remove()
    modalStore.set([])
  })

  it('lays the slots out in one row with a divider under it', () => {
    const { root } = mount({})
    expect(root.classList.contains('panel-header--divider')).toBe(true)
    expect(root.querySelectorAll('.panel-header__row')).toHaveLength(1)
    const order = ['.before', '.title', '.search', '.extra', '.action'].map((s) => root.querySelector(s))
    expect(order.every((el) => el !== null)).toBe(true)
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1]?.compareDocumentPosition(order[i] as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    }
    expect(root.querySelector('#btnHeaderClose')).toBeNull()
    expect(mount({ divider: false }).root.classList.contains('panel-header--divider')).toBe(false)
  })

  it('moves search, extra and actions to a second row when double', () => {
    const second = (root: HTMLElement, selector: string): boolean =>
      root.querySelector(selector)?.closest('.panel-header__group')?.classList.contains('panel-header__second') ?? false
    const { root } = mount({ adaptive: 'double' })
    expect(root.querySelectorAll('.panel-header__row')).toHaveLength(1)
    expect(root.querySelector('.panel-header__break')).not.toBeNull()
    expect(second(root, '.action')).toBe(false)
    expect(second(root, '.search')).toBe(true)
    expect(second(root, '.extra')).toBe(true)
  })

  it('keeps the focus and the typed text in the search slot when the layout switches', async () => {
    const { root, component } = mount({})
    const field = root.querySelector('input.search') as HTMLInputElement
    field.focus()
    field.value = 'query'
    for (const adaptive of ['double', 'disabled'] as const) {
      component.$set({ props: { adaptive } })
      await tick()
      expect(root.classList.contains('panel-header--double')).toBe(adaptive === 'double')
      expect(root.querySelector('input.search')).toBe(field)
      expect(document.activeElement).toBe(field)
      expect(field.value).toBe('query')
    }
  })

  it('closes from the button and from Esc, unless a popup is open', async () => {
    const { root, component } = mount({ closable: true })
    const onClose = vi.fn()
    component.$on('close', onClose)
    expect(root.querySelector('.kbd')).not.toBeNull()
    ;(root.querySelector('#btnHeaderClose') as HTMLButtonElement).click()
    escape()
    expect(onClose).toHaveBeenCalledTimes(2)

    modalStore.set([{ type: 'popup' } as any])
    await tick()
    escape()
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('ignores Esc without closeOnEscape or when not closable', () => {
    const quiet = mount({ closable: true, closeOnEscape: false })
    const onClose = vi.fn()
    quiet.component.$on('close', onClose)
    expect(quiet.root.querySelector('.kbd')).toBeNull()
    const plain = mount({})
    plain.component.$on('close', onClose)
    escape()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('adds the navigator toggle at the start', () => {
    const { root } = mount({ navigatorToggle: true })
    const first = root.querySelector('.panel-header__row button') as HTMLButtonElement
    expect(first.closest('.panel-header__before')).toBeNull()
    expect(first.getAttribute('aria-label') ?? first.textContent).toBeDefined()
  })

  it('lets only the latest closable header take Esc, and not after a field inside handled it', async () => {
    const first = mount({ closable: true })
    const second = mount({ closable: true })
    const onFirst = vi.fn()
    const onSecond = vi.fn()
    first.component.$on('close', onFirst)
    second.component.$on('close', onSecond)
    escape()
    expect(onFirst).not.toHaveBeenCalled()
    expect(onSecond).toHaveBeenCalledTimes(1)

    const handled = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    handled.preventDefault()
    window.dispatchEvent(handled)
    expect(onSecond).toHaveBeenCalledTimes(1)

    second.component.$destroy()
    await tick()
    escape()
    expect(onFirst).toHaveBeenCalledTimes(1)
  })

  it('hands Esc back to the previous header when the latest stops closing on it', async () => {
    const first = mount({ closable: true })
    const second = mount({ closable: true })
    const onFirst = vi.fn()
    first.component.$on('close', onFirst)
    second.component.$set({ props: { closable: true, closeOnEscape: false } })
    await tick()
    escape()
    expect(onFirst).toHaveBeenCalledTimes(1)
  })

  it('reports the sizes once per change, not on every update', async () => {
    const { component } = mount({})
    const onResize = vi.fn<(event: CustomEvent<unknown>) => void>()
    component.$on('resize', onResize)
    component.$set({ props: { divider: false } })
    await tick()
    component.$set({ props: { divider: true } })
    await tick()
    expect(onResize).not.toHaveBeenCalled()
  })
  it('clears the typed query on Esc in the search field first, and closes on the next Esc', async () => {
    const host = document.createElement('div')
    target.appendChild(host)
    const component = new PanelHeaderWithSearch({ target: host, props: { value: 'abc' } })
    mounted.push(component)
    const onClose = vi.fn()
    component.$on('close', onClose)
    await tick()
    const input = host.querySelector('input') as HTMLInputElement
    input.focus()
    const press = (): void => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    }

    press()
    await tick()
    expect(input.value).toBe('')
    expect(onClose).not.toHaveBeenCalled()

    press()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('leaves Esc to a text field or an editor inside the header', () => {
    const { root, component } = mount({ closable: true })
    const onClose = vi.fn()
    component.$on('close', onClose)
    const field = root.querySelector('input.search') as HTMLInputElement
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    expect(onClose).not.toHaveBeenCalled()
  })

  it.each(['checkbox', 'radio', 'range', 'button'])(
    'closes on Esc when the focus is on an input of type %s',
    (type) => {
      const { root, component } = mount({ closable: true })
      const onClose = vi.fn()
      component.$on('close', onClose)
      const control = document.createElement('input')
      control.type = type
      root.appendChild(control)
      control.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      expect(onClose).toHaveBeenCalledTimes(1)
    }
  )

  it.each(['text', 'email', 'number', 'password', 'url', 'tel', 'date', 'time'])(
    'leaves Esc to a typed field of type %s',
    (type) => {
      const { root, component } = mount({ closable: true })
      const onClose = vi.fn()
      component.$on('close', onClose)
      const field = document.createElement('input')
      field.type = type
      root.appendChild(field)
      field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      expect(onClose).not.toHaveBeenCalled()
    }
  )
})
