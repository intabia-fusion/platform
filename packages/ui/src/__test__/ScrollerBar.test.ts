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
import ScrollerBar from '../components/ScrollerBar.svelte'

let target: HTMLElement

const settle = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 20))
}

interface Mounted {
  component: ScrollerBar
  host: HTMLElement
  scroller: HTMLElement
  bar: HTMLElement
  track: HTMLElement
}

async function mount (props: Record<string, unknown> = {}): Promise<Mounted> {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new ScrollerBar({ target: host, props: { scroller: undefined as any, ...props } })
  await settle()
  return {
    component,
    host,
    scroller: host.querySelector('.antiStatesBar') as HTMLElement,
    bar: host.querySelector('.bar') as HTMLElement,
    track: host.querySelector('.track') as HTMLElement
  }
}

// clientWidth/scrollWidth are prototype getters returning 0 in jsdom; shadow them as own
// properties so checkBar/checkMask see a scrollable (or non-scrollable) container.
function setGeometry (el: HTMLElement, clientWidth: number, scrollWidth: number, scrollLeft: number): void {
  Object.defineProperty(el, 'clientWidth', { value: clientWidth, configurable: true })
  Object.defineProperty(el, 'scrollWidth', { value: scrollWidth, configurable: true })
  Object.defineProperty(el, 'scrollLeft', { value: scrollLeft, configurable: true })
}

describe('ScrollerBar', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('stays mask-none when the content does not overflow', async () => {
    const { scroller } = await mount()
    // clientWidth and scrollWidth both default to 0 in jsdom, i.e. no overflow.
    expect(scroller.className).toContain('mask-none')
  })

  it('masks the right edge only when content overflows past the right', async () => {
    const { scroller } = await mount()
    setGeometry(scroller, 200, 500, 0)
    scroller.dispatchEvent(new Event('scroll'))
    await tick()
    expect(scroller.className).toContain('mask-right')
  })

  it('masks the left edge only when scrolled away from the start', async () => {
    const { scroller } = await mount()
    setGeometry(scroller, 200, 500, 300)
    scroller.dispatchEvent(new Event('scroll'))
    await tick()
    expect(scroller.className).toContain('mask-left')
  })

  it('masks both edges when scrolled to the middle', async () => {
    const { scroller } = await mount()
    setGeometry(scroller, 200, 500, 100)
    scroller.dispatchEvent(new Event('scroll'))
    await tick()
    expect(scroller.className).toContain('mask-both')
  })

  it('sizes and positions the bar from the scroll proportions', async () => {
    const { scroller, bar } = await mount()
    setGeometry(scroller, 200, 400, 100)
    scroller.dispatchEvent(new Event('scroll'))
    await tick()
    // proc = scrollWidth / clientWidth = 2; width = clientWidth / proc = 100; left = scrollLeft / proc = 50.
    expect(bar.style.width).toBe('100px')
    expect(bar.style.left).toBe('50px')
    expect(bar.style.visibility).toBe('visible')
  })

  it('hides the bar when the content fits (no overflow, mask-none)', async () => {
    const { scroller, bar } = await mount()
    setGeometry(scroller, 200, 200, 0)
    scroller.dispatchEvent(new Event('scroll'))
    await tick()
    expect(bar.style.visibility).toBe('hidden')
  })

  it('maps the gap prop to the gap step class', async () => {
    expect((await mount({ gap: 'small' })).scroller.className).toContain('gap-1')
    expect((await mount({ gap: 'big' })).scroller.className).toContain('gap-2')
    const none = await mount({ gap: 'none' })
    expect(none.scroller.className).not.toContain('gap-1')
    expect(none.scroller.className).not.toContain('gap-2')
  })

  it('applies the padding prop as inline style', async () => {
    const { scroller } = await mount({ padding: '1rem' })
    expect(scroller.style.padding).toBe('1rem')
  })

  it('marks the bar and track hovered while dragging, and clears it on pointerup', async () => {
    const { bar, track } = await mount()
    bar.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 0, pointerId: 1 }))
    await tick()
    expect(bar.classList.contains('hovered')).toBe(true)
    expect(track.classList.contains('hovered')).toBe(true)
    expect(document.body.style.userSelect).toBe('none')

    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 20, clientY: 0, pointerId: 1 }))
    await tick()
    expect(bar.classList.contains('hovered')).toBe(false)
    expect(track.classList.contains('hovered')).toBe(false)
    expect(document.body.style.userSelect).toBe('auto')
  })
})
