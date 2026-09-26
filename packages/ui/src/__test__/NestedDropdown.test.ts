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
import NestedDropdown from '../components/NestedDropdown.svelte'
import NestedMenu from '../components/NestedMenu.svelte'
import type { DropdownIntlItem } from '../types'
import { modalStore } from '../modals'
import { popupstore, type CompAndProps } from '../popups'
import { get } from 'svelte/store'

const GROUP_A: DropdownIntlItem = { id: 'group-a', label: 'ui:string:GroupA' as IntlString }
const CHILD_A1: DropdownIntlItem = { id: 'a1', label: 'ui:string:A1' as IntlString }
const CHILD_A2: DropdownIntlItem = { id: 'a2', label: 'ui:string:A2' as IntlString }

const ITEMS: Array<[DropdownIntlItem, DropdownIntlItem[]]> = [[GROUP_A, [CHILD_A1, CHILD_A2]]]

let target: HTMLElement

interface Mounted {
  component: NestedDropdown
  host: HTMLElement
  button: HTMLButtonElement
}

function mount (props: Partial<ComponentProps<NestedDropdown>>): Mounted {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new NestedDropdown({ target: host, props: props as any })
  return { component, host, button: host.querySelector('button') as HTMLButtonElement }
}

describe('NestedDropdown', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
    modalStore.set([])
  })

  afterEach(() => {
    target.remove()
  })

  it('shows the label placeholder when nothing is selected', () => {
    const { button } = mount({ items: ITEMS, label: 'ui:string:Placeholder' as IntlString })
    expect(button.textContent).toContain('ui:string:Placeholder')
  })

  it('shows the selected item label instead of the placeholder', () => {
    const { button } = mount({ items: ITEMS, selected: CHILD_A1, label: 'ui:string:Placeholder' as IntlString })
    expect(button.textContent).toContain('ui:string:A1')
  })

  it('opens exactly one popup with the nested menu component and props on click', async () => {
    const { button } = mount({ items: ITEMS, withIcon: true })
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick()

    const popups = get(popupstore)
    expect(popups.length).toBe(1)
    expect(popups[0].is).toBe(NestedMenu)
    expect(popups[0].props).toMatchObject({ items: ITEMS, withIcon: true, withSearch: true })
  })

  it('does not open a second popup on a second click while the first is open', async () => {
    const { button } = mount({ items: ITEMS })
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick()
    expect(get(popupstore).length).toBe(1)
  })

  it('applying the result from the popup updates selected and dispatches the child id', async () => {
    const { button, component } = mount({ items: ITEMS })
    const onSelected = vi.fn()
    component.$on('selected', onSelected)

    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick()
    const popup = get(popupstore)[0] as CompAndProps
    popup.onClose?.(CHILD_A2)
    await tick()
    // Label's translateCB resolves via a Promise chain on a cache miss, so a settle beyond one tick is needed.
    await new Promise((resolve) => setTimeout(resolve, 0))
    await tick()

    expect(onSelected).toHaveBeenLastCalledWith(expect.objectContaining({ detail: 'a2' }))
    expect(button.textContent).toContain('ui:string:A2')
  })

  it('shows the dropdown icon by default and hides it when withSelectIcon is off', () => {
    const withIcon = mount({ items: ITEMS })
    expect(withIcon.host.querySelector('svg')).not.toBeNull()
    const withoutIcon = mount({ items: ITEMS, withSelectIcon: false })
    expect(withoutIcon.host.querySelector('svg')).toBeNull()
  })

  // No explicit disabled guard in openPopup, only the native disabled attribute on the button.
  it('sets the disabled attribute on the trigger, though the click handler has no disabled guard', async () => {
    const { button } = mount({ items: ITEMS, disabled: true })
    expect(button.disabled).toBe(true)
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick()
    expect(get(popupstore).length).toBe(1)
  })

  it('carries kind and size to the trigger button', () => {
    const { button } = mount({ items: ITEMS, kind: 'primary', size: 'large' })
    expect(button.classList.contains('primary')).toBe(true)
    expect(button.classList.contains('large')).toBe(true)
  })

  it('passes an empty items list through without throwing', () => {
    const { button } = mount({ items: [] })
    expect(button).not.toBeNull()
  })
})
