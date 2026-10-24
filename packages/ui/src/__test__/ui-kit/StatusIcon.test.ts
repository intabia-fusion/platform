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

import { tick, type ComponentProps } from 'svelte'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import StatusIcon from '../../ui-kit/status-icon/StatusIcon.svelte'

let target: HTMLElement
const mounted: Array<{ $destroy: () => void }> = []

function mount (props: ComponentProps<StatusIcon>): { icon: HTMLElement, component: StatusIcon } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new StatusIcon({ target: host, props })
  mounted.push(component)
  return { icon: host.querySelector('.status-icon') as HTMLElement, component }
}

describe('ui-kit StatusIcon', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    mounted.splice(0).forEach((component) => {
      component.$destroy()
    })
    target.remove()
  })

  it('is a decorative small icon of its tone', () => {
    const { icon } = mount({ tone: 'positive' })
    expect(icon.getAttribute('aria-hidden')).toBe('true')
    expect(icon.hasAttribute('role')).toBe(false)
    expect(icon.classList.contains('status-icon--positive')).toBe(true)
    expect(icon.classList.contains('status-icon--small')).toBe(true)
    expect(icon.querySelector('svg .status-icon__glyph')).not.toBeNull()
  })

  it('draws a different glyph per tone', async () => {
    const { icon, component } = mount({ tone: 'positive' })
    const glyphs = new Set<string>()
    for (const tone of ['positive', 'negative', 'error', 'warning', 'info', 'neutral'] as const) {
      component.$set({ tone })
      await tick()
      const glyph = icon.querySelector('.status-icon__glyph') as SVGElement
      glyphs.add(glyph.getAttribute('points') ?? glyph.getAttribute('d') ?? '')
    }
    expect(glyphs.size).toBe(5)
  })

  it('is a named image with aria-label', () => {
    const { icon } = mount({ tone: 'negative', 'aria-label': 'Rejected' })
    expect(icon.getAttribute('role')).toBe('img')
    expect(icon.getAttribute('aria-label')).toBe('Rejected')
    expect(icon.hasAttribute('aria-hidden')).toBe(false)
  })

  it('is solid by default and draws an outline on request', async () => {
    const { icon, component } = mount({ tone: 'error' })
    expect(icon.classList.contains('status-icon--solid')).toBe(true)
    component.$set({ kind: 'outline' })
    await tick()
    expect(icon.classList.contains('status-icon--outline')).toBe(true)
    expect(icon.querySelector('svg .status-icon__glyph')).not.toBeNull()
  })

  it('draws a dot instead of the icon', () => {
    const { icon } = mount({ tone: 'warning', dot: true, size: 'medium' })
    expect(icon.classList.contains('status-icon--dot')).toBe(true)
    expect(icon.querySelector('.status-icon__dot')).not.toBeNull()
    expect(icon.querySelector('svg')).toBeNull()
  })

  it('follows aria-label and size set later', async () => {
    const { icon, component } = mount({ tone: 'info' })
    component.$set({ 'aria-label': 'Info', size: 'medium' })
    await tick()
    expect(icon.getAttribute('role')).toBe('img')
    expect(icon.hasAttribute('aria-hidden')).toBe(false)
    expect(icon.classList.contains('status-icon--medium')).toBe(true)
    component.$set({ 'aria-label': undefined, size: undefined })
    await tick()
    expect(icon.getAttribute('aria-hidden')).toBe('true')
    expect(icon.hasAttribute('role')).toBe(false)
    expect(icon.classList.contains('status-icon--small')).toBe(true)
  })
})
