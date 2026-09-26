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
import type { IntlString } from '@hcengineering/platform'
import type { ComponentProps } from 'svelte'
import Breadcrumbs from '../components/Breadcrumbs.svelte'
import type { BreadcrumbItem } from '../types'

let target: HTMLElement

const ITEMS: BreadcrumbItem[] = [{ title: 'One' }, { title: 'Two' }, { title: 'Three' }]

function mount (props: Partial<ComponentProps<Breadcrumbs>>): { host: HTMLElement, component: Breadcrumbs } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new Breadcrumbs({ target: host, props: props as ComponentProps<Breadcrumbs> })
  return { host, component }
}

describe('Breadcrumbs', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders one breadcrumb per item, with a chevron between them but not before the first', () => {
    const { host } = mount({ items: ITEMS })
    expect(host.querySelectorAll('.hulyBreadcrumb-container').length).toBe(3)
    expect(host.querySelectorAll('svg').length).toBe(2)
  })

  it('marks the selected index current, and no item current when selected is null', async () => {
    const { host, component } = mount({ items: ITEMS, selected: 1 })
    const buttons = host.querySelectorAll('.hulyBreadcrumb-container')
    expect(buttons[1].classList.contains('current')).toBe(true)
    expect(buttons[0].classList.contains('current')).toBe(false)

    component.$set({ selected: null })
    await tick()
    expect(host.querySelectorAll('.current').length).toBe(0)
  })

  it('marks every item current when currentOnly is set', () => {
    const { host } = mount({ items: ITEMS, currentOnly: true })
    expect(host.querySelectorAll('.hulyBreadcrumb-container.current').length).toBe(3)
  })

  it('dispatches select with the clicked index, but not for the already-selected one', () => {
    const { host, component } = mount({ items: ITEMS, selected: 0 })
    const onSelect = vi.fn()
    component.$on('select', onSelect)
    const buttons = host.querySelectorAll('.hulyBreadcrumb-container')

    ;(buttons[0] as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onSelect).not.toHaveBeenCalled()
    ;(buttons[2] as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ detail: 2 }))
  })

  it('shows the afterLabel span only when afterLabel is set and hideAfter is false', async () => {
    const { host, component } = mount({ items: ITEMS, afterLabel: 'ui:string:Ok' as IntlString })
    expect(host.querySelector('.hulyBreadcrumbs-afterLabel')).not.toBeNull()

    component.$set({ hideAfter: true })
    await tick()
    expect(host.querySelector('.hulyBreadcrumbs-afterLabel')).toBeNull()
  })
})
