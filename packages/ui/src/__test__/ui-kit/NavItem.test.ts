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
import { getEmbeddedLabel, type Asset, type IntlString } from '@hcengineering/platform'
import { tick, type ComponentProps } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import NavItem from '../../ui-kit/nav-item/NavItem.svelte'
import type { NavItemProps } from '../../ui-kit/nav-item/types'
import NavItemWithSlots from './NavItemWithSlots.svelte'

const tooltipUpdate = vi.hoisted(() => vi.fn())
const tooltipUse = vi.hoisted(() => vi.fn(() => ({ update: tooltipUpdate, destroy: () => {} })))

vi.mock('../../tooltips', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  tooltip: tooltipUse
}))

const LABEL = getEmbeddedLabel('Documents')

let target: HTMLElement
const mounted: Array<{ $destroy: () => void }> = []

function mount (props: ComponentProps<NavItem>): { root: HTMLElement, hit: HTMLButtonElement, component: NavItem } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new NavItem({ target: host, props })
  mounted.push(component)
  const root = host.querySelector('.nav-item') as HTMLElement
  return { root, hit: root.querySelector('.nav-item__hit') as HTMLButtonElement, component }
}

function mountWithSlots (props: NavItemProps): { root: HTMLElement, component: NavItemWithSlots } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new NavItemWithSlots({ target: host, props: { props } })
  mounted.push(component)
  return { root: host.querySelector('.nav-item') as HTMLElement, component }
}

describe('ui-kit NavItem', () => {
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

  it('is one row button named by its label, the selected one is the current page', () => {
    const plain = mount({ label: LABEL })
    const label = plain.root.querySelector('.nav-item__label') as HTMLElement
    expect(plain.root.querySelectorAll('button')).toHaveLength(1)
    expect(plain.hit.getAttribute('aria-labelledby')).toBe(label.id)
    expect(plain.hit.hasAttribute('aria-current')).toBe(false)
    expect(plain.root.classList.contains('nav-item--link')).toBe(true)

    const selected = mount({ label: LABEL, selected: true })
    expect(selected.hit.getAttribute('aria-current')).toBe('page')
    expect(selected.root.classList.contains('nav-item--selected')).toBe(true)
  })

  it('shows the count, zero included, and reads it with the label', () => {
    expect(mount({ label: LABEL }).root.querySelector('.nav-item__count')).toBeNull()
    const { root, hit } = mount({ label: LABEL, count: 0 })
    const count = root.querySelector('.nav-item__count') as HTMLElement
    expect(count.textContent).toBe('0')
    expect(hit.getAttribute('aria-labelledby')?.split(' ')).toEqual([
      (root.querySelector('.nav-item__label') as HTMLElement).id,
      count.id
    ])
  })

  it('draws an icon, an object plate or a color marker', () => {
    const icon = 'ui:icon:Folder' as Asset
    expect(mount({ label: LABEL }).root.querySelector('.nav-item__icon')).toBeNull()
    expect(mount({ label: LABEL, icon }).root.querySelector('.nav-item__icon svg')).not.toBeNull()
    expect(mount({ label: LABEL, icon, kind: 'object' }).root.querySelector('.icon-box')).not.toBeNull()
    const tag = mount({ label: LABEL, color: 'rgb(255, 0, 0)', selected: true }).root
    expect((tag.querySelector('.nav-item__marker') as HTMLElement).style.backgroundColor).toBe('rgb(255, 0, 0)')
    expect((tag.querySelector('.nav-item__label') as HTMLElement).style.color).toBe('')
    expect(tag.classList.contains('nav-item--marker')).toBe(true)
  })

  it('forwards the click of the row', () => {
    const { hit, component } = mount({ label: LABEL })
    const onClick = vi.fn()
    component.$on('click', onClick)
    hit.click()
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('opens the children from the chevron, keeping actions outside the row button', async () => {
    const { root, component } = mountWithSlots({ label: LABEL, expandable: true })
    const onToggle = vi.fn<(event: CustomEvent<boolean>) => void>()
    component.$on('toggle', onToggle)
    const chevron = root.querySelector('.nav-item__chevron') as HTMLButtonElement
    expect(chevron.tagName).toBe('BUTTON')
    expect(chevron.getAttribute('aria-expanded')).toBe('false')
    expect(root.querySelector('.child')).toBeNull()

    chevron.click()
    await tick()
    expect(chevron.getAttribute('aria-expanded')).toBe('true')
    const group = root.querySelector('[role="group"]') as HTMLElement
    expect(group.id).toBe(chevron.getAttribute('aria-controls'))
    expect(group.querySelector('.child')).not.toBeNull()
    expect(onToggle.mock.calls.map(([event]) => event.detail)).toEqual([true])

    const action = root.querySelector('.action') as HTMLElement
    expect(action.closest('.nav-item__hit')).toBeNull()
    expect(action.closest('.nav-item__actions')).not.toBeNull()
    expect(root.querySelector('.badge')?.closest('.nav-item__badge')).not.toBeNull()
  })

  it('toggles a selected expandable item by a click on the row', async () => {
    const { root } = mountWithSlots({ label: LABEL, expandable: true, selected: true })
    ;(root.querySelector('.nav-item__hit') as HTMLButtonElement).click()
    await tick()
    expect(root.querySelector('.child')).not.toBeNull()
  })

  it('keeps the chevron space of an empty item without a button', () => {
    const { root } = mountWithSlots({ label: LABEL, expandable: true, empty: true })
    const space = root.querySelector('.nav-item__chevron') as HTMLElement
    expect(space.tagName).toBe('SPAN')
    expect(space.getAttribute('aria-hidden')).toBe('true')
    expect(root.querySelector('[role="group"]')).toBeNull()
  })

  it('indents by level and disables the row', () => {
    const { root, hit } = mount({ label: LABEL, level: 2, disabled: true })
    expect(root.style.getPropertyValue('--_level')).toBe('2')
    expect(hit.disabled).toBe(true)
  })

  it('opens and closes the node by ArrowRight / ArrowLeft on the row, which reports the state', async () => {
    const { hit, component, root } = mount({ label: LABEL, expandable: true })
    const onToggle = vi.fn<(event: CustomEvent<boolean>) => void>()
    component.$on('toggle', onToggle)
    const chevron = root.querySelector('button.nav-item__chevron') as HTMLButtonElement
    expect(chevron.getAttribute('aria-expanded')).toBe('false')
    expect(chevron.hasAttribute('aria-controls')).toBe(false)

    const right = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })
    hit.dispatchEvent(right)
    await tick()
    expect(right.defaultPrevented).toBe(true)
    expect(chevron.getAttribute('aria-expanded')).toBe('true')
    expect(chevron.getAttribute('aria-controls')).toBe(root.querySelector('.nav-item__children')?.id)
    hit.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    hit.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    await tick()
    expect(onToggle.mock.calls.map(([event]) => event.detail)).toEqual([true, false])

    const leaf = mount({ label: LABEL })
    const ignored = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })
    leaf.hit.dispatchEvent(ignored)
    expect(ignored.defaultPrevented).toBe(false)
  })

  it('reads the description with the label', () => {
    const { hit, root } = mount({ label: LABEL, description: getEmbeddedLabel('TSK-12') })
    const description = root.querySelector('.nav-item__description') as HTMLElement
    expect(hit.getAttribute('aria-labelledby')?.split(' ')[1]).toBe(description.id)
  })

  it('announces the expanded state on the row button of an expandable item', async () => {
    const { root } = mountWithSlots({ label: LABEL, expandable: true })
    const row = root.querySelector('.nav-item__hit') as HTMLButtonElement
    expect(row.getAttribute('aria-expanded')).toBe('false')
    expect(row.hasAttribute('aria-controls')).toBe(false)
    ;(root.querySelector('.nav-item__chevron') as HTMLButtonElement).click()
    await tick()
    expect(row.getAttribute('aria-expanded')).toBe('true')
    expect(row.getAttribute('aria-controls')).toBe(root.querySelector('[role="group"]')?.id)
  })

  it('does not announce an expanded state on a plain row', () => {
    const { hit } = mount({ label: LABEL })
    expect(hit.hasAttribute('aria-expanded')).toBe(false)
  })

  it('gives the tooltip of a cut label its params', async () => {
    const label = 'ui:string:Count' as IntlString
    const { hit, root } = mount({ label, labelParams: { n: 3 } })
    const text = root.querySelector('.nav-item__label') as HTMLElement
    Object.defineProperty(text, 'scrollWidth', { configurable: true, value: 200 })
    Object.defineProperty(text, 'clientWidth', { configurable: true, value: 100 })
    tooltipUpdate.mockClear()
    hit.dispatchEvent(new MouseEvent('mouseenter'))
    await tick()
    const options = tooltipUpdate.mock.calls.map(([value]) => value as unknown).find((value) => value !== undefined)
    expect(options).toEqual({ label, props: { n: 3 }, direction: 'top' })
  })
})
