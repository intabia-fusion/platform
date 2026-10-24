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
import { addStringsLoader, getEmbeddedLabel, type Asset, type Plugin } from '@hcengineering/platform'
import { themeStore, ThemeOptions } from '@hcengineering/theme'
import { tick } from 'svelte'
import { get } from 'svelte/store'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AccordionItemProps } from '../../ui-kit/accordion/types'
import AccordionItemWithSlots from './AccordionItemWithSlots.svelte'

const LABEL = getEmbeddedLabel('Today')

let target: HTMLElement
const mounted: Array<{ $destroy: () => void }> = []

function mount (props: AccordionItemProps): { root: HTMLElement, component: AccordionItemWithSlots } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new AccordionItemWithSlots({ target: host, props: { props } })
  mounted.push(component)
  return { root: host.querySelector('.accordion-item') as HTMLElement, component }
}

function content (root: HTMLElement): HTMLElement {
  return root.querySelector('.accordion-item__content') as HTMLElement
}

describe('ui-kit AccordionItem', () => {
  beforeAll(() => {
    addStringsLoader('ui' as Plugin, async () => ({
      string: { DaysShort: '{value}d', HoursShort: '{value}h', MinutesShort: '{value}m' }
    }))
  })

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

  it('toggles the content region from the header button, keeping it mounted', async () => {
    const { root, component } = mount({ label: LABEL })
    const onToggle = vi.fn<(event: CustomEvent<boolean>) => void>()
    component.$on('toggle', onToggle)
    const toggle = root.querySelector('.accordion-item__toggle') as HTMLButtonElement
    const region = content(root)

    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(toggle.getAttribute('aria-controls')).toBe(region.id)
    expect(region.getAttribute('role')).toBe('region')
    expect(region.getAttribute('aria-labelledby')).toBe(toggle.id)
    expect(region.hidden).toBe(true)
    expect(region.querySelector('.content')).not.toBeNull()

    toggle.click()
    await tick()
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(region.hidden).toBe(false)
    toggle.click()
    await tick()
    expect(region.hidden).toBe(true)
    expect(onToggle.mock.calls.map(([event]) => event.detail)).toEqual([true, false])
  })

  it('keeps the actions outside the toggle button', () => {
    const { root } = mount({ label: LABEL, open: true })
    const action = root.querySelector('.action') as HTMLElement
    expect(action.closest('.accordion-item__toggle')).toBeNull()
    expect(action.closest('.accordion-item__actions')).not.toBeNull()
  })

  it('shows counter and the meta slot after the title', () => {
    const { root } = mount({ label: LABEL, counter: 3 })
    expect(root.querySelector('.accordion-item__counter')?.textContent).toBe('3')
    expect(root.querySelector('.accordion-item__duration .planned')?.textContent).toBe('+1h')
  })

  it('has a chevron in large, none in medium', () => {
    const large = mount({ label: LABEL }).root
    const medium = mount({ label: LABEL, size: 'medium', icon: 'ui:icon:Folder' as Asset }).root
    expect(large.classList.contains('accordion-item--large')).toBe(true)
    expect(large.querySelector('.accordion-item__chevron')).not.toBeNull()
    expect(medium.classList.contains('accordion-item--medium')).toBe(true)
    expect(medium.querySelector('.accordion-item__chevron')).toBeNull()
    expect(medium.querySelector('.accordion-item__icon')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('splits a selectable header into a chevron toggle and a title that selects', async () => {
    const { root, component } = mount({ label: LABEL, selected: true })
    const onToggle = vi.fn()
    const onSelect = vi.fn<(event: CustomEvent<null>) => void>()
    component.$on('toggle', onToggle)
    component.$on('select', onSelect)
    const chevron = root.querySelector('.accordion-item__chevron--button') as HTMLButtonElement
    const title = root.querySelector('.accordion-item__title--select') as HTMLButtonElement

    expect(chevron.getAttribute('aria-labelledby')).toBe(title.id)
    expect(title.getAttribute('aria-current')).toBe('true')
    title.click()
    await tick()
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect.mock.calls[0][0].detail).toBeNull()
    expect(onToggle).not.toHaveBeenCalled()
    chevron.click()
    await tick()
    expect(chevron.getAttribute('aria-expanded')).toBe('true')
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('does not toggle when disabled and hides the chevron', async () => {
    const { root } = mount({ label: LABEL, disabled: true })
    const toggle = root.querySelector('.accordion-item__toggle') as HTMLButtonElement
    expect(toggle.disabled).toBe(true)
    expect(root.querySelector('.accordion-item__chevron')).toBeNull()
    toggle.click()
    await tick()
    expect(content(root).hidden).toBe(true)
  })

  it('makes the header sticky on request', () => {
    const { root } = mount({ label: LABEL, sticky: true })
    expect(root.querySelector('.accordion-item__header--sticky')).not.toBeNull()
  })

  it('keeps an invisible chevron place in a disabled small disclosure, so titles stay aligned', async () => {
    const { root } = mount({ label: LABEL, size: 'small', disabled: true })
    const chevron = root.querySelector('.accordion-item__chevron') as HTMLElement
    expect(root.classList.contains('accordion-item--small')).toBe(true)
    expect(chevron.classList.contains('accordion-item__chevron--spacer')).toBe(true)
    ;(root.querySelector('.accordion-item__toggle') as HTMLButtonElement).click()
    await tick()
    expect(content(root).hidden).toBe(true)
  })

  it('renders lazy content on the first open and keeps it after closing', async () => {
    const { root } = mount({ label: LABEL, size: 'small', lazy: true })
    const toggle = root.querySelector('.accordion-item__toggle') as HTMLButtonElement
    expect(content(root).querySelector('.content')).toBeNull()
    toggle.click()
    await tick()
    expect(content(root).querySelector('.content')).not.toBeNull()
    toggle.click()
    await tick()
    expect(content(root).hidden).toBe(true)
    expect(content(root).querySelector('.content')).not.toBeNull()
  })

  it('puts the header on a plate when filled', () => {
    const { root } = mount({ label: LABEL, size: 'small', filled: true })
    expect(root.classList.contains('accordion-item--filled')).toBe(true)
  })

  it('does not make a landmark of every small disclosure', () => {
    const region = content(mount({ label: LABEL, size: 'small', open: true }).root)
    const toggle = region.parentElement?.querySelector('.accordion-item__toggle') as HTMLButtonElement
    expect(region.getAttribute('role')).toBeNull()
    expect(region.getAttribute('aria-labelledby')).toBeNull()
    expect(toggle.getAttribute('aria-controls')).toBe(region.id)
  })

  it('follows open set by the place', async () => {
    const { root, component } = mount({ label: LABEL })
    const toggle = root.querySelector('.accordion-item__toggle') as HTMLButtonElement
    component.$set({ props: { label: LABEL, open: true } })
    await tick()
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(content(root).hidden).toBe(false)
  })

  it('shows a zero counter', () => {
    const { root } = mount({ label: LABEL, counter: 0 })
    expect(root.querySelector('.accordion-item__counter')?.textContent).toBe('0')
  })

  it('formats the duration after the counter', async () => {
    const { root } = mount({ label: LABEL, duration: 90 * 60 * 1000 })
    await vi.waitFor(() => {
      expect(root.querySelector('.accordion-item__duration')?.textContent).toBe('1h 30m+1h')
    })
  })

  it('keeps the title of a disabled selectable section selectable, the chevron does not toggle', async () => {
    const { root, component } = mount({ label: LABEL, selected: false, disabled: true })
    const onSelect = vi.fn()
    component.$on('select', onSelect)
    const chevron = root.querySelector('.accordion-item__chevron--button') as HTMLButtonElement
    const title = root.querySelector('.accordion-item__title--select') as HTMLButtonElement
    expect(chevron.disabled).toBe(true)
    expect(title.disabled).toBe(false)
    // Still a leaf: the caption is dimmed like a disabled header.
    expect(title.classList.contains('accordion-item__title--disabled')).toBe(true)
    expect(title.getAttribute('aria-current')).toBeNull()
    chevron.click()
    title.click()
    await tick()
    expect(content(root).hidden).toBe(true)
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('gives a selectable medium subgroup a chevron to toggle', () => {
    const { root } = mount({ label: LABEL, size: 'medium', selected: true })
    expect(root.querySelector('.accordion-item__chevron--button')).not.toBeNull()
    expect(root.querySelector('.accordion-item__title--selected')).not.toBeNull()
  })

  it('uses native buttons, so Enter and Space work and the header is not a form submit', () => {
    const { root } = mount({ label: LABEL, selected: false })
    const buttons = Array.from(root.querySelectorAll('.accordion-item__header > button')) as HTMLButtonElement[]
    expect(buttons).toHaveLength(2)
    expect(buttons.every((button) => button.type === 'button')).toBe(true)
  })

  it('keeps the duration of the latest language when a slower answer for a previous one arrives late', async () => {
    const original = get(themeStore)
    const { root } = mount({ label: LABEL, duration: 60 * 1000 })
    const duration = (): string | undefined => root.querySelector('.accordion-item__duration')?.textContent ?? undefined
    await vi.waitFor(() => {
      expect(duration()).toBe('1m+1h')
    })
    // German strings arrive late, French ones at once.
    addStringsLoader('ui' as Plugin, async (lang: string) => {
      if (lang === 'de') await new Promise((resolve) => setTimeout(resolve, 100))
      return { string: { DaysShort: '{value}d', HoursShort: '{value}h', MinutesShort: `{value}${lang}` } }
    })
    try {
      themeStore.set(new ThemeOptions(16, false, 'de', '', original.accent))
      await tick()
      themeStore.set(new ThemeOptions(16, false, 'fr', '', original.accent))
      await vi.waitFor(() => {
        expect(duration()).toBe('1fr+1h')
      })
      await new Promise((resolve) => setTimeout(resolve, 200))
      expect(duration()).toBe('1fr+1h')
    } finally {
      themeStore.set(original)
    }
  })
})
