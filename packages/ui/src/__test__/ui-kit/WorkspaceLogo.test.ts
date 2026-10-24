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
import { tick, type ComponentProps } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import WorkspaceLogo from '../../ui-kit/workspace-logo/WorkspaceLogo.svelte'

let target: HTMLElement
const mounted: Array<{ $destroy: () => void }> = []

function mount (props: ComponentProps<WorkspaceLogo>): { root: HTMLElement, component: WorkspaceLogo } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new WorkspaceLogo({ target: host, props })
  mounted.push(component)
  return { root: host.querySelector('.workspace-logo') as HTMLElement, component }
}

describe('ui-kit WorkspaceLogo', () => {
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

  it('shows the capital first letter and is named by the workspace', () => {
    const { root } = mount({ name: 'intabia' })
    expect(root.getAttribute('role')).toBe('img')
    expect(root.getAttribute('aria-label')).toBe('intabia')
    expect(root.querySelector('.workspace-logo__letter')?.textContent).toBe('I')
    expect(root.querySelector('img')).toBeNull()
  })

  it('shows the picture instead of the letter', () => {
    const { root } = mount({ name: 'intabia', src: 'logo.png', srcset: 'logo.png 1x' })
    const image = root.querySelector('img') as HTMLImageElement
    expect(image.getAttribute('src')).toBe('logo.png')
    expect(image.getAttribute('srcset')).toBe('logo.png 1x')
    expect(image.alt).toBe('')
    expect(root.querySelector('.workspace-logo__letter')).toBeNull()
  })

  it('is small by default, with a dot on notify', async () => {
    const { root, component } = mount({ name: 'intabia', size: 'extra-small' })
    expect(root.classList.contains('workspace-logo--extra-small')).toBe(true)
    expect(root.querySelector('.workspace-logo__dot')).toBeNull()
    component.$set({ size: undefined, notify: true })
    await Promise.resolve()
    expect(root.classList.contains('workspace-logo--small')).toBe(true)
    expect(root.querySelector('.workspace-logo__dot')).not.toBeNull()
  })

  it('announces the dot in the name and drops it with the dot', async () => {
    const { root, component } = mount({ name: 'intabia', notify: true })
    await vi.waitFor(() => {
      expect(root.getAttribute('aria-label')).toBe('intabia, ui:string:NewActivity')
    })
    component.$set({ notify: false })
    await tick()
    expect(root.getAttribute('aria-label')).toBe('intabia')
  })

  it('falls back to the letter on an empty address or a picture that fails, tries a new address again', async () => {
    expect(mount({ name: 'intabia', src: '' }).root.querySelector('img')).toBeNull()

    const { root, component } = mount({ name: 'intabia', src: 'broken.png' })
    root.querySelector('img')?.dispatchEvent(new Event('error'))
    await tick()
    expect(root.querySelector('img')).toBeNull()
    expect(root.querySelector('.workspace-logo__letter')?.textContent).toBe('I')

    component.$set({ src: 'logo.png' })
    await tick()
    expect(root.querySelector('img')?.getAttribute('src')).toBe('logo.png')
  })
})
