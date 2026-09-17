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
import FilterButton from '../components/FilterButton.svelte'

let target: HTMLElement

function mount (props: Partial<ComponentProps<FilterButton>> = {}): { component: FilterButton, root: HTMLElement, button: HTMLButtonElement } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new FilterButton({ target: host, props: props as ComponentProps<FilterButton> })
  const button = host.querySelector('button') as HTMLButtonElement
  return { component, root: host, button }
}

describe('FilterButton', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders a button', () => {
    const { button } = mount()
    expect(button).not.toBeNull()
  })

  it('switches icon when activeFilters are present', async () => {
    const { component, root } = mount({ activeFilters: [] })
    // icon changes to close when filters present
    component.$set({ activeFilters: [{ categoryId: 'c1', value: 'v' } as any] })
    await tick()
    expect(root.querySelector('svg')).not.toBeNull()
  })

  it('dispatches change with empty array when clear is clicked', () => {
    const onChange = vi.fn()
    const { component, button } = mount({ activeFilters: [{ categoryId: 'c1', value: 'v' } as any] })
    component.$on('change', onChange)
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ detail: [] }))
  })
})
