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

import Spinner from '../../ui-kit/spinner/Spinner.svelte'

let target: HTMLElement
const mounted: Array<{ $destroy: () => void }> = []

function mount (props: ComponentProps<Spinner>): { spinner: HTMLElement, component: Spinner } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new Spinner({ target: host, props })
  mounted.push(component)
  return { spinner: host.querySelector('.spinner') as HTMLElement, component }
}

describe('ui-kit Spinner', () => {
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

  it('is a decorative neutral medium spinner by default', () => {
    const { spinner } = mount({})
    expect(spinner.classList.contains('spinner--medium')).toBe(true)
    expect(spinner.classList.contains('spinner--neutral')).toBe(true)
    expect(spinner.getAttribute('aria-hidden')).toBe('true')
    expect(spinner.hasAttribute('role')).toBe(false)
    expect(spinner.querySelector('.spinner__label')).toBeNull()
  })

  it('becomes a named status with a visible label', async () => {
    const { spinner } = mount({ label: getEmbeddedLabel('Clearing'), size: 'small' })
    await tick()
    expect(spinner.getAttribute('role')).toBe('status')
    expect(spinner.hasAttribute('aria-hidden')).toBe(false)
    expect(spinner.querySelector('.spinner__label')?.textContent).toBe('Clearing')
    expect(spinner.classList.contains('spinner--small')).toBe(true)
  })

  it('takes an aria-label instead of a visible label', () => {
    const { spinner } = mount({ 'aria-label': 'Loading' })
    expect(spinner.getAttribute('role')).toBe('status')
    expect(spinner.getAttribute('aria-label')).toBe('Loading')
  })

  it('gives every instance its own gradient', () => {
    const first = mount({}).spinner
    const second = mount({}).spinner
    const firstId = first.querySelector('linearGradient')?.id
    const secondId = second.querySelector('linearGradient')?.id
    expect(firstId).toBeTruthy()
    expect(firstId).not.toBe(secondId)
    expect(second.querySelector('path:last-of-type')?.getAttribute('fill')).toBe(`url(#${secondId})`)
  })

  it('falls back to defaults on explicit undefined and keeps kind and color mode classes', async () => {
    const { spinner, component } = mount({ size: 'large', kind: 'brand', inheritColor: true })
    expect(spinner.classList.contains('spinner--brand')).toBe(true)
    expect(spinner.classList.contains('spinner--inherit')).toBe(true)
    component.$set({ size: undefined, kind: undefined })
    await tick()
    expect(spinner.classList.contains('spinner--medium')).toBe(true)
    expect(spinner.classList.contains('spinner--neutral')).toBe(true)
  })
})
