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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Loading from '../components/Loading.svelte'

let target: HTMLElement

function mount (props: Record<string, unknown> = {}): { host: HTMLElement, component: Loading } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new Loading({ target: host, props })
  return { host, component }
}

describe('Loading', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
    vi.useRealTimers()
  })

  it('is full-size by default, and shrinks when shrink is set', () => {
    expect(mount().host.querySelector('.spinner-container')?.classList.contains('fullSize')).toBe(true)
    expect(mount({ shrink: true }).host.querySelector('.spinner-container')?.classList.contains('fullSize')).toBe(
      false
    )
  })

  it('marks the inner element labeled only when a label is given', () => {
    const { host } = mount({ label: 'loading...' })
    const inner = host.querySelector('.inner') as HTMLElement
    expect(inner.classList.contains('labeled')).toBe(true)
    expect(inner.dataset.label).toBe('loading...')
  })

  it('is not labeled with an empty label', () => {
    const inner = mount().host.querySelector('.inner') as HTMLElement
    expect(inner.classList.contains('labeled')).toBe(false)
  })

  it('dispatches progress after mount, once the timer fires', () => {
    const { component } = mount()
    const onProgress = vi.fn()
    component.$on('progress', onProgress)
    expect(onProgress).not.toHaveBeenCalled()
    vi.advanceTimersByTime(50)
    expect(onProgress).toHaveBeenCalledTimes(1)
  })

  it('clears the timer on destroy, so progress never fires', () => {
    const { component } = mount()
    const onProgress = vi.fn()
    component.$on('progress', onProgress)
    component.$destroy()
    vi.advanceTimersByTime(50)
    expect(onProgress).not.toHaveBeenCalled()
  })
})
