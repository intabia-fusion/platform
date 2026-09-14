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
import Html from '../components/Html.svelte'

let target: HTMLElement

function mount (props: Partial<ComponentProps<Html>> = {}): { component: Html, root: HTMLElement } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new Html({ target: host, props: props as ComponentProps<Html> })
  return { component, root: host }
}

describe('Html', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders plain html', () => {
    const { root } = mount({ value: '<p>Hello</p>' })
    expect(root.innerHTML).toContain('<p>Hello</p>')
  })

  it('sanitizes dangerous tags', () => {
    const { root } = mount({ value: '<script>alert(1)</script><p>safe</p>' })
    expect(root.innerHTML).not.toContain('<script>')
    expect(root.innerHTML).toContain('<p>safe</p>')
  })

  it('sanitizes event handlers', () => {
    const { root } = mount({ value: '<p onclick="bad()">x</p>' })
    expect(root.innerHTML).not.toContain('onclick')
  })

  it('updates on value change', async () => {
    const { component, root } = mount({ value: '<b>first</b>' })
    expect(root.innerHTML).toContain('<b>first</b>')

    component.$set({ value: '<i>second</i>' })
    // allow reactive update
    await new Promise((r) => setTimeout(r, 10))
    expect(root.innerHTML).toContain('<i>second</i>')
  })
})
