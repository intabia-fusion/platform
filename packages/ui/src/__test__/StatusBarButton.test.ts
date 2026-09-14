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
import type { ComponentProps } from 'svelte'
import StatusBarButton from '../components/StatusBarButton.svelte'

const ICON = 'ui:icon:Check' as Asset

let target: HTMLElement

function mount (props: Partial<ComponentProps<StatusBarButton>> = {}): { component: StatusBarButton, root: HTMLElement, button: HTMLButtonElement } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new StatusBarButton({ target: host, props: props as ComponentProps<StatusBarButton> })
  const button = host.querySelector('button') as HTMLButtonElement
  return { component, root: host, button }
}

describe('StatusBarButton', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders a button with the icon', () => {
    const { button } = mount({ icon: ICON })
    expect(button).not.toBeNull()
    expect(button.querySelector('svg')).not.toBeNull()
  })

  it('adds pressed class when pressed is true', () => {
    const { button } = mount({ icon: ICON, pressed: true })
    expect(button.classList.contains('pressed')).toBe(true)
  })

  it('forwards click events', () => {
    const onClick = vi.fn()
    const { component, button } = mount({ icon: ICON })
    component.$on('click', onClick)
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('passes id through to the button', () => {
    const { button } = mount({ icon: ICON, id: 'my-btn' })
    expect(button.id).toBe('my-btn')
  })

  it('binds element prop', () => {
    const { component } = mount({ icon: ICON, element: undefined as any })
    expect(component).toBeDefined()
  })
})
