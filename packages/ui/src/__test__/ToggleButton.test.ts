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
import type { Asset, IntlString } from '@hcengineering/platform'
import ToggleButton from '../components/ToggleButton.svelte'

const ICON = 'ui:icon:Check' as Asset

let target: HTMLElement

function mount (props: Record<string, unknown>): { button: HTMLButtonElement, component: ToggleButton } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new ToggleButton({ target: host, props })
  return { button: host.querySelector('button') as HTMLButtonElement, component }
}

describe('ToggleButton', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('carries size and justify in the class list', () => {
    const { button } = mount({ value: true, size: 'large', justify: 'left' })
    expect(button.classList.contains('large')).toBe(true)
    expect(button.classList.contains('jf-left')).toBe(true)
  })

  it('is icon-only when there is no label and no content slot', async () => {
    const { button, component } = mount({ value: true })
    expect(button.classList.contains('only-icon')).toBe(true)

    component.$set({ label: 'ui:string:Ok' as IntlString })
    await tick()
    expect(button.classList.contains('only-icon')).toBe(false)
  })

  it('carries the selected class from the selected prop', () => {
    expect(mount({ value: true, selected: true }).button.classList.contains('selected')).toBe(true)
    expect(mount({ value: true, selected: false }).button.classList.contains('selected')).toBe(false)
  })

  // pinned behaviour, not a desired one - the 'disabled' class tracks the boolean `value` prop, not an actual disabled/interactive state
  it('carries the disabled class when value is false', () => {
    expect(mount({ value: false }).button.classList.contains('disabled')).toBe(true)
    expect(mount({ value: true }).button.classList.contains('disabled')).toBe(false)
  })

  it('flips value and dispatches change on click', () => {
    const { button, component } = mount({ value: false })
    const onChange = vi.fn()
    component.$on('change', onChange)
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ detail: true }))
  })

  it('focuses itself on mount when focus is set', () => {
    const { button } = mount({ value: true, focus: true })
    expect(document.activeElement).toBe(button)
  })

  it('builds the inline style from width and backgroundColor', () => {
    const { button } = mount({ value: true, width: '3rem', backgroundColor: 'red' })
    expect(button.getAttribute('style')).toBe('width: 3rem; background: red;')
  })

  it('renders the icon wrapper when icon is set', () => {
    const { button } = mount({ value: true, icon: ICON })
    expect(button.querySelector('.btn-icon')).not.toBeNull()
  })
})
