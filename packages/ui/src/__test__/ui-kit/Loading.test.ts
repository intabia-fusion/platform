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
import { tick } from 'svelte'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import Loading from '../../ui-kit/loading/Loading.svelte'
import type { LoadingProps } from '../../ui-kit/loading/types'
import LoadingWithActions from './LoadingWithActions.svelte'

let target: HTMLElement
const mounted: Array<{ $destroy: () => void }> = []

async function settle (): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await tick()
}

function mount (props: LoadingProps, withActions = false): HTMLElement {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = withActions
    ? new LoadingWithActions({ target: host, props: { props } })
    : new Loading({ target: host, props })
  mounted.push(component)
  return host.querySelector('.loading') as HTMLElement
}

describe('ui-kit Loading', () => {
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

  it('fills the place with a delayed medium spinner and no actions row', () => {
    const loading = mount({})
    expect(loading.classList.contains('loading--delay')).toBe(true)
    expect(loading.querySelector('.spinner--medium')).not.toBeNull()
    expect(loading.querySelector('.loading__actions')).toBeNull()
  })

  it('is not busy itself: aria-busy would hold back its own status', () => {
    expect(mount({}).hasAttribute('aria-busy')).toBe(false)
  })

  it('announces a hidden Loading status when there is no label, its text after the region', async () => {
    const loading = mount({})
    await tick()
    const status = loading.querySelector('[role="status"]') as HTMLElement
    expect(status.classList.contains('loading__status--hidden')).toBe(true)
    // A live region inserted together with its text is often not read.
    expect(status.textContent?.trim()).toBe('')
    await settle()
    expect(status.textContent?.trim()).toBe('ui:string:Loading')
    expect(loading.querySelector('.spinner')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('announces only the label when there is one, in one live region', async () => {
    const labelled = mount({ label: getEmbeddedLabel('Workspace is being created') })
    await tick()
    const regions = labelled.querySelectorAll('[role="status"]')
    expect(regions).toHaveLength(1)
    expect(regions[0].textContent?.trim()).toBe('')
    await settle()
    expect(regions[0].textContent?.trim()).toBe('Workspace is being created')
    expect(regions[0].classList.contains('loading__status--hidden')).toBe(false)
    expect(labelled.querySelector('.spinner')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('shows at once without delay and passes size to the spinner', async () => {
    const loading = mount({ delay: false, size: 'small', label: getEmbeddedLabel('Workspace is being created') })
    await settle()
    expect(loading.classList.contains('loading--delay')).toBe(false)
    expect(loading.querySelector('.spinner')?.classList.contains('spinner--small')).toBe(true)
    expect(loading.querySelector('.loading__indicator')?.textContent?.trim()).toBe('Workspace is being created')
  })

  it('puts the default slot after the spinner and actions below it', () => {
    const loading = mount({}, true)
    expect(loading.querySelector('.loading__row .extra')?.textContent).toBe('42 %')
    expect(loading.querySelector('.loading__actions .action')).not.toBeNull()
  })
})
