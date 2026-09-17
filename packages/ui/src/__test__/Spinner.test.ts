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

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ComponentProps } from 'svelte'
import Spinner from '../components/Spinner.svelte'

let target: HTMLElement

function mount (props: Partial<ComponentProps<Spinner>> = {}): { component: Spinner, root: HTMLElement } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new Spinner({ target: host, props: props as ComponentProps<Spinner> })
  return { component, root: host }
}

describe('Spinner', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders a spinner div with an svg', () => {
    const { root } = mount()
    expect(root.querySelector('.spinner')).not.toBeNull()
    expect(root.querySelector('svg')).not.toBeNull()
  })

  it('applies the size class', () => {
    const sizes = ['inline', 'small', 'medium', 'large', 'x-large']
    for (const size of sizes) {
      const { root } = mount({ size: size as any })
      expect(root.querySelector('.spinner')?.classList.contains(`spinner-${size}`)).toBe(true)
    }
  })

  it('defaults to medium size', () => {
    const { root } = mount()
    expect(root.querySelector('.spinner')?.classList.contains('spinner-medium')).toBe(true)
  })

  it('uses the accent color variant when asked', () => {
    const { root } = mount({ color: 'accent' })
    const svg = root.querySelector('svg')
    expect(svg).not.toBeNull()
  })
})
