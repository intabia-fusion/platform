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

import Kbd from '../../ui-kit/kbd/Kbd.svelte'

let target: HTMLElement
const mounted: Array<{ $destroy: () => void }> = []

function mount (keys: string[]): HTMLElement {
  const host = document.createElement('div')
  target.appendChild(host)
  mounted.push(new Kbd({ target: host, props: { keys } }))
  return host.querySelector('.kbd') as HTMLElement
}

describe('ui-kit Kbd', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    mounted.splice(0).forEach((component) => {
      component.$destroy()
    })
    target.remove()
  })

  it('nests one kbd per key in a combination kbd', () => {
    const root = mount(['shift', 'Enter'])
    const keys = Array.from(root.querySelectorAll(':scope > kbd'))
    expect(root.tagName).toBe('KBD')
    expect(keys).toHaveLength(2)
    expect(keys[1].textContent?.trim()).toBe('Enter')
  })

  it('draws modifier keys as symbols that are read out by name', () => {
    const key = mount(['command']).querySelector('kbd') as HTMLElement
    expect(key.querySelector('.kbd__symbol')?.getAttribute('aria-hidden')).toBe('true')
    expect(key.querySelector('.kbd__name')?.textContent).toBe('Command')
    expect(key.classList.contains('kbd__key--text')).toBe(false)
  })

  it('shows any other key as its text', () => {
    const key = mount(['1']).querySelector('kbd') as HTMLElement
    expect(key.textContent?.trim()).toBe('1')
    expect(key.classList.contains('kbd__key--text')).toBe(true)
  })
})
