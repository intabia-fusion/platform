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
import SelectBox from '../components/SelectBox.svelte'

let target: HTMLElement

function mount (props: Record<string, unknown> = {}): { host: HTMLElement, box: HTMLElement } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new SelectBox({ target: host, props })
  expect(component).toBeDefined()
  return { host, box: host.querySelector('.scrollBox') as HTMLElement }
}

describe('SelectBox', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('is not vertical or both-scroll by default', () => {
    const { box } = mount()
    expect(box.classList.contains('vertical')).toBe(false)
    expect(box.classList.contains('bothScroll')).toBe(false)
  })

  it('carries the vertical and bothScroll classes when asked', () => {
    const { box } = mount({ vertical: true, bothScroll: true })
    expect(box.classList.contains('vertical')).toBe(true)
    expect(box.classList.contains('bothScroll')).toBe(true)
  })

  it('applies gap as an inline style in rem, defaulting to 0.75', () => {
    const inner = (host: HTMLElement): HTMLElement => host.querySelector('.box') as HTMLElement
    expect(inner(mount().host).style.gap).toBe('0.75rem')
    expect(inner(mount({ gap: 2 }).host).style.gap).toBe('2rem')
  })

  it('marks the inner box as stretch when asked', () => {
    const inner = mount({ stretch: true }).host.querySelector('.box') as HTMLElement
    expect(inner.classList.contains('stretch')).toBe(true)
  })
})
