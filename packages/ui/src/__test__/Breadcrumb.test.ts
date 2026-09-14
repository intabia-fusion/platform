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
import type { Asset } from '@hcengineering/platform'
import type { ComponentProps } from 'svelte'
import Breadcrumb from '../components/Breadcrumb.svelte'

const ICON = 'ui:icon:Check' as Asset

let target: HTMLElement

function mount (props: Partial<ComponentProps<Breadcrumb>>): { button: HTMLButtonElement, component: Breadcrumb } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new Breadcrumb({ target: host, props: props as ComponentProps<Breadcrumb> })
  return { button: host.querySelector('button') as HTMLButtonElement, component }
}

describe('Breadcrumb', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('shows the icon only at large size, never at small', () => {
    const large = mount({ size: 'large', icon: ICON })
    expect(large.button.querySelector('.hulyBreadcrumb-avatar')).not.toBeNull()

    const small = mount({ size: 'small', icon: ICON })
    expect(small.button.querySelector('.hulyBreadcrumb-avatar')).toBeNull()
  })

  it('marks itself current, bypassing hover/click styling', () => {
    const { button } = mount({ size: 'large', isCurrent: true })
    expect(button.classList.contains('current')).toBe(true)
  })

  it('renders title as plain text alongside a label', () => {
    const { button } = mount({ size: 'large', title: 'plain title' })
    expect(button.querySelector('.hulyBreadcrumb-label')?.textContent).toContain('plain title')
  })

  it('forwards the click event', () => {
    const { button } = mount({ size: 'small' })
    const onClick = vi.fn()
    button.addEventListener('click', onClick)
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('applies iconWidth and iconMargin as inline styles on the avatar, reacting to prop changes', async () => {
    const { button, component } = mount({ size: 'large', icon: ICON, iconWidth: '2rem', iconMargin: '1px' })
    const avatar = button.querySelector('.hulyBreadcrumb-avatar') as HTMLElement
    expect(avatar.style.width).toBe('2rem')
    expect(avatar.style.margin).toBe('1px')

    component.$set({ withoutIconBackground: true })
    await tick()
    expect(avatar.classList.contains('withoutIconBackground')).toBe(true)
  })
})
