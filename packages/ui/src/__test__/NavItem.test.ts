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
import type { Asset } from '@hcengineering/platform'
import NavItem from '../components/NavItem.svelte'
import { getTreeCollapsed, setTreeCollapsed } from '../location'

const ICON = 'ui:icon:Check' as Asset

let target: HTMLElement

function mount (props: Record<string, unknown> = {}): { host: HTMLElement, button: HTMLButtonElement, component: NavItem } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new NavItem({ target: host, props })
  return { host, button: host.querySelector('button.hulyNavItem-container') as HTMLButtonElement, component }
}

describe('NavItem', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
    localStorage.clear()
  })

  afterEach(() => {
    target.remove()
  })

  it('carries selected, bold, indent, disabled and pressed in the class list', () => {
    const { button } = mount({ selected: true, bold: true, indent: true, disabled: true, pressed: true })
    for (const cls of ['selected', 'bold', 'indent', 'disabled', 'pressed']) {
      expect(button.classList.contains(cls)).toBe(true)
    }
  })

  it('picks the type class and its matching font size class', () => {
    expect(mount({ type: 'type-link' }).button.classList.contains('font-regular-14')).toBe(true)
    const anchor = mount({ type: 'type-anchor-link' }).button
    expect(anchor.classList.contains('type-anchor-link')).toBe(true)
    expect(anchor.classList.contains('font-regular-12')).toBe(true)
  })

  it('renders the count only when it is not null', () => {
    expect(mount({ count: 5 }).button.querySelector('.hulyNavItem-count')?.textContent?.trim()).toBe('5')
    expect(mount({ count: null }).button.querySelector('.hulyNavItem-count')).toBeNull()
    expect(mount({ count: 0 }).button.querySelector('.hulyNavItem-count')?.textContent?.trim()).toBe('0')
  })

  it('renders a coloured tag square for type-tag, an Icon otherwise', () => {
    const tag = mount({ type: 'type-tag', color: 'rgb(1, 2, 3)' })
    const square = tag.button.querySelector('.hulyNavItem-icon__tag') as HTMLElement
    expect(square).not.toBeNull()
    expect(square.style.backgroundColor).toBe('rgb(1, 2, 3)')

    const withIcon = mount({ icon: ICON })
    expect(withIcon.button.querySelector('.hulyNavItem-icon svg')).not.toBeNull()

    expect(mount({}).button.querySelector('.hulyNavItem-icon')).toBeNull()
  })

  it('shows the actions slot area only when showMenu is true (no actions slot is ever passed here)', () => {
    expect(mount({ showMenu: true }).button.querySelector('.hulyNavItem-actions')).not.toBeNull()
    expect(mount({ showMenu: false }).button.querySelector('.hulyNavItem-actions')).toBeNull()
  })

  it('forwards dragstart to a listener without handling it itself', () => {
    const { button, component } = mount({ draggable: true })
    const onDragStart = vi.fn()
    component.$on('dragstart', onDragStart)
    button.dispatchEvent(new Event('dragstart', { bubbles: true }))
    expect(onDragStart).toHaveBeenCalledTimes(1)
  })

  // isOpen is driven by getTreeCollapsed(_id)/setTreeCollapsed(_id), not by the isOpen prop directly -
  // the reactive `$: isOpen = !getTreeCollapsed(_id, collapsedPrefix)` overrides whatever is passed in.
  it('derives the fold state from persisted collapsed state for the given _id', () => {
    setTreeCollapsed('nav-1', true, 'pfx')
    const { button } = mount({ isFold: true, _id: 'nav-1', collapsedPrefix: 'pfx' })
    const chevron = button.querySelector('.hulyNavItem-chevron') as HTMLElement
    expect(chevron.classList.contains('isOpen')).toBe(false)

    setTreeCollapsed('nav-2', false, 'pfx')
    const open = mount({ isFold: true, _id: 'nav-2', collapsedPrefix: 'pfx' })
    expect((open.button.querySelector('.hulyNavItem-chevron') as HTMLElement).classList.contains('isOpen')).toBe(true)
  })

  it('clicking the chevron toggles isOpen and persists it for the _id', async () => {
    setTreeCollapsed('nav-3', false)
    const { button } = mount({ isFold: true, _id: 'nav-3' })
    const chevron = button.querySelector('.hulyNavItem-chevron') as HTMLButtonElement
    expect(chevron.classList.contains('isOpen')).toBe(true)

    chevron.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await tick()
    expect(chevron.classList.contains('isOpen')).toBe(false)
    expect(getTreeCollapsed('nav-3')).toBe(true)
  })

  it('clicking the row toggles isOpen too, but only when selected and foldable', async () => {
    setTreeCollapsed('nav-4', false)
    const { button } = mount({ isFold: true, selected: true, _id: 'nav-4' })
    const chevron = button.querySelector('.hulyNavItem-chevron') as HTMLElement
    expect(chevron.classList.contains('isOpen')).toBe(true)

    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await tick()
    expect(chevron.classList.contains('isOpen')).toBe(false)
  })

  it('does not render a chevron icon or dropbox for an empty, foldable item', () => {
    const { button } = mount({ isFold: true, empty: true, _id: 'nav-5' })
    const chevron = button.querySelector('.hulyNavItem-chevron') as HTMLButtonElement
    expect(chevron.disabled).toBe(true)
    expect(chevron.querySelector('svg')).toBeNull()
    expect(target.querySelector('.hulyNavItem-dropbox')).toBeNull()
  })

  it('forciblyСollapsed renders the dropbox even when closed and not marked visible', () => {
    setTreeCollapsed('nav-6', true)
    const { host } = mount({ isFold: true, _id: 'nav-6', forciblyСollapsed: true })
    expect(host.querySelector('.hulyNavItem-dropbox')).not.toBeNull()
  })

  // jsdom's getBoundingClientRect is always zero, so the first mouseover always measures a 0-width
  // label; with level > 0 that flips levelReset, which zeroes the chevron's indent margin.
  it('zeroes the chevron indent on first mouseover, a jsdom-width artifact', async () => {
    const { button } = mount({ isFold: true, level: 2 })
    const chevron = button.querySelector('.hulyNavItem-chevron') as HTMLElement
    expect(chevron.style.marginLeft).toBe('2.5rem')

    button.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    await tick()
    expect(chevron.style.marginLeft).toBe('0rem')
  })
})
