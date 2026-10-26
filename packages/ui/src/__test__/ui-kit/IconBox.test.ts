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

import type { Asset } from '@hcengineering/platform'
import { themeStore, ThemeOptions } from '@hcengineering/theme'
import { tick, type ComponentProps } from 'svelte'
import { get } from 'svelte/store'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import IconBox from '../../ui-kit/icon-box/IconBox.svelte'

const ICON = 'ui:icon:Settings' as Asset

let target: HTMLElement
const mounted: Array<{ $destroy: () => void }> = []

function mount (props: ComponentProps<IconBox>): { box: HTMLElement, component: IconBox } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new IconBox({ target: host, props })
  mounted.push(component)
  return { box: host.querySelector('.icon-box') as HTMLElement, component }
}

describe('ui-kit IconBox', () => {
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

  it('is a decorative, non-focusable box with a small icon', () => {
    const { box } = mount({ icon: ICON })
    expect(box.tagName).toBe('SPAN')
    expect(box.getAttribute('aria-hidden')).toBe('true')
    expect(box.hasAttribute('tabindex')).toBe(false)
    expect(box.querySelector('button')).toBeNull()
    expect(box.querySelector('svg.svg-small')).not.toBeNull()
  })

  it('is small by default and falls back to it when size becomes undefined', async () => {
    const { box, component } = mount({ icon: ICON, size: 'large' })
    expect(box.classList.contains('icon-box--large')).toBe(true)
    component.$set({ size: undefined })
    await Promise.resolve()
    expect(box.classList.contains('icon-box--small')).toBe(true)
  })

  it('is rectangular by default and round with shape round', async () => {
    const { box, component } = mount({ icon: ICON })
    expect(box.classList.contains('icon-box--round')).toBe(false)
    component.$set({ shape: 'round' })
    await Promise.resolve()
    expect(box.classList.contains('icon-box--round')).toBe(true)
  })

  it('keeps the button look without a color and for a name outside the palette', () => {
    for (const color of [undefined, 'NoSuchColor']) {
      const { box } = mount({ icon: ICON, color })
      expect(box.classList.contains('icon-box--tinted')).toBe(false)
      expect(box.style.getPropertyValue('--_tint-background')).toBe('')
    }
  })

  it('tints the plate and the icon by a palette color, stronger on a dark theme', async () => {
    const theme = get(themeStore)
    themeStore.set(new ThemeOptions(theme.fontSize, false, theme.language, theme.emoji, theme.accent))
    const { box } = mount({ icon: ICON, color: 'Firework' })
    await tick()
    expect(box.classList.contains('icon-box--tinted')).toBe(true)
    expect(box.style.getPropertyValue('--_tint-color')).toContain('82%')
    expect(box.style.getPropertyValue('--_tint-background')).toContain('14%')
    themeStore.set(new ThemeOptions(theme.fontSize, true, theme.language, theme.emoji, theme.accent))
    await tick()
    expect(box.style.getPropertyValue('--_tint-background')).toContain('26%')
    themeStore.set(theme)
  })

  it('draws the icon by iconSize at any box size', () => {
    const { box } = mount({ icon: ICON, size: 'large', iconSize: 'large' })
    expect(box.classList.contains('icon-box--large')).toBe(true)
    expect(box.querySelector('svg.svg-large')).not.toBeNull()
  })
})
