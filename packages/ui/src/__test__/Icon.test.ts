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
import Icon from '../components/Icon.svelte'
import IconCheck from '../components/icons/Check.svelte'

const ASSET_ICON = 'ui:icon:Check' as Asset

let target: HTMLElement

function mount (props: Partial<ComponentProps<Icon>> = {}): { component: Icon, root: HTMLElement } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new Icon({ target: host, props: props as ComponentProps<Icon> })
  return { component, root: host }
}

describe('Icon', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders an svg with use href for an Asset icon', () => {
    const { root } = mount({ icon: ASSET_ICON, size: 'small' })
    const svg = root.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg?.querySelector('use')).not.toBeNull()
  })

  it('applies the size class to the svg', () => {
    const { root } = mount({ icon: ASSET_ICON, size: 'medium' })
    expect(root.querySelector('svg')?.classList.contains('svg-medium')).toBe(true)
  })

  it('uses the default fill when not overridden', () => {
    const { root } = mount({ icon: ASSET_ICON, size: 'small' })
    const svg = root.querySelector('svg')
    expect(svg?.getAttribute('fill')).toBe('currentColor')
  })

  it('renders a svelte component icon instead of svg use', () => {
    const { root } = mount({ icon: IconCheck, size: 'small' })
    expect(root.querySelector('svg')).not.toBeNull()
  })

  it('applies iconProps fill over the default', () => {
    const { root } = mount({ icon: ASSET_ICON, size: 'small', iconProps: { fill: 'red' } })
    const svg = root.querySelector('svg')
    expect(svg?.getAttribute('fill')).toBe('red')
  })
})
