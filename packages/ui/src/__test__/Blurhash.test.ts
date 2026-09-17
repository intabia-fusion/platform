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
import Blurhash from '../components/Blurhash.svelte'

let target: HTMLElement

function mount (props: Partial<ComponentProps<Blurhash>> = {}): { component: Blurhash, root: HTMLElement, canvas: HTMLCanvasElement } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new Blurhash({ target: host, props: props as ComponentProps<Blurhash> })
  const canvas = host.querySelector('canvas') as HTMLCanvasElement
  return { component, root: host, canvas }
}

describe('Blurhash', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders a canvas', () => {
    const { canvas } = mount({ blurhash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj' })
    expect(canvas).not.toBeNull()
    expect(canvas.width).toBe(32)
    expect(canvas.height).toBe(32)
  })

  it('sets custom width and height', () => {
    const { canvas } = mount({ blurhash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj', width: 64, height: 64 })
    expect(canvas.width).toBe(64)
    expect(canvas.height).toBe(64)
  })
})
