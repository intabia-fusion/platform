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

import Steps from '../../ui-kit/steps/Steps.svelte'

const ITEMS = [
  { id: 'file', label: getEmbeddedLabel('Select file') },
  { id: 'review', label: getEmbeddedLabel('Review') },
  { id: 'import', label: getEmbeddedLabel('Import') }
]

let target: HTMLElement
const mounted: Array<{ $destroy: () => void }> = []

function mount (props: ComponentProps<Steps>): { root: HTMLElement, items: HTMLElement[], component: Steps } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new Steps({ target: host, props })
  mounted.push(component)
  const root = host.querySelector('ol.steps') as HTMLElement
  return { root, items: Array.from(root.querySelectorAll('li')), component }
}

function states (items: HTMLElement[]): string[] {
  return items.map(
    (item) => ['done', 'current', 'ahead'].find((state) => item.classList.contains(`steps__item--${state}`)) ?? ''
  )
}

describe('ui-kit Steps', () => {
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

  it('is a numbered list with the current step marked', () => {
    const { root, items } = mount({ items: ITEMS, selected: 'review', 'aria-label': 'Import steps' })
    expect(root.getAttribute('aria-label')).toBe('Import steps')
    expect(items.map((item) => item.querySelector('.steps__label')?.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      '1. Select file',
      '2. Review',
      '3. Import'
    ])
    expect(states(items)).toEqual(['done', 'current', 'ahead'])
    expect(items.map((item) => item.getAttribute('aria-current'))).toEqual([null, 'step', null])
    expect(items[0].querySelector('.steps__marker svg')).not.toBeNull()
    expect(items[1].querySelector('.steps__marker svg')).toBeNull()
  })

  it('has every step ahead without a current one, and follows the selection', async () => {
    const { items, component } = mount({ items: ITEMS })
    expect(states(items)).toEqual(['ahead', 'ahead', 'ahead'])

    component.$set({ selected: 'import' })
    await tick()
    expect(states(items)).toEqual(['done', 'done', 'current'])
  })

  it('says in hidden text that a passed step is completed', async () => {
    const { items, component } = mount({ items: ITEMS, selected: 'import' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    await tick()
    expect(items.map((item) => item.querySelector('.steps__passed') !== null)).toEqual([true, true, false])
    expect(items[0].querySelector('.steps__passed')?.textContent).toBe('ui:string:Completed')

    component.$set({ selected: 'file' })
    await tick()
    expect(items.some((item) => item.querySelector('.steps__passed') !== null)).toBe(false)
  })
})
