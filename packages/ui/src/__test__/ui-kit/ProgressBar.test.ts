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

import ProgressBar from '../../ui-kit/progress-bar/ProgressBar.svelte'
import type { ProgressBarProps } from '../../ui-kit/progress-bar/types'

let target: HTMLElement
const mounted: Array<{ $destroy: () => void }> = []

function mount (props: ComponentProps<ProgressBar>): { bar: HTMLElement, component: ProgressBar } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new ProgressBar({ target: host, props })
  mounted.push(component)
  return { bar: host.querySelector('.progress-bar') as HTMLElement, component }
}

function widths (bar: HTMLElement): string[] {
  return Array.from(bar.querySelectorAll<HTMLElement>('.progress-bar__segment')).map((it) => it.style.width)
}

describe('ui-kit ProgressBar', () => {
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

  it('is a small brand progressbar with its value in range', () => {
    const { bar } = mount({ value: 30, 'aria-label': 'Storage' })
    expect(bar.getAttribute('role')).toBe('progressbar')
    expect(bar.getAttribute('aria-valuenow')).toBe('30')
    expect(bar.getAttribute('aria-valuemin')).toBe('0')
    expect(bar.getAttribute('aria-valuemax')).toBe('100')
    expect(bar.getAttribute('aria-label')).toBe('Storage')
    expect(bar.classList.contains('progress-bar--small')).toBe(true)
    expect(bar.classList.contains('progress-bar--brand')).toBe(true)
    expect(widths(bar)).toEqual(['30%'])
  })

  it('clamps the value, follows min and max, and draws an empty bar for an empty range', async () => {
    const { bar, component } = mount({ value: 150, kind: 'negative', 'aria-label': 'Storage' })
    expect(bar.getAttribute('aria-valuenow')).toBe('100')
    expect(widths(bar)).toEqual(['100%'])
    expect(bar.classList.contains('progress-bar--negative')).toBe(true)
    component.$set({ value: 1, min: 0.5, max: 10 })
    await tick()
    expect(widths(bar)[0]).toBe(`${((1 - 0.5) / 9.5) * 100}%`)
    component.$set({ value: 5, min: 0, max: 0 })
    await tick()
    expect(widths(bar)).toEqual(['0%'])
  })

  it('lays segments one after another, skips empty ones and never exceeds the bar', () => {
    const { bar } = mount({
      max: 10,
      size: 'large',
      segments: [
        { value: 4, color: 'red' },
        { value: 0, color: 'green' },
        { value: 8, color: 'blue' }
      ]
    })
    expect(bar.getAttribute('role')).toBeNull()
    expect(widths(bar)).toEqual(['40%', '60%'])
    expect(Array.from(bar.querySelectorAll('.progress-bar__value')).map((it) => it.textContent)).toEqual(['4', '8'])
  })

  it('is a named picture only with a name', () => {
    const { bar } = mount({ segments: [{ value: 20, color: 'red' }], 'aria-label': 'Issues by status' })
    expect(bar.getAttribute('role')).toBe('img')
    expect(bar.getAttribute('aria-label')).toBe('Issues by status')
  })

  it('treats a value that is not a number as the start of the range', () => {
    const { bar } = mount({ value: NaN, 'aria-label': 'Storage' })
    expect(bar.getAttribute('aria-valuenow')).toBe('0')
    expect(widths(bar)).toEqual(['0%'])
    const composite = mount({
      segments: [
        { value: NaN, color: 'red' },
        { value: 30, color: 'blue' }
      ]
    })
    expect(widths(composite.bar)).toEqual(['30%'])
  })

  it('writes segment values only in the large size', () => {
    const { bar } = mount({ segments: [{ value: 20, color: 'red' }] })
    expect(bar.querySelector('.progress-bar__value')).toBeNull()
  })

  it('asks a single bar for a name in its type, a composite one needs none', () => {
    // @ts-expect-error a single bar without aria-label or aria-labelledby
    const unnamed: ProgressBarProps = { value: 3 }
    const composite: ProgressBarProps = { segments: [] }
    const labelled: ProgressBarProps = { value: 3, 'aria-labelledby': 'caption' }
    expect([unnamed, composite, labelled]).toHaveLength(3)
  })
})
