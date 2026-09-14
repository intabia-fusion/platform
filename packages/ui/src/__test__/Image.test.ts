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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'svelte'
import Image from '../components/Image.svelte'

let target: HTMLElement

function mount (props: Partial<ComponentProps<Image>> = {}): { component: Image, root: HTMLElement, img: HTMLImageElement } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new Image({ target: host, props: props as ComponentProps<Image> })
  const img = host.querySelector('img') as HTMLImageElement
  return { component, root: host, img }
}

describe('Image', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders an img with the provided src', () => {
    const { img } = mount({ src: '/img.png', width: 100, height: 100 })
    expect(img).not.toBeNull()
    expect(img.getAttribute('src')).toBe('/img.png')
  })

  it('uses numeric width as max-width and string width as inline width', () => {
    const numeric = mount({ src: '/a.png', width: 200, height: 100 }).img
    expect(numeric.style.width).toBe('auto')
    expect(numeric.style.maxWidth).toBe('200px')

    const string = mount({ src: '/b.png', width: '10rem', height: '100' }).img
    expect(string.style.width).toBe('10rem')
    expect(string.style.maxWidth).toBe('')
  })

  it('passes srcset, alt and loading through', () => {
    const { img } = mount({ src: '/a.png', width: 100, height: 100, srcset: '/a.png 1x', alt: 'test', loading: 'lazy' })
    expect(img.getAttribute('srcset')).toBe('/a.png 1x')
    expect(img.getAttribute('alt')).toBe('test')
    expect(img.getAttribute('loading')).toBe('lazy')
  })

  it('applies object-fit style', () => {
    const { img } = mount({ src: '/a.png', width: 100, height: 100, fit: 'cover' })
    expect(img.style.objectFit).toBe('cover')
  })

  it('dispatches loadstart when src changes', async () => {
    const onLoadStart = vi.fn()
    const { component } = mount({ src: '/a.png', width: 100, height: 100 })
    component.$on('loadstart', onLoadStart)

    component.$set({ src: '/b.png' })
    await tick()
    expect(onLoadStart).toHaveBeenCalledTimes(1)
  })
})
