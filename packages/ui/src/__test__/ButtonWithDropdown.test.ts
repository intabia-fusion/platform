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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IntlString } from '@hcengineering/platform'
import type { ComponentProps } from 'svelte'
import ButtonWithDropdown from '../components/ButtonWithDropdown.svelte'
import { modalStore } from '../modals'
import { popupstore } from '../popups'
import type { SelectPopupValueType } from '../types'

const ITEMS: SelectPopupValueType[] = [
  { id: 'a', label: 'ui:string:Ok' as IntlString },
  { id: 'b', label: 'ui:string:Cancel' as IntlString }
]

let target: HTMLElement

function mount (props: Partial<ComponentProps<ButtonWithDropdown>>): {
  host: HTMLElement
  component: ButtonWithDropdown
} {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new ButtonWithDropdown({ target: host, props: props as ComponentProps<ButtonWithDropdown> })
  return { host, component }
}

describe('ButtonWithDropdown', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
    modalStore.set([])
    localStorage.clear()
  })

  afterEach(() => {
    target.remove()
  })

  it('renders a main button and a dropdown toggle button by default', () => {
    const { host } = mount({ dropdownItems: ITEMS })
    expect(host.querySelectorAll('button.antiButton')).toHaveLength(2)
  })

  it('renders only the main button when hasDropdown is false', () => {
    const { host } = mount({ dropdownItems: ITEMS, hasDropdown: false })
    expect(host.querySelectorAll('button.antiButton')).toHaveLength(1)
  })

  it('forwards a click on the main button as the component click event, without opening a popup', () => {
    const { host, component } = mount({ dropdownItems: ITEMS })
    const onClick = vi.fn()
    component.$on('click', onClick)
    const [main] = host.querySelectorAll('button.antiButton')
    main.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(get(popupstore)).toHaveLength(0)
  })

  it('opens a SelectPopup with dropdownItems on the dropdown toggle click', () => {
    const { host, component } = mount({ dropdownItems: ITEMS })
    const onClick = vi.fn()
    component.$on('click', onClick)
    const buttons = host.querySelectorAll('button.antiButton')
    const toggle = buttons[1] as HTMLButtonElement
    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    const popups = get(popupstore)
    expect(popups).toHaveLength(1)
    expect((popups[0].props as { value: SelectPopupValueType[] }).value).toEqual(ITEMS)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('dispatches dropdown-selected when the popup resolves', () => {
    const { host, component } = mount({ dropdownItems: ITEMS })
    const onSelected = vi.fn()
    component.$on('dropdown-selected', onSelected)
    const buttons = host.querySelectorAll('button.antiButton')
    const toggle = buttons[1] as HTMLButtonElement
    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    const popup = get(popupstore)[0]
    popup.onClose?.('a')
    expect(onSelected).toHaveBeenLastCalledWith(expect.objectContaining({ detail: 'a' }))
  })

  it('disables both buttons when disabled is set', () => {
    const { host } = mount({ dropdownItems: ITEMS, disabled: true })
    const buttons = host.querySelectorAll('button.antiButton') as NodeListOf<HTMLButtonElement>
    expect(buttons[0].disabled).toBe(true)
    expect(buttons[1].disabled).toBe(true)
  })

  it('gives the main button a rectangle-right shape only when hasDropdown is true', () => {
    expect(
      mount({ dropdownItems: ITEMS, hasDropdown: true })
        .host.querySelector('button.antiButton')
        ?.classList.contains('sh-rectangle-right')
    ).toBe(true)
    expect(
      mount({ dropdownItems: ITEMS, hasDropdown: false })
        .host.querySelector('button.antiButton')
        ?.classList.contains('sh-no-shape')
    ).toBe(true)
  })
})
