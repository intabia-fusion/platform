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
import Hotkey from '../components/Hotkey.svelte'

let target: HTMLElement

function mount (props: Partial<ComponentProps<Hotkey>> = {}): { component: Hotkey, root: HTMLElement } {
  const host = document.createElement('div')
  target.appendChild(host)
  const merged = { key: 'A', ...props }
  const component = new Hotkey({ target: host, props: merged as ComponentProps<Hotkey> })
  return { component, root: host }
}

describe('Hotkey', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders the key text for unknown keys', () => {
    const { root } = mount({ key: 'X' })
    expect(root.textContent).toBe('X')
    expect(root.querySelector('span')?.classList.contains('text')).toBe(true)
  })

  it('renders an icon for predefined keys', () => {
    const { root } = mount({ key: 'shift' })
    expect(root.querySelector('svg')).not.toBeNull()
    expect(root.querySelector('span')?.classList.contains('text')).toBe(false)
  })

  it('renders command icon', () => {
    const { root } = mount({ key: 'command' })
    expect(root.querySelector('svg')).not.toBeNull()
  })
})
