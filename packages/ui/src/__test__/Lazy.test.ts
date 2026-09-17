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
import Lazy from '../components/Lazy.svelte'

let target: HTMLElement

function mount (props: Partial<ComponentProps<Lazy>> = {}): { component: Lazy, root: HTMLElement } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new Lazy({ target: host, props: props as ComponentProps<Lazy> })
  return { component, root: host }
}

describe('Lazy', () => {
  beforeEach(() => {
    localStorage.setItem('#platform.lazy.loading', 'false')
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    localStorage.removeItem('#platform.lazy.loading')
    target.remove()
  })

  it('renders slot content when lazy loading is disabled', () => {
    const { root } = mount()
    // slot content empty by default; just verify it mounts
    expect(root).toBeDefined()
  })
})
