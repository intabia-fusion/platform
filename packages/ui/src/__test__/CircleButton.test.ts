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
import CircleButton from '../components/CircleButton.svelte'

const ICON = 'ui:icon:Check' as Asset

let target: HTMLElement

function mount (props: Record<string, unknown> = {}): { el: HTMLElement, component: CircleButton } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new CircleButton({ target: host, props })
  return { el: host.querySelector('.icon-button') as HTMLElement, component }
}

describe('CircleButton', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('defaults to the large size class', () => {
    const { el } = mount()
    expect(el.classList.contains('icon-large')).toBe(true)
  })

  it('carries selected, ghost, primary and disabled classes from props', () => {
    const { el } = mount({ selected: true, ghost: true, primary: true, disabled: true })
    expect(el.classList.contains('selected')).toBe(true)
    expect(el.classList.contains('ghost')).toBe(true)
    expect(el.classList.contains('primary')).toBe(true)
    expect(el.classList.contains('disabled')).toBe(true)
  })

  it('forwards click and stops propagation', () => {
    const { el, component } = mount()
    const onClick = vi.fn()
    const onParent = vi.fn()
    component.$on('click', onClick)
    target.addEventListener('click', onParent)

    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(onParent).not.toHaveBeenCalled()
  })

  it('dispatches selected on Space and prevents default, ignores other keys', () => {
    const { el, component } = mount()
    const onSelected = vi.fn()
    component.$on('selected', onSelected)

    const spaceEvent = new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true })
    el.dispatchEvent(spaceEvent)
    expect(onSelected).toHaveBeenCalledTimes(1)
    expect(spaceEvent.defaultPrevented).toBe(true)

    el.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true, cancelable: true }))
    expect(onSelected).toHaveBeenCalledTimes(1)
  })

  it('renders the icon when given, nothing when absent', () => {
    expect(mount({ icon: ICON }).el.querySelector('svg.svg-full')).not.toBeNull()
    expect(mount().el.querySelector('.content')).toBeNull()
  })

  it('is tab-focusable and passes id through', () => {
    const { el } = mount({ id: 'circ1' })
    expect(el.getAttribute('tabindex')).toBe('0')
    expect(el.id).toBe('circ1')
  })

  it('forwards mousemove', () => {
    const { el, component } = mount()
    const onMove = vi.fn()
    component.$on('mousemove', onMove)
    el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
    expect(onMove).toHaveBeenCalledTimes(1)
  })
})
