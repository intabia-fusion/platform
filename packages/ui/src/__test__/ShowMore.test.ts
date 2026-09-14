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
import ShowMore from '../components/ShowMore.svelte'

let target: HTMLElement

function mount (props: Partial<ComponentProps<ShowMore>> = {}): { host: HTMLElement, component: ShowMore } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new ShowMore({ target: host, props: props as ComponentProps<ShowMore> })
  return { host, component }
}

// jsdom's ResizeObserver stub (setup.ts) never fires, so cHeight stays undefined and the
// `cHeight > limit` auto-detect branch never runs here - tests drive `bigger` directly instead.
describe('ShowMore', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('does nothing when not bigger than the limit', () => {
    const { host } = mount()
    const content = host.querySelector('.showMore-content') as HTMLElement
    expect(content.classList.contains('crop')).toBe(false)
    expect(host.querySelector('.showMore')).toBeNull()
  })

  it('crops the content and shows the toggle once bigger is set', () => {
    const { host } = mount({ bigger: true })
    const content = host.querySelector('.showMore-content') as HTMLElement
    expect(content.classList.contains('crop')).toBe(true)
    expect(content.style.maxHeight).toBe('240px')
    expect(host.querySelector('.showMore')).not.toBeNull()
  })

  it('honours a custom limit in the crop style', () => {
    const { host } = mount({ bigger: true, limit: 100 })
    const content = host.querySelector('.showMore-content') as HTMLElement
    expect(content.style.maxHeight).toBe('100px')
  })

  it('suppresses cropping and the toggle when ignore is set', () => {
    const { host } = mount({ bigger: true, ignore: true })
    const content = host.querySelector('.showMore-content') as HTMLElement
    expect(content.classList.contains('crop')).toBe(false)
    expect(content.classList.contains('full')).toBe(false)
    expect(host.querySelector('.showMore')).toBeNull()
  })

  it('keeps the crop but hides the toggle when fixed', () => {
    const { host } = mount({ bigger: true, fixed: true })
    const content = host.querySelector('.showMore-content') as HTMLElement
    expect(content.classList.contains('crop')).toBe(true)
    expect(host.querySelector('.showMore')).toBeNull()
  })

  it('toggles crop off on click, without letting the click bubble', async () => {
    const { host } = mount({ bigger: true })
    const content = host.querySelector('.showMore-content') as HTMLElement
    const toggle = host.querySelector('.showMore') as HTMLElement
    let bubbled = false
    target.addEventListener('click', () => {
      bubbled = true
    })

    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick()

    expect(content.classList.contains('crop')).toBe(false)
    expect(content.classList.contains('full')).toBe(true)
    expect(bubbled).toBe(false)
  })
})
