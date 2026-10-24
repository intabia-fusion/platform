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

import { getEmbeddedLabel } from '@hcengineering/platform'
import { tick, type ComponentProps } from 'svelte'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import Callout from '../../ui-kit/callout/Callout.svelte'

let target: HTMLElement
const mounted: Array<{ $destroy: () => void }> = []

function mount (props: ComponentProps<Callout>): { root: HTMLElement, component: Callout } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new Callout({ target: host, props })
  mounted.push(component)
  return { root: host.querySelector('.callout') as HTMLElement, component }
}

describe('ui-kit Callout', () => {
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

  it('is an info status by default with the icon of its tone', () => {
    const { root } = mount({ label: getEmbeddedLabel('Note') })
    expect(root.classList.contains('callout--info')).toBe(true)
    expect(root.getAttribute('role')).toBe('status')
    expect(root.querySelector('.status-icon--info')).not.toBeNull()
  })

  it('announces an error at once and follows the tone', async () => {
    const { root, component } = mount({ tone: 'warning', label: getEmbeddedLabel('Fields will be lost') })
    expect(root.querySelector('.status-icon--warning')).not.toBeNull()
    component.$set({ tone: 'error' })
    await tick()
    expect(root.classList.contains('callout--error')).toBe(true)
    expect(root.getAttribute('role')).toBe('alert')
  })

  it('shows the title above the text only when given', async () => {
    const { root, component } = mount({ label: getEmbeddedLabel('Text') })
    expect(root.querySelector('.callout__title')).toBeNull()
    component.$set({ title: getEmbeddedLabel('Title') })
    await tick()
    expect(root.querySelector('.callout__title')).not.toBeNull()
  })
})
