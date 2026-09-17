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
import BooleanIcon from '../components/BooleanIcon.svelte'

let target: HTMLElement

function mount (props: Partial<ComponentProps<BooleanIcon>> = {}): { component: BooleanIcon, root: HTMLElement } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new BooleanIcon({ target: host, props: props as ComponentProps<BooleanIcon> })
  return { component, root: host }
}

describe('BooleanIcon', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('adds yes class for true', () => {
    const { root } = mount({ value: true })
    const el = root.querySelector('.container')
    expect(el?.classList.contains('yes')).toBe(true)
    expect(el?.classList.contains('no')).toBe(false)
  })

  it('adds no class for false', () => {
    const { root } = mount({ value: false })
    const el = root.querySelector('.container')
    expect(el?.classList.contains('no')).toBe(true)
    expect(el?.classList.contains('yes')).toBe(false)
  })

  it('adds neither yes nor no for non-boolean', () => {
    const { root } = mount({ value: undefined })
    const el = root.querySelector('.container')
    expect(el?.classList.contains('yes')).toBe(false)
    expect(el?.classList.contains('no')).toBe(false)
  })

  it('switches class reactively', async () => {
    const { component, root } = mount({ value: false })
    const el = root.querySelector('.container')
    expect(el?.classList.contains('no')).toBe(true)

    component.$set({ value: true })
    await tick()
    expect(el?.classList.contains('yes')).toBe(true)
    expect(el?.classList.contains('no')).toBe(false)
  })

  it('renders an svg with a circle', () => {
    const { root } = mount({ value: true })
    const svg = root.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg?.querySelector('circle')).not.toBeNull()
  })
})
