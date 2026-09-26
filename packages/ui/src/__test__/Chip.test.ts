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
import type { ComponentProps } from 'svelte'
import Chip from '../components/Chip.svelte'

let target: HTMLElement

function mount (props: Partial<ComponentProps<Chip>>): { host: HTMLElement, component: Chip } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new Chip({ target: host, props: props as ComponentProps<Chip> })
  return { host, component }
}

describe('Chip', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders the label and carries the size class, defaulting to small', () => {
    const { host } = mount({ label: 'Tag' })
    expect(host.querySelector('.chip-label')?.textContent).toBe('Tag')
    expect(host.querySelector('.chip')?.classList.contains('small')).toBe(true)

    const min = mount({ label: 'Tag', size: 'min' })
    expect(min.host.querySelector('.chip')?.classList.contains('min')).toBe(true)
  })

  it('shows the remove button only when isRemovable is set', () => {
    expect(mount({ label: 'Tag' }).host.querySelector('button')).toBeNull()

    const { host } = mount({ label: 'Tag', isRemovable: true })
    const chip = host.querySelector('.chip') as HTMLElement
    expect(chip.classList.contains('removable')).toBe(true)
    expect(chip.querySelector('button')).not.toBeNull()
  })

  it('dispatches remove when the button is clicked', () => {
    const { host, component } = mount({ label: 'Tag', isRemovable: true })
    const onRemove = vi.fn()
    component.$on('remove', onRemove)

    const button = host.querySelector('button') as HTMLButtonElement
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it('dispatches remove on Backspace over the button, not on other keys', () => {
    const { host, component } = mount({ label: 'Tag', isRemovable: true })
    const onRemove = vi.fn()
    component.$on('remove', onRemove)
    const button = host.querySelector('button') as HTMLButtonElement

    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(onRemove).not.toHaveBeenCalled()

    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }))
    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it('applies backgroundColor as an inline style, and leaves it unset otherwise', () => {
    const { host } = mount({ label: 'Tag', backgroundColor: 'rgb(1, 2, 3)' })
    expect((host.querySelector('.chip') as HTMLElement).style.backgroundColor).toBe('rgb(1, 2, 3)')
    expect((mount({ label: 'Tag' }).host.querySelector('.chip') as HTMLElement).style.backgroundColor).toBe('')
  })

  it('exposes focus(), moving it onto the remove button', () => {
    const { component, host } = mount({ label: 'Tag', isRemovable: true })
    const button = host.querySelector('button') as HTMLButtonElement
    component.focus()
    expect(document.activeElement).toBe(button)
  })
})
