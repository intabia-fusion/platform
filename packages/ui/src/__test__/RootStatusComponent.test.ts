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
import RootStatusComponent from '../components/RootStatusComponent.svelte'

let target: HTMLElement

function mount (props: Partial<ComponentProps<RootStatusComponent>> = {}): { component: RootStatusComponent, root: HTMLElement } {
  const host = document.createElement('div')
  target.appendChild(host)
  const merged = {
    onProgress: () => 50,
    interval: 100,
    label: 'ui:string:Progress' as any,
    ...props
  }
  const component = new RootStatusComponent({ target: host, props: merged as ComponentProps<RootStatusComponent> })
  return { component, root: host }
}

describe('RootStatusComponent', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    vi.useRealTimers()
    target.remove()
  })

  it('renders progress label and percentage', () => {
    const { root } = mount()
    expect(root.textContent).toContain('50%')
  })

  it('updates progress on interval', () => {
    const onProgress = vi.fn()
    onProgress.mockReturnValueOnce(10).mockReturnValueOnce(20)
    mount({ onProgress, interval: 100 })
    vi.advanceTimersByTime(100)
    expect(onProgress).toHaveBeenCalledTimes(2)
  })

  it('dispatches close when progress reaches 100', () => {
    const onClose = vi.fn()
    const { component } = mount({ onProgress: () => 100, interval: 100 })
    component.$on('close', onClose)
    vi.advanceTimersByTime(1100)
    expect(onClose).toHaveBeenCalled()
  })

  it('shows cancel button when onCancel is provided', () => {
    const { root } = mount({ onCancel: () => {} })
    expect(root.querySelector('button')).not.toBeNull()
  })

  it('hides cancel button when onCancel is undefined', () => {
    const { root } = mount({ onCancel: undefined })
    expect(root.querySelector('button')).toBeNull()
  })
})
