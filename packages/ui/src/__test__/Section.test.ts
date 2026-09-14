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
import Section from '../components/Section.svelte'

const LABEL = 'ui:string:Ok' as IntlString
const ICON = 'ui:icon:Check' as Asset

let target: HTMLElement

function mount (props: Record<string, unknown> = {}): { root: HTMLElement, component: Section } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new Section({ target: host, props: { label: LABEL, ...props } })
  return { root: host.querySelector('.antiSection') as HTMLElement, component }
}

describe('Section', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('shows the header by default, with no icon', () => {
    const { root } = mount()
    expect(root.querySelector('.antiSection-header')).not.toBeNull()
    expect(root.querySelector('.antiSection-header__icon')).toBeNull()
  })

  it('renders the icon when one is given', () => {
    const { root } = mount({ icon: ICON })
    expect(root.querySelector('.antiSection-header__icon')).not.toBeNull()
  })

  it('hides the header when showHeader is false', () => {
    const { root } = mount({ showHeader: false })
    expect(root.querySelector('.antiSection-header')).toBeNull()
  })

  it('carries high, invisible and spaceBeforeContent onto the header classes', () => {
    const { root } = mount({ high: true, invisible: true, spaceBeforeContent: true })
    const header = root.querySelector('.antiSection-header') as HTMLElement
    expect(header.classList.contains('high')).toBe(true)
    expect(header.classList.contains('invisible')).toBe(true)
    expect(header.classList.contains('spaceBeforeContent')).toBe(true)
  })

  it('passes the id through to the root element', () => {
    const { root } = mount({ id: 'my-section' })
    expect(root.id).toBe('my-section')
  })
})
