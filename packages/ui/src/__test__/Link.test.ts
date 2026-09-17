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
import Link from '../components/Link.svelte'

let target: HTMLElement

const ICON = 'ui:icon:Check' as Asset

function mount (props: Partial<ComponentProps<Link>> = {}): { component: Link, root: HTMLElement } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new Link({ target: host, props: props as ComponentProps<Link> })
  return { component, root: host }
}

describe('Link', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders the label inside an over-underline div', () => {
    const { root } = mount({ label: 'hello-world.txt' })
    expect(root.querySelector('.over-underline')?.textContent).toBe('hello-world.txt')
  })

  it('trims long labels with ellipsis', () => {
    const { root } = mount({ label: 'a-very-long-file-name-that-exceeds-limit.txt', maxLenght: 20 })
    const text = root.querySelector('.over-underline')?.textContent ?? ''
    expect(text).toContain('...')
    expect(text.length).toBeLessThanOrEqual(21)
  })

  it('adds the disabled class and cursor when disabled', () => {
    const { root } = mount({ label: 'doc.pdf', disabled: true })
    const container = root.querySelector('.container')
    expect(container?.classList.contains('disabled')).toBe(true)
  })

  it('renders an icon when one is provided', () => {
    const { root } = mount({ label: 'x', icon: ICON })
    expect(root.querySelector('.icon')).not.toBeNull()
  })

  it('forwards click events', () => {
    const onClick = vi.fn()
    const { component, root } = mount({ label: 'x' })
    component.$on('click', onClick)
    root.querySelector('.container')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
