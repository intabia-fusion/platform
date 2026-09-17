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
import type { ComponentProps } from 'svelte'
import HeaderButton from '../components/HeaderButton.svelte'

let target: HTMLElement

function mount (props: Partial<ComponentProps<HeaderButton>> = {}): { component: HeaderButton, root: HTMLElement } {
  const host = document.createElement('div')
  target.appendChild(host)
  const merged = {
    client: {} as any,
    actions: [],
    visibleActions: [],
    ...props
  }
  const component = new HeaderButton({ target: host, props: merged as ComponentProps<HeaderButton> })
  return { component, root: host }
}

describe('HeaderButton', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders nothing when there are no actions', async () => {
    const { root } = mount()
    await new Promise((r) => setTimeout(r, 10))
    expect(root.querySelector('button')).toBeNull()
  })

  it('renders a button when an allowed action matches visibleActions', async () => {
    const actions = [{ id: 'create', label: 'Create', callback: () => {} }] as any[]
    const { root } = mount({ actions, visibleActions: ['create'], mainActionId: 'create' })
    await vi.waitFor(() => expect(root.querySelector('button')).not.toBeNull())
  })
})
