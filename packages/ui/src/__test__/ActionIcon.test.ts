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
import type { Asset, IntlString } from '@hcengineering/platform'
import type { ComponentProps } from 'svelte'
import ActionIcon from '../components/ActionIcon.svelte'

const ICON = 'ui:icon:Check' as Asset

let target: HTMLElement

function mount (props: Partial<ComponentProps<ActionIcon>> = {}): { component: ActionIcon, root: HTMLElement, button: HTMLButtonElement } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new ActionIcon({ target: host, props: props as ComponentProps<ActionIcon> })
  const button = host.querySelector('button') as HTMLButtonElement
  return { component, root: host, button }
}

describe('ActionIcon', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders a button with size class', () => {
    const { button } = mount({ icon: ICON, size: 'small' })
    expect(button).not.toBeNull()
    expect(button.classList.contains('small')).toBe(true)
  })

  it('renders an icon inside', () => {
    const { root } = mount({ icon: ICON, size: 'medium' })
    expect(root.querySelector('.icon')).not.toBeNull()
    expect(root.querySelector('svg')).not.toBeNull()
  })

  it('is disabled when asked', () => {
    const { button } = mount({ icon: ICON, size: 'small', disabled: true })
    expect(button.disabled).toBe(true)
  })

  it('adds invisible class to the icon wrapper', () => {
    const { root } = mount({ icon: ICON, size: 'small', invisible: true })
    expect(root.querySelector('.icon')?.classList.contains('invisible')).toBe(true)
  })

  it('calls action on click', () => {
    const action = vi.fn()
    const { button } = mount({ icon: ICON, size: 'small', action })
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(action).toHaveBeenCalledTimes(1)
  })

  it('forwards contextmenu events', () => {
    const onCtx = vi.fn()
    const { component, button } = mount({ icon: ICON, size: 'small' })
    component.$on('contextmenu', onCtx)
    button.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }))
    expect(onCtx).toHaveBeenCalledTimes(1)
  })
})
