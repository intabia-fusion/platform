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
import type { ComponentProps } from 'svelte'
import Fold from '../components/Fold.svelte'

let target: HTMLElement

function mount (props: Partial<ComponentProps<Fold>>): { root: HTMLElement, component: Fold } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new Fold({ target: host, props: props as ComponentProps<Fold> })
  return { root: host.querySelector('.hulyFold-container') as HTMLElement, component }
}

describe('Fold', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('is opened only when isOpen is true and not empty', () => {
    expect(mount({ isOpen: true }).root.classList.contains('opened')).toBe(true)
    expect(mount({ isOpen: false }).root.classList.contains('opened')).toBe(false)
  })

  // empty forces the closed (dot) state regardless of isOpen.
  it('stays closed when empty, even if isOpen is true', () => {
    expect(mount({ isOpen: true, empty: true }).root.classList.contains('opened')).toBe(false)
  })

  it('switches the icon path between the arrow and the empty dot', () => {
    const arrow = mount({ isOpen: false, empty: false }).root.querySelector('path') as SVGPathElement
    const dot = mount({ isOpen: false, empty: true }).root.querySelector('path') as SVGPathElement
    expect(arrow.getAttribute('d')).not.toBe(dot.getAttribute('d'))
  })

  it('indents by level * 1.5rem, and has no offset at level 0', () => {
    expect(mount({ isOpen: false }).root.style.marginLeft).toBe('0rem')
    expect(mount({ isOpen: false, level: 2 }).root.style.marginLeft).toBe('3rem')
  })

  it('reacts to isOpen changing after mount', async () => {
    const { root, component } = mount({ isOpen: false })
    expect(root.classList.contains('opened')).toBe(false)
    component.$set({ isOpen: true })
    await tick()
    expect(root.classList.contains('opened')).toBe(true)
  })
})
