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
import HotkeyGroup from '../components/HotkeyGroup.svelte'

let target: HTMLElement

function mount (props: Partial<ComponentProps<HotkeyGroup>> = {}): { component: HotkeyGroup, root: HTMLElement } {
  const host = document.createElement('div')
  target.appendChild(host)
  const merged = { keys: ['Ctrl', 'A'], ...props }
  const component = new HotkeyGroup({ target: host, props: merged as ComponentProps<HotkeyGroup> })
  return { component, root: host }
}

describe('HotkeyGroup', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders a hotkey per key', () => {
    const { root } = mount({ keys: ['Shift', 'Enter', 'Tab'] })
    const spans = root.querySelectorAll('.hotkey')
    expect(spans.length).toBe(3)
  })

  it('renders nothing for empty keys', () => {
    const { root } = mount({ keys: [] })
    expect(root.querySelectorAll('.hotkey').length).toBe(0)
  })
})
