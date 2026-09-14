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
import WorkspaceLogo from '../components/WorkspaceLogo.svelte'

let target: HTMLElement

function mount (props: Partial<ComponentProps<WorkspaceLogo>> = {}): { component: WorkspaceLogo, root: HTMLElement } {
  const host = document.createElement('div')
  target.appendChild(host)
  const merged = { name: 'Test', ...props }
  const component = new WorkspaceLogo({ target: host, props: merged as ComponentProps<WorkspaceLogo> })
  return { component, root: host }
}

describe('WorkspaceLogo', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders the first letter of the name as uppercase text', () => {
    const { root } = mount({ name: 'alpha' })
    const logo = root.querySelector('.antiLogo')
    expect(logo?.textContent).toBe('A')
  })

  it('renders an img when logoUrl is provided', () => {
    const { root } = mount({ name: 'x', logoUrl: '/logo.png' })
    expect(root.querySelector('img')).not.toBeNull()
    expect(root.querySelector('.antiLogo')).toBeNull()
  })

  it('applies mini and accent classes', () => {
    const { root } = mount({ name: 'x', mini: true, accent: true })
    const logo = root.querySelector('.antiLogo')
    expect(logo?.classList.contains('mini')).toBe(true)
    expect(logo?.classList.contains('accent')).toBe(true)
  })

  it('shows a notification dot when notify is true', () => {
    const { root } = mount({ name: 'x', notify: true })
    expect(root.querySelector('.notification')).not.toBeNull()
  })

  it('hides the notification dot when notify is false', () => {
    const { root } = mount({ name: 'x', notify: false })
    expect(root.querySelector('.notification')).toBeNull()
  })

  it('switches from text logo to image reactively', async () => {
    const { component, root } = mount({ name: 'x' })
    expect(root.querySelector('.antiLogo')).not.toBeNull()

    component.$set({ logoUrl: '/logo.png' })
    await tick()
    expect(root.querySelector('img')).not.toBeNull()
    expect(root.querySelector('.antiLogo')).toBeNull()
  })
})
