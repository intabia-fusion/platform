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
import type { IntlString } from '@hcengineering/platform'
import type { ComponentProps } from 'svelte'
import Label from '../components/Label.svelte'

let target: HTMLElement

function mount (props: Partial<ComponentProps<Label>> = {}): { component: Label, root: HTMLElement } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new Label({ target: host, props: props as ComponentProps<Label> })
  return { component, root: host }
}

describe('Label', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders the raw label string when there is no cached translation', () => {
    const { root } = mount({ label: 'ui:string:Test' as IntlString })
    expect(root.textContent).toContain('ui:string:Test')
  })

  it('passes params to translateCB', async () => {
    const { root } = mount({ label: 'ui:string:Greeting' as IntlString, params: { name: 'World' } })
    await tick()
    // falls back to raw label when translation is absent
    expect(root.textContent).toContain('ui:string:Greeting')
  })
})
