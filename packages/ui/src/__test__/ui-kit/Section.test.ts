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
import { getEmbeddedLabel, type Asset } from '@hcengineering/platform'
import { tick } from 'svelte'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { SectionProps } from '../../ui-kit/section/types'
import SectionWithSlots from './SectionWithSlots.svelte'

const LABEL = getEmbeddedLabel('Members')

let target: HTMLElement
const mounted: Array<{ $destroy: () => void }> = []

function mount (props: SectionProps, withActions = true): HTMLElement {
  const host = document.createElement('div')
  target.appendChild(host)
  mounted.push(new SectionWithSlots({ target: host, props: { props, withActions } }))
  return host.querySelector('.section') as HTMLElement
}

describe('ui-kit Section', () => {
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

  it('is a section named by its heading, with actions in the header and content below', () => {
    const root = mount({ label: LABEL, id: 'members' })
    const heading = root.querySelector('h2') as HTMLElement
    expect(root.tagName).toBe('SECTION')
    expect(root.id).toBe('members')
    expect(root.getAttribute('aria-labelledby')).toBe(heading.id)
    expect(heading.textContent).toBe('Members')
    expect(root.querySelector('.section__header .action')).not.toBeNull()
    expect(root.querySelector('.section__content .content')).not.toBeNull()
  })

  it('draws a decorative icon only when given', () => {
    expect(mount({ label: LABEL }).querySelector('.section__icon')).toBeNull()
    const icon = mount({ label: LABEL, icon: 'ui:icon:Folder' as Asset }).querySelector('.section__icon')
    expect(icon?.getAttribute('aria-hidden')).toBe('true')
  })

  it('leaves the actions place empty without actions, so the header has no gap', () => {
    const actions = mount({ label: LABEL }, false).querySelector('.section__actions') as HTMLElement
    expect(actions.childElementCount).toBe(0)
    expect(actions.textContent).toBe('')
  })

  it('gives every section its own heading id', () => {
    const first = mount({ label: LABEL }).querySelector('h2') as HTMLElement
    const second = mount({ label: LABEL }).querySelector('h2') as HTMLElement
    expect(first.id).not.toBe(second.id)
  })

  it('leaves the id off when not given', () => {
    expect(mount({ label: LABEL }).hasAttribute('id')).toBe(false)
  })

  it('has a level 2 heading by default and the given level for a nested section', () => {
    expect(mount({ label: LABEL }).querySelector('h2')).not.toBeNull()
    const nested = mount({ label: LABEL, level: 3 })
    expect(nested.querySelector('h3.section__title')?.textContent).toBe('Members')
    expect(nested.querySelector('h2')).toBeNull()
    expect(nested.getAttribute('aria-labelledby')).toBe(nested.querySelector('h3')?.id)
  })

  it('falls back to level 2 when level is later set to undefined', async () => {
    const host = document.createElement('div')
    target.appendChild(host)
    const initial: SectionProps = { label: LABEL, level: 3 }
    const component = new SectionWithSlots({ target: host, props: { props: initial } })
    mounted.push(component)
    const reset: SectionProps = { label: LABEL, level: undefined }
    component.$set({ props: reset })
    await tick()
    expect(host.querySelector('h2.section__title')).not.toBeNull()
    expect(host.innerHTML).not.toContain('undefined')
  })
})
