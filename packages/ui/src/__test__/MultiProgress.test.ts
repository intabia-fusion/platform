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
import { get } from 'svelte/store'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { themeStore } from '@hcengineering/theme'
import type { ComponentProps } from 'svelte'
import MultiProgress from '../components/MultiProgress.svelte'
import { getPlatformColor } from '../colors'

let target: HTMLElement

interface Progress {
  value: number
  color: number
}

function mount (props: Partial<ComponentProps<MultiProgress>>): { host: HTMLElement, component: MultiProgress } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new MultiProgress({ target: host, props: props as ComponentProps<MultiProgress> })
  return { host, component }
}

function bars (host: HTMLElement): HTMLElement[] {
  return Array.from(host.querySelectorAll('.bar'))
}

// jsdom normalizes a style attribute into its CSSOM form (hex -> rgb(), calc() arithmetic folded),
// so compare against what jsdom itself produces for the expected hex rather than the raw hex string.
function color (i: number): string {
  const probe = document.createElement('div')
  probe.style.backgroundColor = getPlatformColor(i, get(themeStore).dark)
  return probe.style.backgroundColor
}

describe('MultiProgress', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders a bar per item, showing its value text and color', () => {
    const values: Progress[] = [{ value: 30, color: 0 }]
    const { host } = mount({ values })
    const bar = bars(host)
    expect(bar).toHaveLength(1)
    expect(bar[0].textContent?.trim()).toBe('30')
    expect(bar[0].style.backgroundColor).toBe(color(0))
  })

  it('filters out items at or below min', () => {
    const values: Progress[] = [
      { value: 0, color: 0 },
      { value: 10, color: 1 }
    ]
    const { host } = mount({ values, min: 0 })
    expect(bars(host)).toHaveLength(1)
    expect(bars(host)[0].textContent?.trim()).toBe('10')
  })

  it('marks a single bar as both first and last', () => {
    const { host } = mount({ values: [{ value: 10, color: 0 }] })
    const bar = bars(host)[0]
    expect(bar.classList.contains('first')).toBe(true)
    expect(bar.classList.contains('last')).toBe(true)
  })

  it('marks only the first and last of several bars', () => {
    const values: Progress[] = [
      { value: 10, color: 0 },
      { value: 10, color: 1 },
      { value: 10, color: 2 }
    ]
    const { host } = mount({ values })
    const [b0, b1, b2] = bars(host)
    expect(b0.classList.contains('first')).toBe(true)
    expect(b0.classList.contains('last')).toBe(false)
    expect(b1.classList.contains('first')).toBe(false)
    expect(b1.classList.contains('last')).toBe(false)
    expect(b2.classList.contains('first')).toBe(false)
    expect(b2.classList.contains('last')).toBe(true)
  })

  it('sizes each bar from its share of min..max, and offsets by the sum of the previous widths', () => {
    const values: Progress[] = [
      { value: 30, color: 0 },
      { value: 20, color: 1 }
    ]
    const { host } = mount({ values, min: 0, max: 100 })
    const [b0, b1] = bars(host)
    expect(b0.style.left).toBe('0%')
    expect(b0.style.width).toBe('calc(30%)')
    expect(b1.style.left).toBe('30%')
    expect(b1.style.width).toBe('calc(20%)')
  })

  it('clamps a value above max down to max width', () => {
    const values: Progress[] = [{ value: 150, color: 0 }]
    const { host } = mount({ values, min: 0, max: 100 })
    expect(bars(host)[0].style.width).toBe('calc(100%)')
  })

  it('recomputes bars when values is replaced', async () => {
    const { host, component } = mount({ values: [{ value: 10, color: 0 }] })
    expect(bars(host)).toHaveLength(1)

    component.$set({
      values: [
        { value: 10, color: 0 },
        { value: 20, color: 1 }
      ]
    })
    await tick()
    expect(bars(host)).toHaveLength(2)
  })

  it('renders nothing when values is empty', () => {
    const { host } = mount({ values: [] })
    expect(bars(host)).toHaveLength(0)
  })

  // Source bug: when min === max, proc is 0 and getWidth is never called for that bar (see the
  // `proc !== 0 ? getWidth(...) : 0` guard), so `width[i]` stays unset. getLeft then sums an
  // undefined into `res`, producing `left: NaN%` for every bar after the first - an invalid CSS
  // value, which jsdom then drops from the style entirely (`style.left` reads back as ''). Pinned
  // as current behaviour, not a desired one.
  it('pinned bug: min === max leaves every bar after the first with no left offset', () => {
    const values: Progress[] = [
      { value: 20, color: 0 },
      { value: 20, color: 1 }
    ]
    const { host } = mount({ values, min: 10, max: 10 })
    const [b0, b1] = bars(host)
    expect(b0.style.left).toBe('0%')
    expect(b1.style.left).toBe('')
  })
})
