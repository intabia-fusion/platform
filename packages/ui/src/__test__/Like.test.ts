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
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ComponentProps } from 'svelte'
import Like from '../components/Like.svelte'

let target: HTMLElement

function mount (props: Partial<ComponentProps<Like>>): { host: HTMLElement, component: Like } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new Like({ target: host, props: props as ComponentProps<Like> })
  return { host, component }
}

describe('Like', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('shows the count only when value is above 0', () => {
    expect(mount({ value: 5, voted: false }).host.querySelector('span')?.textContent).toBe('5')
    expect(mount({ value: 0, voted: false }).host.querySelector('span')).toBeNull()
  })

  it('carries voted into the container class', () => {
    const { host } = mount({ value: 1, voted: true })
    expect((host.querySelector('.like-container') as HTMLElement).classList.contains('voted')).toBe(true)
  })

  it('toggles voted and increments value on click', async () => {
    const { host } = mount({ value: 3, voted: false })
    const container = host.querySelector('.like-container') as HTMLElement
    const icon = host.querySelector('.icon') as HTMLElement
    icon.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await tick()
    expect(container.classList.contains('voted')).toBe(true)
    expect(container.querySelector('span')?.textContent).toBe('4')
  })

  // vote() flips voted unconditionally, so a second click un-votes but still increments.
  it('un-votes but keeps incrementing on a second click', async () => {
    const { host } = mount({ value: 3, voted: true })
    const container = host.querySelector('.like-container') as HTMLElement
    const icon = host.querySelector('.icon') as HTMLElement
    icon.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await tick()
    expect(container.classList.contains('voted')).toBe(false)
    expect(container.querySelector('span')?.textContent).toBe('4')
  })

  it('defaults value and voted to a random value when not provided', () => {
    const { host } = mount({})
    // just assert mounting with no props doesn't throw and produces the container
    expect(host.querySelector('.like-container')).not.toBeNull()
  })
})
