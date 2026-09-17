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
import EmbeddedPDF from '../components/EmbeddedPDF.svelte'

let target: HTMLElement

function mount (props: Partial<ComponentProps<EmbeddedPDF>> = {}): { component: EmbeddedPDF, iframe: HTMLIFrameElement } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new EmbeddedPDF({ target: host, props: props as ComponentProps<EmbeddedPDF> })
  return { component, iframe: host.querySelector('iframe') as HTMLIFrameElement }
}

describe('EmbeddedPDF', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders an iframe pointed at the fit view of the src', () => {
    const { iframe } = mount({ src: '/doc.pdf', name: 'doc' })
    expect(iframe).not.toBeNull()
    expect(iframe.getAttribute('src')).toBe('/doc.pdf#view=FitH&navpanes=0')
    expect(iframe.getAttribute('title')).toBe('doc')
    expect(iframe.classList.contains('fit')).toBe(false)
  })

  it('marks the iframe fit when fit is set', () => {
    const { iframe } = mount({ src: '/doc.pdf', name: 'doc', fit: true })
    expect(iframe.classList.contains('fit')).toBe(true)
  })

  it('accepts a css without throwing in jsdom (no iframe document)', async () => {
    const { iframe } = mount({ src: '/doc.pdf', name: 'doc', css: 'body { margin: 0 }' })
    await tick()
    expect(iframe).not.toBeNull()
  })
})
