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
import DropdownRecord from '../components/DropdownRecord.svelte'
import ui from '../plugin'

let target: HTMLElement

function mount (props: Partial<ComponentProps<DropdownRecord>> = {}): { component: DropdownRecord, root: HTMLElement } {
  const host = document.createElement('div')
  target.appendChild(host)
  const merged = {
    items: { a: 'Item A' as any, b: 'Item B' as any },
    ...props
  }
  const component = new DropdownRecord({ target: host, props: merged as ComponentProps<DropdownRecord> })
  return { component, root: host }
}

describe('DropdownRecord', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders a button', () => {
    const { root } = mount()
    expect(root.querySelector('button')).not.toBeNull()
  })

  it('displays the selected label', () => {
    const { root } = mount({ selected: 'a' })
    expect(root.textContent).toContain('Item A')
  })

  it('displays NotSelected when nothing selected', () => {
    const { root } = mount()
    // Label falls back to the raw IntlString key without a cached translation
    expect(root.textContent).toContain(ui.string.NotSelected)
  })
})
