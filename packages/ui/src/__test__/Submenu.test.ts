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
import type { Asset } from '@hcengineering/platform'
import type { ComponentProps } from 'svelte'
import Submenu from '../components/Submenu.svelte'

let target: HTMLElement

function mount (props: Partial<ComponentProps<Submenu>> = {}): { component: Submenu, root: HTMLElement } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new Submenu({ target: host, props: props as ComponentProps<Submenu> })
  return { component, root: host }
}

describe('Submenu', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders text content when text is provided', () => {
    const { root } = mount({ text: 'File' })
    expect(root.textContent).toContain('File')
  })

  it('renders withHover class', () => {
    const { root } = mount({ withHover: true })
    expect(root.querySelector('.antiPopup-submenu')?.classList.contains('withHover')).toBe(true)
  })

  it('applies withoutMargin class', () => {
    const { root } = mount({ withoutMargin: true })
    expect(root.querySelector('.antiPopup-submenu')?.classList.contains('withoutMargin')).toBe(true)
  })

  it('renders an icon when provided', () => {
    const { root } = mount({ icon: 'ui:icon:Check' as Asset })
    expect(root.querySelector('svg')).not.toBeNull()
  })
})
