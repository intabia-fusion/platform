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

import { vi } from 'vitest'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ComponentProps } from 'svelte'
import AppLoading from '../components/AppLoading.svelte'

let target: HTMLElement

function mount (props: Partial<ComponentProps<AppLoading>> = {}): { component: AppLoading, root: HTMLElement } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new AppLoading({ target: host, props: props as ComponentProps<AppLoading> })
  return { component, root: host }
}

describe('AppLoading', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    vi.useRealTimers()
    target.remove()
  })

  it('renders a spinner container', () => {
    const { root } = mount()
    expect(root.querySelector('.spinner-container')).not.toBeNull()
  })

  it('applies fullSize class by default', () => {
    const { root } = mount()
    expect(root.querySelector('.spinner-container')?.classList.contains('fullSize')).toBe(true)
  })

  it('removes fullSize when shrink is true', () => {
    const { root } = mount({ shrink: true })
    expect(root.querySelector('.spinner-container')?.classList.contains('fullSize')).toBe(false)
  })

  it('adds labeled class when label is provided', () => {
    const { root } = mount({ label: 'Loading...' })
    expect(root.querySelector('.flex-row-center')?.classList.contains('labeled')).toBe(true)
  })

  it('dispatches progress after 50ms', () => {
    const onProgress = vi.fn()
    const { component } = mount()
    component.$on('progress', onProgress)
    vi.advanceTimersByTime(50)
    expect(onProgress).toHaveBeenCalledTimes(1)
  })
})
