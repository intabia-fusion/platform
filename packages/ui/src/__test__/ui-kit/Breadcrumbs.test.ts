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
import { getEmbeddedLabel, type Asset } from '@hcengineering/platform'
import { tick, type ComponentProps } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import Breadcrumb from '../../ui-kit/breadcrumbs/Breadcrumb.svelte'
import Breadcrumbs from '../../ui-kit/breadcrumbs/Breadcrumbs.svelte'
import BreadcrumbsWithAfter from './BreadcrumbsWithAfter.svelte'

const ITEMS = [
  { id: 'settings', icon: 'ui:icon:Settings' as Asset, label: getEmbeddedLabel('Settings') },
  { id: 'hooks', label: getEmbeddedLabel('Webhooks') },
  { id: 'endpoint', label: getEmbeddedLabel('Endpoint') }
]

let target: HTMLElement
const mounted: Array<{ $destroy: () => void }> = []

function host (): HTMLElement {
  const el = document.createElement('div')
  target.appendChild(el)
  return el
}

function mount (props: ComponentProps<Breadcrumbs>): { root: HTMLElement, component: Breadcrumbs } {
  const el = host()
  const component = new Breadcrumbs({ target: el, props })
  mounted.push(component)
  return { root: el.querySelector('nav') as HTMLElement, component }
}

describe('ui-kit Breadcrumbs', () => {
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

  it('is a nav with an ordered list, the last item current and not a button', async () => {
    const { root } = mount({ items: ITEMS, 'aria-label': 'Breadcrumbs' })
    await tick()
    expect(root.getAttribute('aria-label')).toBe('Breadcrumbs')
    const entries = Array.from(root.querySelectorAll('ol > li'))
    expect(entries).toHaveLength(3)
    expect(root.querySelectorAll('button')).toHaveLength(2)
    const current = entries[2].querySelector('[aria-current="page"]')
    expect(current?.tagName).toBe('SPAN')
    expect(current?.textContent?.trim()).toBe('Endpoint')
    expect(root.querySelectorAll('[aria-current]')).toHaveLength(1)
  })

  it('names the landmark Breadcrumbs by default, the place name wins', async () => {
    const { root } = mount({ items: ITEMS })
    await vi.waitFor(() => {
      expect(root.getAttribute('aria-label')).toBe('ui:string:Breadcrumbs')
    })

    const labelled = mount({ items: ITEMS, 'aria-labelledby': 'page-title' })
    await tick()
    expect(labelled.root.hasAttribute('aria-label')).toBe(false)
    expect(labelled.root.getAttribute('aria-labelledby')).toBe('page-title')
  })

  it('switches to the default name when the place drops its own', async () => {
    const { root, component } = mount({ items: ITEMS, 'aria-label': 'Path' })
    await tick()
    expect(root.getAttribute('aria-label')).toBe('Path')
    component.$set({ 'aria-label': undefined })
    await vi.waitFor(() => {
      expect(root.getAttribute('aria-label')).toBe('ui:string:Breadcrumbs')
    })
  })

  it('puts a hidden separator before every item but the first', () => {
    const { root } = mount({ items: ITEMS })
    const entries = Array.from(root.querySelectorAll('ol > li'))
    expect(entries.map((li) => li.querySelector('.breadcrumbs__separator') !== null)).toEqual([false, true, true])
    expect(root.querySelector('.breadcrumbs__separator')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('reports the index of the clicked item', () => {
    const { root, component } = mount({ items: ITEMS })
    const onSelect = vi.fn<(event: CustomEvent<number>) => void>()
    component.$on('select', onSelect)
    const buttons = Array.from(root.querySelectorAll('button'))
    buttons[1].click()
    buttons[0].click()
    expect(onSelect.mock.calls.map(([event]) => event.detail)).toEqual([1, 0])
  })

  it('shows a single item as the current page', () => {
    const { root } = mount({ items: [ITEMS[0]] })
    expect(root.querySelector('button')).toBeNull()
    expect(root.querySelector('[aria-current="page"] .breadcrumb__icon--box')).not.toBeNull()
  })

  it('moves the current page when the path changes', async () => {
    const { root, component } = mount({ items: ITEMS })
    component.$set({ items: ITEMS.slice(0, 2) })
    await tick()
    const current = root.querySelector('[aria-current="page"]')
    expect(root.querySelectorAll('ol > li')).toHaveLength(2)
    expect(current?.textContent?.trim()).toBe('Webhooks')
    expect(root.querySelectorAll('button')).toHaveLength(1)
  })

  it('puts icons on a plate unless an item asks for an avatar', () => {
    const avatar = { id: 'anna', icon: 'ui:icon:Person' as Asset, iconBox: false, label: getEmbeddedLabel('Anna') }
    const { root } = mount({ items: [ITEMS[0], avatar] })
    const icons = Array.from(root.querySelectorAll('.breadcrumb__icon'))
    expect(icons.map((icon) => icon.classList.contains('breadcrumb__icon--box'))).toEqual([true, false])
  })

  it('renders an empty list without items', () => {
    const { root } = mount({ items: [] })
    expect(root.querySelectorAll('li')).toHaveLength(0)
  })

  it('tells the styles how many path items give way before the current one', async () => {
    const { root, component } = mount({ items: ITEMS })
    const list = root.querySelector('ol') as HTMLElement
    expect(list.style.getPropertyValue('--_path')).toBe('2')
    component.$set({ items: [ITEMS[0]] })
    await tick()
    expect(list.style.getPropertyValue('--_path')).toBe('0')
  })

  it('leaves out the after slot when the place does not pass it', () => {
    const { root } = mount({ items: ITEMS })
    expect(root.querySelector('.breadcrumbs__after')).toBeNull()
  })

  it('renders the after slot and hides it when the place renders nothing', async () => {
    const el = host()
    const component = new BreadcrumbsWithAfter({ target: el, props: { items: [ITEMS[0]], description: 'Team space' } })
    mounted.push(component)
    expect(el.querySelector('.breadcrumbs__after .description')?.textContent).toBe('Team space')
    component.$set({ description: '' })
    await tick()
    expect(el.querySelector('.breadcrumbs__after')?.childElementCount).toBe(0)
  })
})

describe('ui-kit Breadcrumb', () => {
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

  it('is a button that forwards the click', () => {
    const el = host()
    const component = new Breadcrumb({ target: el, props: { label: getEmbeddedLabel('Back') } })
    mounted.push(component)
    const onClick = vi.fn()
    component.$on('click', onClick)
    const button = el.querySelector('button') as HTMLButtonElement
    expect(button.type).toBe('button')
    button.click()
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('draws an avatar without the plate', () => {
    const el = host()
    mounted.push(
      new Breadcrumb({
        target: el,
        props: { label: getEmbeddedLabel('Anna'), icon: 'ui:icon:Person' as Asset, iconBox: false, current: true }
      })
    )
    const icon = el.querySelector('.breadcrumb__icon') as HTMLElement
    expect(icon.classList.contains('breadcrumb__icon--box')).toBe(false)
    expect(icon.getAttribute('aria-hidden')).toBe('true')
    expect(el.querySelector('.breadcrumb--current')?.getAttribute('aria-current')).toBe('page')
  })
})
