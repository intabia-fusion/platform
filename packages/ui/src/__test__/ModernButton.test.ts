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
import ModernButton from '../components/ModernButton.svelte'

const ICON = 'ui:icon:Check' as Asset

let target: HTMLElement

function mount (props: Partial<ComponentProps<ModernButton>> = {}): {
  button: HTMLButtonElement
  component: ModernButton
} {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new ModernButton({ target: host, props: props as ComponentProps<ModernButton> })
  return { button: host.querySelector('button') as HTMLButtonElement, component }
}

describe('ModernButton', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('defaults to secondary/large/rectangle/type-button', () => {
    const { button } = mount()
    expect(button.classList.contains('secondary')).toBe(true)
    expect(button.classList.contains('large')).toBe(true)
    expect(button.classList.contains('rectangle')).toBe(true)
    expect(button.classList.contains('type-button')).toBe(true)
  })

  it('carries kind, size and shape overrides', () => {
    const { button } = mount({ kind: 'primary', size: 'small', shape: 'round' })
    expect(button.classList.contains('primary')).toBe(true)
    expect(button.classList.contains('small')).toBe(true)
    expect(button.classList.contains('round')).toBe(true)
  })

  it('is disabled while loading, and shows a spinner', () => {
    const { button } = mount({ loading: true })
    expect(button.disabled).toBe(true)
    expect(button.querySelector('.spinner')).not.toBeNull()
  })

  it('stays disabled via the disabled prop', () => {
    const { button } = mount({ disabled: true })
    expect(button.disabled).toBe(true)
  })

  // pinned behaviour, not a desired one - ModernButton always forwards a default <slot/> to ButtonBase,
  // so ButtonBase sees $$slots.default as defined even with no content, and iconOnly can never become true.
  it('never becomes icon-only, since it always forwards a default slot to ButtonBase', () => {
    const { button } = mount({ icon: ICON })
    expect(button.classList.contains('iconOnly')).toBe(false)
  })

  it('forwards click and stops propagation', () => {
    const { button, component } = mount()
    const onClick = vi.fn()
    const onParent = vi.fn()
    component.$on('click', onClick)
    target.addEventListener('click', onParent)

    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(onParent).not.toHaveBeenCalled()
  })
})
