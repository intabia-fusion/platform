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
import BarDashboard from '../components/BarDashboard.svelte'

let target: HTMLElement

function mount (props: Partial<ComponentProps<BarDashboard>> = {}): { component: BarDashboard, root: HTMLElement } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new BarDashboard({ target: host, props: props as ComponentProps<BarDashboard> })
  return { component, root: host }
}

describe('BarDashboard', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders nothing when items is empty', () => {
    const { root } = mount()
    expect(root.querySelector('.grid')?.children.length).toBe(0)
  })

  it('renders one label and one progress per item', () => {
    const items = [
      { _id: '1', label: 'A', values: [{ value: 5, color: 'red' }] },
      { _id: '2', label: 'B', values: [{ value: 3, color: 'blue' }] }
    ] as any[]
    const { root } = mount({ items })
    const grid = root.querySelector('.grid')
    expect(grid?.children.length).toBe(4) // 2 labels + 2 bars
    expect(root.textContent).toContain('A')
    expect(root.textContent).toContain('B')
  })
})
