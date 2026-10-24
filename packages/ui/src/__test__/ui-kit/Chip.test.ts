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

import { addStringsLoader, getEmbeddedLabel, type Asset, type IntlString, type Plugin } from '@hcengineering/platform'
import { tick, type ComponentProps } from 'svelte'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import Chip from '../../ui-kit/chip/Chip.svelte'

beforeAll(() => {
  addStringsLoader('ui' as Plugin, async () => ({
    string: { Remove: 'Remove', RemoveItem: 'Remove {label}', ChipCount: '+{count}' }
  }))
})

async function settle (): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20))
  await tick()
}

let target: HTMLElement
const mounted: Array<{ $destroy: () => void }> = []

function mount (props: ComponentProps<Chip>): { chip: HTMLElement, component: Chip } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new Chip({ target: host, props })
  mounted.push(component)
  return { chip: host.querySelector('.chip') as HTMLElement, component }
}

describe('ui-kit Chip', () => {
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

  it('is a small tint chip with its label and no button by default', async () => {
    const { chip } = mount({ label: getEmbeddedLabel('issue.created') })
    await tick()
    expect(chip.classList.contains('chip--tint')).toBe(true)
    expect(chip.classList.contains('chip--small')).toBe(true)
    expect(chip.textContent?.trim()).toBe('issue.created')
    expect(chip.querySelector('button')).toBeNull()
  })

  it('removes by its named button and by Backspace on it, without bubbling the click', async () => {
    const { chip, component } = mount({ label: getEmbeddedLabel('Space'), removable: true })
    const onRemove = vi.fn<(event: CustomEvent<null>) => void>()
    const onOuterClick = vi.fn()
    component.$on('remove', onRemove)
    target.addEventListener('click', onOuterClick)

    const button = chip.querySelector('button') as HTMLButtonElement
    await settle()
    expect(button.getAttribute('aria-label')).toBe('Remove Space')
    button.click()
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }))
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(onRemove.mock.calls.map(([event]) => event.detail)).toEqual([null, null])
    expect(onOuterClick).not.toHaveBeenCalled()
  })

  it('takes a data color and keeps the kind and size classes', () => {
    const { chip } = mount({
      label: getEmbeddedLabel('Frontend'),
      kind: 'solid',
      size: 'extra-small',
      color: '#ff0000'
    })
    expect(chip.classList.contains('chip--solid')).toBe(true)
    expect(chip.classList.contains('chip--extra-small')).toBe(true)
    expect(chip.style.getPropertyValue('--_color')).toBe('#ff0000')
  })

  it('focuses its remove button', () => {
    const { chip, component } = mount({ label: getEmbeddedLabel('Space'), removable: true })
    component.focus()
    expect(document.activeElement).toBe(chip.querySelector('button'))
  })

  it('removes by Delete and prevents the default of both keys', () => {
    const { chip, component } = mount({ label: getEmbeddedLabel('Space'), removable: true })
    const onRemove = vi.fn()
    component.$on('remove', onRemove)
    const button = chip.querySelector('button') as HTMLButtonElement
    const backspace = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true })
    const del = new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true })
    button.dispatchEvent(backspace)
    button.dispatchEvent(del)
    expect(onRemove).toHaveBeenCalledTimes(2)
    expect(backspace.defaultPrevented).toBe(true)
    expect(del.defaultPrevented).toBe(true)
  })

  it('shows an icon before the label, smaller in extra-small', async () => {
    const { chip, component } = mount({ label: getEmbeddedLabel('general'), icon: 'ui:icon:Thread' as Asset })
    const icon = chip.querySelector('.chip__icon svg')
    expect(icon?.getAttribute('class')).toBe('svg-small')
    expect(chip.firstElementChild?.classList.contains('chip__icon')).toBe(true)
    component.$set({ size: 'extra-small' })
    await tick()
    expect(chip.querySelector('.chip__icon svg')?.getAttribute('class')).toBe('svg-x-small')
  })

  it('falls back to tint small when kind and size are later set to undefined', async () => {
    const { chip, component } = mount({ label: getEmbeddedLabel('Space'), kind: 'solid', size: 'extra-small' })
    component.$set({ kind: undefined, size: undefined })
    await tick()
    expect(chip.classList.contains('chip--tint')).toBe(true)
    expect(chip.classList.contains('chip--small')).toBe(true)
  })

  it('names the remove button after the translated label with its params', async () => {
    const { chip } = mount({ label: 'ui:string:ChipCount' as IntlString, labelParams: { count: 3 }, removable: true })
    await settle()
    expect(chip.querySelector('button')?.getAttribute('aria-label')).toBe('Remove +3')
  })

  it('keeps the name of the latest label when labels change quickly', async () => {
    const { chip, component } = mount({ label: getEmbeddedLabel('Space'), removable: true })
    component.$set({ label: 'ui:string:ChipCount' as IntlString, labelParams: { count: 5 } })
    component.$set({ label: getEmbeddedLabel('Frontend'), labelParams: {} })
    await settle()
    expect(chip.querySelector('button')?.getAttribute('aria-label')).toBe('Remove Frontend')
  })

  it('takes the state colors from tone over kind and color', () => {
    const { chip } = mount({ label: getEmbeddedLabel('Active'), kind: 'outline', color: 'red', tone: 'positive' })
    expect(chip.classList.contains('chip--tone-positive')).toBe(true)
    expect(chip.classList.contains('chip--outline')).toBe(false)
  })
})
