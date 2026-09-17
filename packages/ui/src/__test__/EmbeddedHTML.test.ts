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
import EmbeddedHTML from '../components/EmbeddedHTML.svelte'

let target: HTMLElement
let createObjectURL: ReturnType<typeof vi.fn>
let revokeObjectURL: ReturnType<typeof vi.fn>

function mount (props: Partial<ComponentProps<EmbeddedHTML>> = {}): { component: EmbeddedHTML, host: HTMLElement } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new EmbeddedHTML({ target: host, props: props as ComponentProps<EmbeddedHTML> })
  return { component, host }
}

describe('EmbeddedHTML', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ blob: async () => new Blob(['<html></html>']) })))
    let next = 0
    createObjectURL = vi.fn(() => `blob:mock-${next++}`)
    revokeObjectURL = vi.fn()
    ;(URL as any).createObjectURL = createObjectURL
    ;(URL as any).revokeObjectURL = revokeObjectURL
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
    vi.unstubAllGlobals()
  })

  it('shows a spinner until the fetched blob url is ready', () => {
    const { host } = mount({ src: '/page.html', name: 'page' })
    expect(host.querySelector('iframe')).toBeNull()
    expect(host.querySelector('.spinner-container')).not.toBeNull()
  })

  it('swaps the spinner for the embedded pdf once loading resolves', async () => {
    const { host } = mount({ src: '/page.html', name: 'page' })
    await vi.waitFor(() => {
      expect(host.querySelector('iframe')).not.toBeNull()
    })
    expect(host.querySelector('.spinner-container')).toBeNull()
    expect((host.querySelector('iframe') as HTMLIFrameElement).getAttribute('src')).toBe('blob:mock-0#view=FitH&navpanes=0')
    expect((host.querySelector('iframe') as HTMLIFrameElement).getAttribute('title')).toBe('page')
  })

  it('revokes the previous object url when src changes', async () => {
    const { component, host } = mount({ src: '/a.html', name: 'page' })
    await vi.waitFor(() => {
      expect(createObjectURL).toHaveBeenCalledTimes(1)
    })
    await tick()
    component.$set({ src: '/b.html' })
    await vi.waitFor(() => {
      expect(createObjectURL).toHaveBeenCalledTimes(2)
    })
    await tick()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-0')
    expect(host.querySelector('iframe')).not.toBeNull()
  })

  it('revokes the object url on destroy', async () => {
    const { component } = mount({ src: '/page.html', name: 'page' })
    await vi.waitFor(() => {
      expect(createObjectURL).toHaveBeenCalledTimes(1)
    })
    component.$destroy()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-0')
  })
})
