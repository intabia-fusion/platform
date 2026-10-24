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

import { readFileSync } from 'fs'
import { join } from 'path'
import { tick, type ComponentProps } from 'svelte'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import ProgressCircle from '../../ui-kit/progress-circle/ProgressCircle.svelte'
import type { ProgressCircleProps } from '../../ui-kit/progress-circle/types'

let target: HTMLElement
const mounted: Array<{ $destroy: () => void }> = []

function mount (props: ComponentProps<ProgressCircle>): { circle: SVGElement, component: ProgressCircle } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new ProgressCircle({ target: host, props })
  mounted.push(component)
  return { circle: host.querySelector('.progress-circle') as SVGElement, component }
}

describe('ui-kit ProgressCircle', () => {
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

  it('is a small progressbar ring filled by the share of the range', () => {
    const { circle } = mount({ value: 2, max: 5, 'aria-label': 'Approvals' })
    expect(circle.getAttribute('role')).toBe('progressbar')
    expect(circle.getAttribute('aria-valuenow')).toBe('2')
    expect(circle.getAttribute('aria-valuemax')).toBe('5')
    expect(circle.classList.contains('progress-circle--small')).toBe(true)
    expect(circle.querySelector('.progress-circle__arc')?.getAttribute('stroke-dasharray')).toBe('40 100')
  })

  it('hides the arc at zero and for an empty range, clamps the value', async () => {
    const { circle, component } = mount({ value: 0, max: 3, size: 'extra-small', 'aria-label': 'Approvals' })
    const arc = circle.querySelector('.progress-circle__arc') as SVGElement
    expect(arc.classList.contains('progress-circle__arc--empty')).toBe(true)
    expect(circle.classList.contains('progress-circle--extra-small')).toBe(true)
    component.$set({ value: 7 })
    await tick()
    expect(circle.getAttribute('aria-valuenow')).toBe('3')
    expect(arc.getAttribute('stroke-dasharray')).toBe('100 100')
    component.$set({ max: 0 })
    await tick()
    expect(arc.classList.contains('progress-circle__arc--empty')).toBe(true)
  })

  it('treats a value that is not a number as the start of the range', () => {
    const { circle } = mount({ value: NaN, max: 4, 'aria-label': 'Approvals' })
    expect(circle.getAttribute('aria-valuenow')).toBe('0')
    expect(circle.querySelector('.progress-circle__arc--empty')).not.toBeNull()
  })

  it('asks for a name in its type and passes it to the progressbar', () => {
    // @ts-expect-error a ring without aria-label or aria-labelledby
    const unnamed: ProgressCircleProps = { value: 1 }
    expect(unnamed.value).toBe(1)
    const { circle } = mount({ value: 1, 'aria-labelledby': 'caption' })
    expect(circle.getAttribute('aria-labelledby')).toBe('caption')
  })

  // jsdom computes no styles: the look is pinned in the source.
  it('draws the legacy colors: a pale divider track and the blue-violet arc', () => {
    const source = readFileSync(join(__dirname, '../../ui-kit/progress-circle/ProgressCircle.svelte'), 'utf8')
    expect(source).toMatch(/stroke:\s*color-mix\(in srgb, var\(--theme-divider-color\) 50%/)
    expect(source).toMatch(/stroke:\s*var\(--primary-bg-color\)/)
  })
})
