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
import type { ComponentProps } from 'svelte'
import PopupInstance from '../components/PopupInstance.svelte'

let target: HTMLElement

function mount (props: Partial<ComponentProps<PopupInstance>> = {}): { component: PopupInstance, root: HTMLElement } {
  const host = document.createElement('div')
  target.appendChild(host)
  const merged = {
    is: undefined as any,
    props: {},
    // 'centered' yields plain percentage props; element-less fitting produces a malformed
    // calc() value in the source that jsdom's cssstyle rejects
    element: 'centered',
    onClose: undefined,
    onUpdate: undefined,
    overlay: false,
    zIndex: 100,
    top: false,
    close: () => {},
    contentPanel: undefined,
    popup: { id: 'test-popup', options: { refId: 'test-ref', overlay: false } } as any,
    ...props
  }
  const component = new PopupInstance({ target: host, props: merged as ComponentProps<PopupInstance> })
  return { component, root: host }
}

describe('PopupInstance', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('mounts without error', () => {
    const { root } = mount()
    expect(root.querySelector('.popup')).not.toBeNull()
  })
})
