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

import { tick } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'svelte'
import TimeZonesPopup from '../components/TimeZonesPopup.svelte'
import type { TimeZone } from '../types'

const TZS: TimeZone[] = [
  { id: 'Europe/Berlin', continent: 'Europe', city: 'Berlin', short: 'Berlin' },
  { id: 'Europe/Paris', continent: 'Europe', city: 'Paris', short: 'Paris' },
  { id: 'America/New_York', continent: 'America', city: 'New York', short: 'New York' }
]

let target: HTMLElement

interface Mounted {
  component: TimeZonesPopup
  host: HTMLElement
}

function mount (props: Partial<ComponentProps<TimeZonesPopup>>): Mounted {
  const host = document.createElement('div')
  target.appendChild(host)
  const merged = { timeZones: TZS, count: 1, reset: null, ...props }
  const component = new TimeZonesPopup({ target: host, props: merged as ComponentProps<TimeZonesPopup> })
  return { component, host }
}

async function search (host: HTMLElement, text: string): Promise<void> {
  const input = host.querySelector('input') as HTMLInputElement
  input.value = text
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await tick()
}

describe('TimeZonesPopup', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('groups time zones by continent, collapsed by default', () => {
    const { host } = mount({ selected: 'none' })
    const headers = host.querySelectorAll('.menu-group__header')
    expect(headers).toHaveLength(2) // Europe, America
    headers.forEach((h) => {
      expect(h.classList.contains('show')).toBe(false)
    })
  })

  it('toggles a group open on header click', async () => {
    const { host } = mount({ selected: 'none' })
    const header = host.querySelector('.menu-group__header') as HTMLElement
    header.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await tick()
    expect(header.classList.contains('show')).toBe(true)
  })

  it('filters items by city, and opens the matching groups', async () => {
    const { host } = mount({ selected: 'none' })
    await search(host, 'paris')

    const headers = host.querySelectorAll('.menu-group__header')
    expect(headers).toHaveLength(1)
    expect(headers[0].textContent).toContain('Europe')
    expect(headers[0].classList.contains('show')).toBe(true)
    const items = host.querySelectorAll('.menu-item')
    expect(items).toHaveLength(1)
    expect(items[0].textContent).toContain('Paris')
  })

  it('shows the empty state when nothing matches', async () => {
    const { host } = mount({ selected: 'none' })
    await search(host, 'nowhere')
    expect(host.querySelectorAll('.menu-group__header')).toHaveLength(0)
    expect(host.querySelector('.empty')).not.toBeNull()
  })

  it('shows the selected zone only when `selected` matches a known id', () => {
    const withSelection = mount({ selected: 'Europe/Berlin' })
    expect(withSelection.host.querySelector('.header.flex-col')).not.toBeNull()
    expect(withSelection.host.querySelector('.label')?.textContent?.trim()).toBe('Berlin')

    const withoutSelection = mount({ selected: 'does-not-exist' })
    expect(withoutSelection.host.querySelector('.header.flex-col')).toBeNull()
  })

  it('the reset action restores `selected` to `reset` and dispatches update', async () => {
    const { host, component } = mount({ selected: 'Europe/Berlin', reset: 'Europe/Paris', count: 1 })
    const onUpdate = vi.fn()
    component.$on('update', onUpdate)

    const resetBtn = host.querySelector('.header.flex-col button') as HTMLElement
    resetBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await tick()

    expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ detail: 'reset' }))
    expect(host.querySelector('.label')?.textContent?.trim()).toBe('Paris')
  })

  it('shows the delete action only when count > 1, and it dispatches close', () => {
    const single = mount({ selected: 'Europe/Berlin', count: 1 })
    expect(single.host.querySelectorAll('.header.flex-col button')).toHaveLength(0)

    const onClose = vi.fn()
    const multiple = mount({ selected: 'Europe/Berlin', count: 2 })
    multiple.component.$on('close', onClose)
    const closeBtn = multiple.host.querySelector('.header.flex-col button') as HTMLElement
    closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onClose).toHaveBeenCalledWith(expect.objectContaining({ detail: 'delete' }))
  })

  it('clicking a time zone row dispatches close with its id', () => {
    const { host, component } = mount({ selected: 'none', withAdd: false })
    const onClose = vi.fn()
    component.$on('close', onClose)

    const item = host.querySelector('.menu-item') as HTMLElement
    item.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onClose).toHaveBeenCalledWith(expect.objectContaining({ detail: expect.any(String) }))
  })

  it('the add button increments count and dispatches update, and disables past the limit of 4', async () => {
    const { host, component } = mount({ selected: 'none', count: 4 })
    const onUpdate = vi.fn()
    component.$on('update', onUpdate)

    const addBtn = host.querySelector('.tool button') as HTMLButtonElement
    expect(addBtn.disabled).toBe(false)
    addBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await tick()

    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(addBtn.disabled).toBe(true)
  })

  it('hides the add button entirely when withAdd is false', () => {
    const { host } = mount({ selected: 'none', withAdd: false })
    expect(host.querySelectorAll('.tool')).toHaveLength(0)
  })
})
