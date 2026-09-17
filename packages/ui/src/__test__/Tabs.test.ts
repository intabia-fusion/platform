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
import Tabs from '../components/Tabs.svelte'

const model = [
  { id: 'tab1', label: 'One' as any, component: 'div' as any, props: {} },
  { id: 'tab2', label: 'Two' as any, component: 'div' as any, props: {} }
]

let target: HTMLElement

function mount (props: Partial<ComponentProps<Tabs>> = {}): { component: Tabs, root: HTMLElement } {
  const host = document.createElement('div')
  target.appendChild(host)
  const merged = { model, ...props }
  const component = new Tabs({ target: host, props: merged as ComponentProps<Tabs> })
  return { component, root: host }
}

describe('Tabs', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders tab controls', () => {
    const { root } = mount()
    expect(root.querySelector('.tabs-container')).not.toBeNull()
  })

  it('renders no tabs when model is empty', () => {
    const { root } = mount({ model: [] })
    expect(root.querySelectorAll('.tab').length).toBe(0)
  })

  it('accepts selected index prop', () => {
    const { root } = mount({ selected: 1 })
    expect(root.querySelector('.tabs-container')).not.toBeNull()
  })
})
