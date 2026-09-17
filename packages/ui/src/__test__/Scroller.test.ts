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
import Scroller from '../components/Scroller.svelte'

let target: HTMLElement

function mount (props: Partial<ComponentProps<Scroller>> = {}): { component: Scroller, root: HTMLElement } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new Scroller({ target: host, props: props as ComponentProps<Scroller> })
  return { component, root: host }
}

describe('Scroller', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('mounts without error', () => {
    const { root } = mount()
    expect(root.querySelector('.scroller-container')).not.toBeNull()
  })

  it('applies horizontal content direction class', () => {
    const { root } = mount({ contentDirection: 'horizontal' })
    expect(root.querySelector('.scroller-container')?.classList.contains('horizontal')).toBe(true)
  })
})
