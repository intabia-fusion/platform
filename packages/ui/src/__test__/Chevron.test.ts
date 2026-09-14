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
import Chevron from '../components/Chevron.svelte'

let target: HTMLElement

function mount (props: Partial<ComponentProps<Chevron>> = {}): { component: Chevron, root: HTMLElement } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new Chevron({ target: host, props: props as ComponentProps<Chevron> })
  return { component, root: host }
}

describe('Chevron', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders with size and direction classes', () => {
    const { root } = mount({ size: 'small', direction: 'left' })
    const el = root.querySelector('.chevron')
    expect(el?.classList.contains('small')).toBe(true)
    expect(el?.classList.contains('left')).toBe(true)
  })

  it('defaults to medium and right', () => {
    const { root } = mount()
    const el = root.querySelector('.chevron')
    expect(el?.classList.contains('medium')).toBe(true)
    expect(el?.classList.contains('right')).toBe(true)
  })

  it('adds the expanded class when expanded is true', () => {
    const { root } = mount({ expanded: true })
    expect(root.querySelector('.chevron')?.classList.contains('expanded')).toBe(true)
  })

  it('renders outline icon when outline is true', () => {
    const { root } = mount({ outline: true })
    expect(root.querySelector('.chevron')?.classList.contains('outline')).toBe(true)
    expect(root.querySelector('svg')).not.toBeNull()
  })

  it('applies custom margin right', () => {
    const { root } = mount({ marginRight: '4px' })
    const el = root.querySelector('.chevron') as HTMLElement
    expect(el.style.marginRight).toBe('4px')
  })

  it('toggles expanded class reactively', async () => {
    const { component, root } = mount({ expanded: false })
    const el = root.querySelector('.chevron')
    expect(el?.classList.contains('expanded')).toBe(false)

    component.$set({ expanded: true })
    await tick()
    expect(el?.classList.contains('expanded')).toBe(true)
  })
})
