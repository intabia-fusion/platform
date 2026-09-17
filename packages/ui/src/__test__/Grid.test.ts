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
import Grid from '../components/Grid.svelte'

let target: HTMLElement

function mount (props: Partial<ComponentProps<Grid>> = {}): { component: Grid, root: HTMLElement, grid: HTMLElement } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new Grid({ target: host, props: props as ComponentProps<Grid> })
  const grid = host.querySelector('.grid') as HTMLElement
  return { component, root: host, grid }
}

describe('Grid', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders a grid div', () => {
    const { grid } = mount()
    expect(grid).not.toBeNull()
  })

  it('applies custom grid-template-columns', () => {
    const { grid } = mount({ column: 3 })
    expect(grid.style.gridTemplateColumns).toBe('repeat(3, 1fr)')
  })

  it('defaults to 2 columns', () => {
    const { grid } = mount()
    expect(grid.style.gridTemplateColumns).toBe('repeat(2, 1fr)')
  })

  it('applies equalHeight style', () => {
    const { grid } = mount({ equalHeight: true })
    expect(grid.style.cssText).toContain('grid-auto-rows: 1fr')
  })

  it('applies topGap margin when asked', () => {
    const { grid } = mount({ topGap: true, rowGap: 3 })
    expect(grid.style.marginTop).toBe('3rem')
  })

  it('sets align-items', () => {
    const { grid } = mount({ alignItems: 'end' })
    expect(grid.style.alignItems).toBe('end')
  })
})
