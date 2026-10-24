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
import { tick } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { NavGroupProps } from '../../ui-kit/nav-group/types'
import NavGroupWithSlots from './NavGroupWithSlots.svelte'

const LABEL = getEmbeddedLabel('Spaces')

let target: HTMLElement
const mounted: Array<{ $destroy: () => void }> = []

function mount (props: NavGroupProps, collapsed = false): { root: HTMLElement, component: NavGroupWithSlots } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new NavGroupWithSlots({ target: host, props: { props, collapsed } })
  mounted.push(component)
  return { root: host.querySelector('.nav-group') as HTMLElement, component }
}

function content (root: HTMLElement): HTMLElement {
  return root.querySelector('.nav-group__content') as HTMLElement
}

describe('ui-kit NavGroup', () => {
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

  it('is a static heading with a divider unless expandable or selectable', () => {
    const { root } = mount({ label: LABEL })
    expect(root.classList.contains('nav-group--divider')).toBe(true)
    expect(root.querySelector('.nav-group__hit')).toBeNull()
    expect(root.querySelector('.nav-group__chevron')).toBeNull()
    expect(content(root).hidden).toBe(false)
    expect(content(root).getAttribute('aria-labelledby')).toBe(root.querySelector('.nav-group__label')?.id)

    expect(mount({ label: LABEL, divider: false }).root.classList.contains('nav-group--divider')).toBe(false)
    expect(mount({ label: LABEL, kind: 'nested' }).root.classList.contains('nav-group--divider')).toBe(false)
  })

  it('toggles from the header, keeping the content mounted and tools outside the header button', async () => {
    const { root, component } = mount({ label: LABEL, expandable: true })
    const onToggle = vi.fn<(event: CustomEvent<boolean>) => void>()
    component.$on('toggle', onToggle)
    const hit = root.querySelector('.nav-group__hit') as HTMLButtonElement
    expect(hit.getAttribute('aria-expanded')).toBe('true')
    expect(hit.getAttribute('aria-controls')).toBe(content(root).id)

    hit.click()
    await tick()
    expect(hit.getAttribute('aria-expanded')).toBe('false')
    expect(content(root).hidden).toBe(true)
    expect(content(root).querySelector('.content')).not.toBeNull()
    hit.click()
    await tick()
    expect(content(root).hidden).toBe(false)
    expect(onToggle.mock.calls.map(([event]) => event.detail)).toEqual([false, true])

    expect(root.querySelector('.tool')?.closest('.nav-group__hit')).toBeNull()
    expect(root.querySelector('.tool')?.closest('.nav-group__tools')).not.toBeNull()
    expect(root.querySelector('.extra')?.closest('.nav-group__extra')).not.toBeNull()
  })

  it('shows the collapsed slot while closed', () => {
    const { root } = mount({ label: LABEL, expandable: true, open: false }, true)
    expect(root.querySelector('.selected-child')).not.toBeNull()
    expect(mount({ label: LABEL, expandable: true }, true).root.querySelector('.selected-child')).toBeNull()
  })

  it('selects from the header of a selectable group, the chevron keeps toggling', async () => {
    const { root, component } = mount({ label: LABEL, expandable: true, selected: true, kind: 'nested' })
    const onSelect = vi.fn()
    const onToggle = vi.fn()
    component.$on('select', onSelect)
    component.$on('toggle', onToggle)
    const hit = root.querySelector('.nav-group__hit') as HTMLButtonElement
    expect(hit.getAttribute('aria-current')).toBe('page')
    expect(hit.getAttribute('aria-expanded')).toBe('true')
    expect(hit.getAttribute('aria-controls')).toBe(content(root).id)
    expect(root.querySelector('.nav-group__arrow')).not.toBeNull()

    hit.click()
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onToggle).not.toHaveBeenCalled()
    ;(root.querySelector('button.nav-group__chevron') as HTMLButtonElement).click()
    await tick()
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(content(root).hidden).toBe(true)
    expect(hit.getAttribute('aria-expanded')).toBe('false')
  })

  it('does not announce an expanded state on the header of a selectable group that cannot expand', () => {
    const { root } = mount({ label: LABEL, selected: false })
    const hit = root.querySelector('.nav-group__hit') as HTMLButtonElement
    expect(hit.hasAttribute('aria-expanded')).toBe(false)
    expect(hit.hasAttribute('aria-controls')).toBe(false)
  })

  it('drops the chevron and the content of an empty group', () => {
    const { root } = mount({ label: LABEL, expandable: true, empty: true })
    expect(root.querySelector('.nav-group__chevron')).toBeNull()
    expect(root.querySelector('.nav-group__content')).toBeNull()
  })

  it('marks the caption of a highlighted group', () => {
    const { root } = mount({ label: LABEL, highlighted: true })
    expect(root.querySelector('.nav-group__header--marked')).not.toBeNull()
  })

  it('opens and closes a selectable group by arrows on its header', async () => {
    const { root, component } = mount({ label: LABEL, expandable: true, selected: false })
    const onToggle = vi.fn<(event: CustomEvent<boolean>) => void>()
    component.$on('toggle', onToggle)
    const hit = root.querySelector('.nav-group__hit') as HTMLButtonElement
    hit.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    await tick()
    expect(content(root).hidden).toBe(true)
    hit.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    hit.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await tick()
    expect(onToggle.mock.calls.map(([event]) => event.detail)).toEqual([false, true])
    expect(content(root).hidden).toBe(false)
  })

  it('keeps the id and data attributes of a plain heading on the group', () => {
    const plain = mount({ label: LABEL, id: 'starred', 'data-id': 'nav-starred' })
    expect(plain.root.id).toBe('starred')
    expect(plain.root.dataset.id).toBe('nav-starred')
    const toggling = mount({ label: LABEL, expandable: true, 'data-id': 'nav-spaces' })
    expect(toggling.root.dataset.id).toBeUndefined()
    expect((toggling.root.querySelector('.nav-group__hit') as HTMLElement).dataset.id).toBe('nav-spaces')
  })
})
