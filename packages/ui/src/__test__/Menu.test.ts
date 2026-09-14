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
import { get } from 'svelte/store'
import type { Asset, IntlString } from '@hcengineering/platform'
import type { Ref, Doc } from '@hcengineering/core'
import type { ComponentProps } from 'svelte'
import Menu from '../components/Menu.svelte'
import type { Action } from '../types'
import { modalStore } from '../modals'
import { popupstore } from '../popups'

const ICON = 'ui:icon:Check' as Asset
const LABEL = 'ui:string:Ok' as IntlString

// Never actually rendered by Menu itself - only stashed into the popup store as `is`.
const FakeSubmenu = {}

function action (overrides: Partial<Action> = {}): Action {
  return {
    label: LABEL,
    icon: ICON,
    action: vi.fn(async () => {}),
    ...overrides
  }
}

let target: HTMLElement

interface Mounted {
  component: Menu
  host: HTMLElement
  buttons: HTMLButtonElement[]
}

function mount (props: Partial<ComponentProps<Menu>> = {}): Mounted {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new Menu({ target: host, props: props as ComponentProps<Menu> })
  return { component, host, buttons: Array.from(host.querySelectorAll('button')) }
}

describe('Menu', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
    modalStore.set([])
  })

  afterEach(() => {
    target.remove()
    modalStore.set([])
  })

  it('shows the empty placeholder and no buttons when there are no actions', () => {
    const { host, buttons } = mount({ actions: [] })
    expect(buttons.length).toBe(0)
    expect(host.querySelector('.error-color')).not.toBeNull()
  })

  it('renders one button per action and focuses the first on mount', () => {
    const { buttons } = mount({ actions: [action({ label: LABEL }), action({ label: LABEL })] })
    expect(buttons.length).toBe(2)
    expect(document.activeElement).toBe(buttons[0])
  })

  it('runs the action and dispatches close on click', () => {
    const act = vi.fn(async () => {})
    const ctx = { foo: 'bar' }
    const { component, buttons } = mount({ actions: [action({ action: act })], ctx })
    const onClose = vi.fn()
    component.$on('close', onClose)

    buttons[0].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(act).toHaveBeenCalledWith(ctx, expect.any(Object))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not dispatch close for an inline action, but still runs it', () => {
    const act = vi.fn(async () => {})
    const { component, buttons } = mount({ actions: [action({ action: act, inline: true })] })
    const onClose = vi.fn()
    component.$on('close', onClose)

    buttons[0].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(act).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('wraps a link action in an anchor and still runs the action on click', () => {
    const act = vi.fn(async () => {})
    const { host, component, buttons } = mount({ actions: [action({ action: act, link: '/somewhere' })] })
    const anchor = host.querySelector('a.stealth')
    expect(anchor).not.toBeNull()
    expect(anchor?.getAttribute('href')).toBe('/somewhere')

    const onClose = vi.fn()
    component.$on('close', onClose)
    buttons[0].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(act).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('inserts a separator between actions from different groups', () => {
    const { host } = mount({
      actions: [action({ group: 'a' }), action({ group: 'a' }), action({ group: 'b' })]
    })
    expect(host.querySelectorAll('.ap-menuItem.separator').length).toBe(1)
  })

  it('moves the hover highlight with ArrowDown and ArrowUp', async () => {
    const { host, buttons } = mount({ actions: [action(), action(), action()] })
    const box = host.querySelector('.antiPopup') as HTMLElement

    // First ArrowDown lands on the first button (activeElement starts unset, indexOf gives -1).
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
    await tick()
    expect(buttons[0].classList.contains('hover')).toBe(true)

    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
    await tick()
    expect(buttons[0].classList.contains('hover')).toBe(false)
    expect(buttons[1].classList.contains('hover')).toBe(true)

    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }))
    await tick()
    expect(buttons[0].classList.contains('hover')).toBe(true)
    expect(buttons[1].classList.contains('hover')).toBe(false)
  })

  // focusTarget only opens a submenu when MouseSpeedTracker's focusSpeed is true, which it never
  // is in jsdom (no real mousemove ever fires) - pinned behaviour, not a desired one.
  it('does not open a submenu on click alone, since focus speed is never tracked in jsdom', () => {
    mount({ actions: [action({ component: FakeSubmenu as any })] }).buttons[0].dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true })
    )
    expect(get(popupstore).length).toBe(0)
  })

  it('opens a submenu popup on ArrowRight and closes it again on ArrowLeft', async () => {
    const { host } = mount({
      actions: [action({ component: FakeSubmenu as any })],
      popupCategory: 'test-cat' as Ref<Doc>
    })
    const box = host.querySelector('.antiPopup') as HTMLElement

    // ArrowRight acts on activeElement, which ArrowDown must set first.
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))
    await tick()
    const popups = get(popupstore)
    expect(popups.length).toBe(1)
    expect(popups[0].is).toBe(FakeSubmenu)
    expect(popups[0].options.category).toBe('test-cat')

    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }))
    await tick()
    expect(get(popupstore).length).toBe(0)
  })

  it('opens the submenu on right-click when isSubmenuRightClicking is set', async () => {
    const { host, buttons } = mount({
      actions: [action({ component: FakeSubmenu as any, isSubmenuRightClicking: true })]
    })
    buttons[0].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
    await tick()
    expect(get(popupstore).length).toBe(1)
    void host
  })

  it('closes any popup opened under its own category on destroy', async () => {
    const { host, component } = mount({
      actions: [action({ component: FakeSubmenu as any })],
      popupCategory: 'own-cat' as Ref<Doc>
    })
    const box = host.querySelector('.antiPopup') as HTMLElement
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))
    await tick()
    expect(get(popupstore).length).toBe(1)

    component.$destroy()
    expect(get(popupstore).length).toBe(0)
  })
})
