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
import SplitButton from '../components/SplitButton.svelte'

const ICON = 'ui:icon:Check' as Asset

let target: HTMLElement

function mount (props: Record<string, unknown> = {}): { host: HTMLElement, component: SplitButton } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new SplitButton({ target: host, props })
  return { host, component }
}

describe('SplitButton', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('carries kind and size in the container class list, defaulting to secondary/medium', () => {
    const { host } = mount()
    const container = host.querySelector('.hulySplitButton-container') as HTMLElement
    expect(container.classList.contains('secondary')).toBe(true)
    expect(container.classList.contains('medium')).toBe(true)
  })

  it('shows only a spinner while loading, no buttons', () => {
    const { host } = mount({ loading: true })
    expect(host.querySelector('.spinner')).not.toBeNull()
    expect(host.querySelector('.hulySplitButton-main')).toBeNull()
    expect(host.querySelector('.hulySplitButton-second')).toBeNull()
  })

  it('is a submit button only when kind is primary', () => {
    expect((mount({ kind: 'primary' }).host.querySelector('.hulySplitButton-main') as HTMLButtonElement).type).toBe(
      'submit'
    )
    expect(
      (mount({ kind: 'secondary' }).host.querySelector('.hulySplitButton-main') as HTMLButtonElement).type
    ).toBe('button')
  })

  it('invokes action on the main button click and stops propagation', () => {
    const action = vi.fn()
    const { host } = mount({ action })
    const onParent = vi.fn()
    target.addEventListener('click', onParent)
    const main = host.querySelector('.hulySplitButton-main') as HTMLButtonElement
    main.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(action).toHaveBeenCalledTimes(1)
    expect(onParent).not.toHaveBeenCalled()
  })

  it('invokes secondAction on the second button click, independent of action', () => {
    const action = vi.fn()
    const secondAction = vi.fn()
    const { host } = mount({ action, secondAction })
    const second = host.querySelector('.hulySplitButton-second') as HTMLButtonElement
    second.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(secondAction).toHaveBeenCalledTimes(1)
    expect(action).not.toHaveBeenCalled()
  })

  it('toggles pressed and secondPressed independently', () => {
    const { host } = mount({ pressed: true, secondPressed: false })
    expect(host.querySelector('.hulySplitButton-main')?.classList.contains('pressed')).toBe(true)
    expect(host.querySelector('.hulySplitButton-second')?.classList.contains('pressed')).toBe(false)
  })

  it('disables both buttons when disabled is set', () => {
    const { host } = mount({ disabled: true })
    expect((host.querySelector('.hulySplitButton-main') as HTMLButtonElement).disabled).toBe(true)
    expect((host.querySelector('.hulySplitButton-second') as HTMLButtonElement).disabled).toBe(true)
  })

  it('sizes the icon full by default, or from iconProps.size', () => {
    const { host } = mount({ icon: ICON })
    expect(host.querySelector('.hulySplitButton-main svg.svg-full')).not.toBeNull()

    const { host: host2 } = mount({ icon: ICON, iconProps: { size: 'small' } })
    expect(host2.querySelector('.hulySplitButton-main svg.svg-small')).not.toBeNull()
  })

  it('applies width and height inline styles to the container', () => {
    const { host } = mount({ width: '4rem', height: '2rem' })
    const container = host.querySelector('.hulySplitButton-container') as HTMLElement
    expect(container.style.width).toBe('4rem')
    expect(container.style.height).toBe('2rem')
  })

  it('renders the label text inside the main button', () => {
    const { host } = mount({ label: 'ui:string:Ok' as IntlString })
    expect(host.querySelector('.hulySplitButton-main .overflow-label.label')).not.toBeNull()
  })
})
