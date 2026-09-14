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

import { get } from 'svelte/store'
import { tick } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Action } from '../types'
import NavGroup from '../components/NavGroup.svelte'
import { modalStore } from '../modals'
import { popupstore } from '../popups'
import { getCollapsedKey } from '../location'

const ACTIONS: Action[] = [
  { label: 'ui:string:Ok' as any, action: async () => {} }
]

let target: HTMLElement

function mount (props: Record<string, unknown>): { host: HTMLElement, header: HTMLButtonElement, label: HTMLElement, component: NavGroup } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new NavGroup({ target: host, props: { categoryName: 'cat', ...props } })
  return {
    host,
    header: host.querySelector('.hulyNavGroup-header') as HTMLButtonElement,
    label: host.querySelector('.hulyNavGroup-header__label') as HTMLElement,
    component
  }
}

describe('NavGroup', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
    localStorage.clear()
    modalStore.set([])
  })

  afterEach(() => {
    target.remove()
  })

  it('carries the nested/selectable class combinations for each type', () => {
    expect(mount({ type: 'default' }).host.querySelector('.hulyNavGroup-container')?.className).not.toContain('nested')
    const nested = mount({ type: 'nested' }).host.querySelector('.hulyNavGroup-container') as HTMLElement
    expect(nested.classList.contains('nested')).toBe(true)
    expect(nested.classList.contains('selectable')).toBe(false)

    const nestedSelectable = mount({ type: 'nested-selectable' }).host.querySelector('.hulyNavGroup-container') as HTMLElement
    expect(nestedSelectable.classList.contains('nested')).toBe(true)
    expect(nestedSelectable.classList.contains('selectable')).toBe(true)

    const selectableHeader = mount({ type: 'selectable-header' }).host.querySelector('.hulyNavGroup-container') as HTMLElement
    expect(selectableHeader.classList.contains('selectable')).toBe(true)
    expect(selectableHeader.classList.contains('selectableHeader')).toBe(true)
  })

  // isOpen is re-derived from defaultOpen/persisted state on every mount (`$: isOpen = isStored ? ... :
  // (defaultOpen ?? true)`), so the isOpen prop itself has no effect - defaultOpen is the real control.
  it('opens by default, and defaultOpen controls the initial isOpen class', () => {
    expect(mount({}).header.classList.contains('isOpen')).toBe(true)
    expect(mount({ defaultOpen: false }).header.classList.contains('isOpen')).toBe(false)
    expect(mount({ defaultOpen: true }).header.classList.contains('isOpen')).toBe(true)
  })

  it('the content block is not rendered at all when empty is true', () => {
    expect(mount({}).host.querySelector('.hulyNavGroup-content')).not.toBeNull()
    expect(mount({ empty: true }).host.querySelector('.hulyNavGroup-content')).toBeNull()
  })

  it('clicking the chevron toggles isOpen, dispatches toggle, and stops the click from reaching the header', async () => {
    const { host, header, component } = mount({ isFold: true, defaultOpen: true })
    const onToggle = vi.fn()
    component.$on('toggle', onToggle)
    const chevron = host.querySelector('.hulyNavGroup-header__chevron') as HTMLButtonElement
    expect(chevron.classList.contains('collapsed')).toBe(false)

    chevron.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await tick()
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onToggle).toHaveBeenLastCalledWith(expect.objectContaining({ detail: false }))
    expect(chevron.classList.contains('collapsed')).toBe(true)
    expect(header.classList.contains('isOpen')).toBe(false)
  })

  it('persists the toggled state to localStorage for a given _id', async () => {
    const { host } = mount({ isFold: true, defaultOpen: true, _id: 'grp-1' })
    const chevron = host.querySelector('.hulyNavGroup-header__chevron') as HTMLButtonElement
    chevron.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await tick()
    expect(localStorage.getItem(getCollapsedKey('grp-1'))).toBe('COLLAPSED')
  })

  it('clicking the label opens the actions menu when actions are present, and does not toggle', async () => {
    const { label, component } = mount({ actions: ACTIONS, defaultOpen: true })
    const onToggle = vi.fn()
    component.$on('toggle', onToggle)

    label.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await tick()
    expect(get(popupstore).length).toBe(1)
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('falls back to toggling the group when there are no actions to show a menu for', async () => {
    const { label, header, component } = mount({ actions: [], defaultOpen: true })
    const onToggle = vi.fn()
    component.$on('toggle', onToggle)

    label.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await tick()
    expect(get(popupstore).length).toBe(0)
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(header.classList.contains('isOpen')).toBe(false)
  })

  it('headerClickType "toggle" always toggles from the label, even with actions present', async () => {
    const { label, component } = mount({ actions: ACTIONS, headerClickType: 'toggle', defaultOpen: true })
    const onToggle = vi.fn()
    component.$on('toggle', onToggle)

    label.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await tick()
    expect(get(popupstore).length).toBe(0)
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('dispatches click instead of toggle for a selectable-header type', () => {
    const { header, component } = mount({ type: 'selectable-header' })
    const onClick = vi.fn()
    const onToggle = vi.fn()
    component.$on('click', onClick)
    component.$on('toggle', onToggle)

    header.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('nested-selectable dispatches click while unselected, and toggles once selected', () => {
    const unselected = mount({ type: 'nested-selectable', selected: false })
    const onClickU = vi.fn()
    unselected.component.$on('click', onClickU)
    unselected.header.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onClickU).toHaveBeenCalledTimes(1)

    const selected = mount({ type: 'nested-selectable', selected: true, defaultOpen: true })
    const onToggle = vi.fn()
    selected.component.$on('toggle', onToggle)
    selected.header.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('empty guards handleClick too: no toggle dispatched for a plain empty group', () => {
    const { header, component } = mount({ empty: true, defaultOpen: true })
    const onToggle = vi.fn()
    component.$on('toggle', onToggle)
    header.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onToggle).not.toHaveBeenCalled()
  })
})
