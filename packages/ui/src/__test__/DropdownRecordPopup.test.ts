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
import DropdownRecordPopup from '../components/DropdownRecordPopup.svelte'

let target: HTMLElement

function mount (props: Partial<ComponentProps<DropdownRecordPopup>> = {}): { component: DropdownRecordPopup, root: HTMLElement } {
  const host = document.createElement('div')
  target.appendChild(host)
  const merged = {
    items: { a: 'Item A' as any, b: 'Item B' as any },
    selected: 'a',
    ...props
  }
  const component = new DropdownRecordPopup({ target: host, props: merged as ComponentProps<DropdownRecordPopup> })
  return { component, root: host }
}

describe('DropdownRecordPopup', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders selectPopup container', () => {
    const { root } = mount()
    expect(root.querySelector('.selectPopup')).not.toBeNull()
  })

  it('renders a menu-item per entry', () => {
    const { root } = mount()
    expect(root.querySelectorAll('.menu-item').length).toBe(2)
  })

  it('shows check next to selected item', () => {
    const { root } = mount()
    // the CheckBox label also carries the 'check' symbol class, so restrict to divs
    expect(root.querySelectorAll('div.check').length).toBe(1)
  })
})
