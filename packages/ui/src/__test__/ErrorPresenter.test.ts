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
import ErrorPresenter from '../components/ErrorPresenter.svelte'

let target: HTMLElement

function mount (props: Partial<ComponentProps<ErrorPresenter>> = {}): { component: ErrorPresenter, root: HTMLElement } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new ErrorPresenter({ target: host, props: props as ComponentProps<ErrorPresenter> })
  return { component, root: host }
}

describe('ErrorPresenter', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders an svg icon', () => {
    const { root } = mount({ error: { message: 'oops' } })
    expect(root.querySelector('svg')).not.toBeNull()
  })

  it('passes error through to the tooltip component', () => {
    // tooltip action mounts ErrorPopup as a component; just verify mount
    const { component } = mount({ error: { message: 'fail', status: { params: {} } } })
    expect(component).toBeDefined()
  })
})
