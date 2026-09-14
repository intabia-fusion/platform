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
import type { IntlString } from '@hcengineering/platform'
import type { ComponentProps } from 'svelte'
import StateTag from '../components/StateTag.svelte'
import { StateType } from '../types'

let target: HTMLElement

function mount (props: Partial<ComponentProps<StateTag>> = {}): { component: StateTag, root: HTMLElement } {
  const host = document.createElement('div')
  target.appendChild(host)
  const merged = { type: StateType.Regular, label: 'ui:string:Ok' as IntlString, ...props }
  const component = new StateTag({ target: host, props: merged as ComponentProps<StateTag> })
  return { component, root: host }
}

describe('StateTag', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  const cases: Array<{ type: StateType; cls: string }> = [
    { type: StateType.Ghost, cls: 'ghost' },
    { type: StateType.Negative, cls: 'negative' },
    { type: StateType.Positive, cls: 'positive' },
    { type: StateType.Primary, cls: 'primary' },
    { type: StateType.Regular, cls: 'regular' }
  ]

  cases.forEach(({ type, cls }) => {
    it(`applies the ${cls} class`, () => {
      const { root } = mount({ type })
      expect(root.querySelector('.root')?.classList.contains(cls)).toBe(true)
    })
  })

  it('renders the label inside', () => {
    const { root } = mount({ label: 'ui:string:Test' as IntlString })
    expect(root.textContent).toContain('ui:string:Test')
  })
})
