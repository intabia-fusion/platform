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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Asset } from '@hcengineering/platform'
import ButtonIcon from '../components/ButtonIcon.svelte'

const ICON = 'ui:icon:Check' as Asset

let target: HTMLElement

function mount (props: Record<string, unknown>): { button: HTMLButtonElement, component: ButtonIcon } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new ButtonIcon({ target: host, props })
  return { button: host.querySelector('button') as HTMLButtonElement, component }
}

describe('ButtonIcon', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('always renders as type-button-icon', () => {
    const { button } = mount({ icon: ICON })
    expect(button.classList.contains('type-button-icon')).toBe(true)
  })

  it('is always icon-only, since no label or title is passed through', () => {
    const { button } = mount({ icon: ICON })
    expect(button.classList.contains('iconOnly')).toBe(true)
  })

  it('defaults to secondary/large and accepts overrides', () => {
    const { button: def } = mount({ icon: ICON })
    expect(def.classList.contains('secondary')).toBe(true)
    expect(def.classList.contains('large')).toBe(true)

    const { button } = mount({ icon: ICON, kind: 'primary', size: 'small' })
    expect(button.classList.contains('primary')).toBe(true)
    expect(button.classList.contains('small')).toBe(true)
  })

  it('disables the button when loading, showing a spinner', () => {
    const { button } = mount({ icon: ICON, loading: true })
    expect(button.disabled).toBe(true)
    expect(button.querySelector('.spinner')).not.toBeNull()
  })

  it('forwards pressed, menu and no-print classes', () => {
    const { button } = mount({ icon: ICON, pressed: true, hasMenu: true, noPrint: true })
    expect(button.classList.contains('pressed')).toBe(true)
    expect(button.classList.contains('menu')).toBe(true)
    expect(button.classList.contains('no-print')).toBe(true)
  })

  it('forwards click and keydown events', () => {
    const { button, component } = mount({ icon: ICON })
    const onClick = vi.fn()
    const onKeydown = vi.fn()
    component.$on('click', onClick)
    component.$on('keydown', onKeydown)

    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    button.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(onKeydown).toHaveBeenCalledTimes(1)
  })

  it('exposes focus() to focus the button', () => {
    const { button, component } = mount({ icon: ICON })
    component.focus()
    expect(document.activeElement).toBe(button)
  })

  it('passes id and dataId through', () => {
    const { button } = mount({ icon: ICON, id: 'bi1', dataId: 'd1' })
    expect(button.id).toBe('bi1')
    expect(button.dataset.id).toBe('d1')
  })
})
