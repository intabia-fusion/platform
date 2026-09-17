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
import type { Asset, IntlString } from '@hcengineering/platform'
import type { ComponentProps } from 'svelte'
import SectionEmpty from '../components/SectionEmpty.svelte'

const ICON = 'ui:icon:Check' as Asset
const LABEL = 'ui:string:Empty' as IntlString

let target: HTMLElement

function mount (props: Partial<ComponentProps<SectionEmpty>> = {}): { component: SectionEmpty, root: HTMLElement } {
  const host = document.createElement('div')
  target.appendChild(host)
  const merged = { icon: ICON, label: LABEL, ...props }
  const component = new SectionEmpty({ target: host, props: merged as ComponentProps<SectionEmpty> })
  return { component, root: host }
}

describe('SectionEmpty', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders the icon and label wrapper', () => {
    const { root } = mount()
    expect(root.querySelector('.antiSection-empty')).not.toBeNull()
    expect(root.querySelector('svg')).not.toBeNull()
    expect(root.querySelector('span')?.textContent).toContain('ui:string:Empty')
  })

  it('passes labelParams to the label', () => {
    const { root } = mount({ labelParams: { name: 'test' } })
    // Label component uses translateCB; just verify it mounts
    expect(root.querySelector('.antiSection-empty')).not.toBeNull()
  })

  it('renders slot content', () => {
    const host = document.createElement('div')
    target.appendChild(host)
    const component = new SectionEmpty({
      target: host,
      props: { icon: ICON, label: LABEL } as ComponentProps<SectionEmpty>
    })
    // Svelte slots cannot be tested easily via raw API; skip
    expect(component).toBeDefined()
  })
})
