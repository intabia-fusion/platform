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
import type { ComponentProps } from 'svelte'
import FocusHandler from '../components/FocusHandler.svelte'
import { FocusManager } from '../focus'

let target: HTMLElement

function createManager (): FocusManager {
  return {
    next: vi.fn()
  } as unknown as FocusManager
}

function mount (props: Partial<ComponentProps<FocusHandler>> = {}): { component: FocusHandler, root: HTMLElement } {
  const host = document.createElement('div')
  target.appendChild(host)
  const merged = { manager: createManager(), ...props }
  const component = new FocusHandler({ target: host, props: merged as ComponentProps<FocusHandler> })
  return { component, root: host }
}

describe('FocusHandler', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('mounts without error', () => {
    const { component } = mount()
    expect(component).toBeDefined()
  })

  it('calls manager.next on Tab when enabled', () => {
    const manager = createManager()
    mount({ manager, isEnabled: true })
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Tab' }))
    expect(manager.next).toHaveBeenCalledWith(1)
  })

  it('calls manager.next with -1 on Shift+Tab', () => {
    const manager = createManager()
    mount({ manager, isEnabled: true })
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Tab', shiftKey: true }))
    expect(manager.next).toHaveBeenCalledWith(-1)
  })

  it('does not call manager when disabled', () => {
    const manager = createManager()
    mount({ manager, isEnabled: false })
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Tab' }))
    expect(manager.next).not.toHaveBeenCalled()
  })
})
