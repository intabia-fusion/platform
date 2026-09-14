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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'svelte'
import ExpandCollapse from '../components/ExpandCollapse.svelte'

let target: HTMLElement

function mount (props: Partial<ComponentProps<ExpandCollapse>> = {}): { component: ExpandCollapse, root: HTMLElement, container: HTMLElement } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new ExpandCollapse({ target: host, props: props as ComponentProps<ExpandCollapse> })
  const container = host.querySelector('.expandcollapse-container') as HTMLElement
  return { component, root: host, container }
}

describe('ExpandCollapse', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('is hidden when isExpanded is false', () => {
    const { container } = mount({ isExpanded: false })
    expect(container.hidden).toBe(true)
  })

  it('is visible when isExpanded is true', () => {
    const { container } = mount({ isExpanded: true })
    expect(container.hidden).toBe(false)
  })

  it('toggles visibility reactively', async () => {
    const { component, container } = mount({ isExpanded: false })
    expect(container.hidden).toBe(true)

    component.$set({ isExpanded: true })
    await tick()
    expect(container.hidden).toBe(false)
  })

  it('dispatches changeContent after update', async () => {
    const onChange = vi.fn()
    const { component } = mount({ isExpanded: false })
    component.$on('changeContent', onChange)

    component.$set({ isExpanded: true })
    await tick()
    expect(onChange).toHaveBeenCalled()
  })
})
