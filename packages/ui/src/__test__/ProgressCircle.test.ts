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
import ProgressCircle from '../components/ProgressCircle.svelte'
import { getPlatformColor } from '../colors'

let target: HTMLElement

// Mirrors the component's own constant, to compute expected offsets from a hand-run scenario.
const lenghtC = Math.PI * 14 - 1

function mount (props: Record<string, unknown>): { host: HTMLElement, component: ProgressCircle, circles: SVGCircleElement[] } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new ProgressCircle({ target: host, props })
  return { host, component, circles: Array.from(host.querySelectorAll('circle')) }
}

function styleNum (el: Element, prop: string): number {
  const style = el.getAttribute('style') ?? ''
  const m = style.match(new RegExp(`${prop}:\\s*(-?[\\d.]+)`))
  return m !== null ? parseFloat(m[1]) : NaN
}

function rotateDeg (el: Element): number {
  const style = el.getAttribute('style') ?? ''
  const m = style.match(/rotate\((-?[\d.]+)deg\)/)
  return m !== null ? parseFloat(m[1]) : NaN
}

function dashOffsetOf (value: number, min: number, max: number): number {
  const procC = lenghtC / (max - min)
  return (value - min) * procC
}

describe('ProgressCircle', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('carries size in the svg class, defaulting to small', () => {
    expect(mount({ value: 10 }).host.querySelector('svg')?.classList.contains('svg-small')).toBe(true)
    expect(mount({ value: 10, size: 'large' }).host.querySelector('svg')?.classList.contains('svg-large')).toBe(true)
  })

  it('renders two circles: a fixed track and a progress ring', () => {
    const { circles } = mount({ value: 50 })
    expect(circles).toHaveLength(2)
    expect(circles[0].getAttribute('style')).toContain('stroke: var(--theme-divider-color)')
    expect(circles[0].getAttribute('style')).toContain('opacity: 0.5')
    expect(styleNum(circles[0], 'stroke-dasharray')).toBeCloseTo(lenghtC)
    expect(styleNum(circles[1], 'stroke-dasharray')).toBeCloseTo(lenghtC)
  })

  it('computes dash offsets and rotation from value/min/max at a mid-range value', () => {
    const { circles } = mount({ value: 50, min: 0, max: 100 })
    const dashOffset = dashOffsetOf(50, 0, 100)
    expect(rotateDeg(circles[0])).toBeCloseTo(-78 + ((dashOffset + 1) * 360) / (lenghtC + 1))
    expect(styleNum(circles[0], 'stroke-dashoffset')).toBeCloseTo(dashOffset + 3)
    expect(rotateDeg(circles[1])).toBeCloseTo(-82)
    expect(styleNum(circles[1], 'stroke-dashoffset')).toBeCloseTo(lenghtC - dashOffset + 1)
    expect(circles[1].getAttribute('style')).toContain('opacity: 1')
  })

  it('hides the progress ring and zeroes the track offset when value equals min', () => {
    const { circles } = mount({ value: 0, min: 0, max: 100 })
    expect(styleNum(circles[0], 'stroke-dashoffset')).toBe(0)
    expect(circles[1].getAttribute('style')).toContain('opacity: 0')
    expect(styleNum(circles[1], 'stroke-dashoffset')).toBeCloseTo(lenghtC)
  })

  it('leaves the progress ring at a 1px offset when value equals max', () => {
    const { circles } = mount({ value: 100, min: 0, max: 100 })
    expect(styleNum(circles[1], 'stroke-dashoffset')).toBeCloseTo(1)
    expect(circles[1].getAttribute('style')).toContain('opacity: 1')
  })

  it('strokes the progress ring with the platform color for the given color index', () => {
    const { circles } = mount({ value: 50, color: 5 })
    expect(circles[1].getAttribute('style')).toContain(`stroke: ${getPlatformColor(5, get(themeStore).dark)}`)
  })

  it('strokes the progress ring with the primary color when primary is set, ignoring color', () => {
    const { circles } = mount({ value: 50, color: 5, primary: true })
    expect(circles[1].getAttribute('style')).toContain('stroke: var(--primary-bg-color)')
  })

  it('clamps an out-of-range initial value to min/max before computing the offset', () => {
    const above = mount({ value: 500, min: 0, max: 100 })
    expect(styleNum(above.circles[1], 'stroke-dashoffset')).toBeCloseTo(1) // clamped to max=100

    const below = mount({ value: -50, min: 0, max: 100 })
    expect(styleNum(below.circles[1], 'stroke-dashoffset')).toBeCloseTo(lenghtC) // clamped to min=0
  })

  // Source bug: the `if (value > max) value = max` / `if (value < min) value = min` clamp runs once
  // at component init, not inside a `$:` reactive block. A later prop update skips it entirely, so
  // dashOffset (and stroke-dashoffset) can go outside the valid [0, lenghtC] range. Pinned as current
  // behaviour, not a desired one.
  it('pinned bug: a later out-of-range $set is not reclamped', async () => {
    const { component, circles } = mount({ value: 50, min: 0, max: 100 })

    component.$set({ value: 500 })
    await tick()
    expect(styleNum(circles[1], 'stroke-dashoffset')).toBeCloseTo(lenghtC - dashOffsetOf(500, 0, 100) + 1)
    expect(styleNum(circles[1], 'stroke-dashoffset')).toBeLessThan(0)

    component.$set({ value: -50 })
    await tick()
    expect(styleNum(circles[1], 'stroke-dashoffset')).toBeCloseTo(lenghtC - dashOffsetOf(-50, 0, 100) + 1)
    expect(styleNum(circles[1], 'stroke-dashoffset')).toBeGreaterThan(lenghtC)
  })
})
