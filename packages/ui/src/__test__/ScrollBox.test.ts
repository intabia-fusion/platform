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
import ScrollBox from '../components/ScrollBox.svelte'

let target: HTMLElement

function mount (props: Partial<ComponentProps<ScrollBox>> = {}): { component: ScrollBox, root: HTMLElement, scroll: HTMLElement, box: HTMLElement } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new ScrollBox({ target: host, props: props as ComponentProps<ScrollBox> })
  const scroll = host.querySelector('.scroll') as HTMLElement
  const box = host.querySelector('.box') as HTMLElement
  return { component, root: host, scroll, box }
}

describe('ScrollBox', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders scroll and box divs', () => {
    const { scroll, box } = mount()
    expect(scroll).not.toBeNull()
    expect(box).not.toBeNull()
  })

  it('applies vertical class', () => {
    const { scroll } = mount({ vertical: true })
    expect(scroll.classList.contains('vertical')).toBe(true)
  })

  it('applies bothScroll class', () => {
    const { scroll } = mount({ bothScroll: true })
    expect(scroll.classList.contains('bothScroll')).toBe(true)
  })

  it('applies noShift class', () => {
    const { scroll } = mount({ noShift: true })
    expect(scroll.classList.contains('noShift')).toBe(true)
  })

  it('applies stretch class to box', () => {
    const { box } = mount({ stretch: true })
    expect(box.classList.contains('stretch')).toBe(true)
  })
})
