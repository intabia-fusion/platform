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
import { type ComponentProps } from 'svelte'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import SettingRowWithSlots from './SettingRowWithSlots.svelte'

let target: HTMLElement
const mounted: Array<{ $destroy: () => void }> = []

function mount (props: ComponentProps<SettingRowWithSlots>): HTMLElement {
  const host = document.createElement('div')
  target.appendChild(host)
  mounted.push(new SettingRowWithSlots({ target: host, props }))
  return host.querySelector('.setting-row') as HTMLElement
}

describe('ui-kit SettingRow', () => {
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

  it('names the control with its caption', () => {
    const root = mount({ props: { label: getEmbeddedLabel('Task type') } })
    const caption = root.querySelector('.setting-row__label') as HTMLElement
    const control = root.querySelector('.control') as HTMLElement
    expect(caption.textContent).toContain('Task type')
    expect(control.getAttribute('aria-labelledby')).toBe(caption.id)
    expect(caption.id).not.toBe('')
  })

  it('gives each row its own caption id', () => {
    const first = mount({ props: { label: getEmbeddedLabel('From') } })
    const second = mount({ props: { label: getEmbeddedLabel('To') } })
    expect(first.querySelector('.setting-row__label')?.id).not.toBe(second.querySelector('.setting-row__label')?.id)
  })

  it('shows the hint button only with a hint', () => {
    const withHint = mount({ props: { label: getEmbeddedLabel('Root'), hint: getEmbeddedLabel('Can be top level') } })
    expect(withHint.querySelectorAll('.setting-row__caption button')).toHaveLength(1)
    expect(
      mount({ props: { label: getEmbeddedLabel('Root') } }).querySelectorAll('.setting-row__caption button')
    ).toHaveLength(0)
  })

  it('draws details only when the slot has content and stacks on request', () => {
    expect(
      mount({ props: { label: getEmbeddedLabel('Parents') }, details: true }).querySelector(
        '.setting-row__details .chip'
      )
    ).not.toBeNull()
    const stacked = mount({ props: { label: getEmbeddedLabel('Description'), stacked: true } })
    expect(stacked.classList.contains('setting-row--stacked')).toBe(true)
  })

  it('draws a list item: plate, caption with description, the control named and described by them', () => {
    const root = mount({
      props: {
        label: getEmbeddedLabel('Anonymous voting'),
        variant: 'list',
        icon: 'ui:icon:Settings' as Asset,
        color: 'Mauve',
        description: getEmbeddedLabel('No one sees who voted for what')
      }
    })
    const control = root.querySelector('.control') as HTMLElement
    const caption = root.querySelector('label.setting-row__text') as HTMLLabelElement
    expect(root.classList.contains('setting-row--list')).toBe(true)
    expect(root.querySelector('.setting-row__icon .icon-box--tinted')).not.toBeNull()
    expect(caption.htmlFor).toBe(control.id)
    expect(control.getAttribute('aria-labelledby')).toBe(root.querySelector('.setting-row__title')?.id)
    expect(control.getAttribute('aria-describedby')).toBe(root.querySelector('.setting-row__description')?.id)
    expect(root.querySelector('.setting-row__description')?.textContent).toContain('No one sees')
  })

  it('has no plate and no description id without them, and marks a disabled item', () => {
    const root = mount({ props: { label: getEmbeddedLabel('Quiz mode'), variant: 'list', disabled: true } })
    expect(root.querySelector('.setting-row__icon')).toBeNull()
    expect(root.querySelector('.control')?.hasAttribute('aria-describedby')).toBe(false)
    expect(root.classList.contains('setting-row--disabled')).toBe(true)
  })
})
