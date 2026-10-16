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
import { tick, type ComponentProps } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DropdownIntlItem } from '../../types'
import MenuButton from '../../ui-kit/button/MenuButton.svelte'
import MenuButtonWithContent from './MenuButtonWithContent.svelte'

const popups = vi.hoisted(() => ({
  showPopup: vi.fn(),
  close: vi.fn(),
  update: vi.fn()
}))

vi.mock('../../popups', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  showPopup: popups.showPopup
}))

type OnClose = (result: DropdownIntlItem['id'] | undefined) => void

const ICON = 'ui:icon:Settings' as Asset
const ITEMS: DropdownIntlItem[] = [
  { id: 'list', label: getEmbeddedLabel('List') },
  { id: 'board', label: getEmbeddedLabel('Board') }
]

let target: HTMLElement
const mounted: Array<{ $destroy: () => void }> = []

function mount (props: ComponentProps<MenuButton>): { button: HTMLButtonElement, component: MenuButton } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new MenuButton({ target: host, props })
  mounted.push(component)
  return { button: host.querySelector('button') as HTMLButtonElement, component }
}

function lastOnClose (): OnClose {
  return popups.showPopup.mock.calls[popups.showPopup.mock.calls.length - 1][3] as OnClose
}

describe('ui-kit MenuButton', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
    popups.showPopup.mockReset().mockReturnValue({ id: 'popup', close: popups.close, update: popups.update })
    popups.close.mockReset()
    popups.update.mockReset()
  })

  afterEach(() => {
    mounted.splice(0).forEach((component) => {
      component.$destroy()
    })
    target.remove()
  })

  it('is a menu button that reports a closed popup', () => {
    const { button } = mount({ items: ITEMS, label: getEmbeddedLabel('View') })
    expect(button.classList.contains('button--menu')).toBe(true)
    expect(button.getAttribute('aria-haspopup')).toBe('true')
    expect(button.getAttribute('aria-expanded')).toBe('false')
  })

  it('opens the list next to the button and reports it open', async () => {
    const { button } = mount({ items: ITEMS, selected: 'board', itemParams: { count: 2 } })
    button.click()
    await tick()

    expect(popups.showPopup).toHaveBeenCalledTimes(1)
    const [, props, anchor] = popups.showPopup.mock.calls[0]
    expect(props).toEqual({ items: ITEMS, selected: 'board', params: { count: 2 } })
    expect(anchor).toBe(button)
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(button.classList.contains('button--pressed')).toBe(true)
  })

  it('keeps the popup state its own even if pressed slips through untyped', () => {
    const { button } = mount({ items: ITEMS, ...({ pressed: true } as unknown as Partial<ComponentProps<MenuButton>>) })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(button.classList.contains('button--pressed')).toBe(false)
  })

  it('does not open a second list while one is open', () => {
    const { button } = mount({ items: ITEMS })
    button.click()
    button.click()
    expect(popups.showPopup).toHaveBeenCalledTimes(1)
  })

  it('dispatches and keeps the picked item, then reports the popup closed', async () => {
    const { button, component } = mount({ items: ITEMS })
    const onSelected = vi.fn<(event: CustomEvent<DropdownIntlItem['id']>) => void>()
    component.$on('selected', onSelected)

    button.click()
    lastOnClose()('board')
    await tick()
    expect(onSelected).toHaveBeenCalledTimes(1)
    expect(onSelected.mock.calls[0][0].detail).toBe('board')
    expect(button.getAttribute('aria-expanded')).toBe('false')

    button.click()
    expect(popups.showPopup.mock.calls[1][1].selected).toBe('board')
  })

  it('dispatches nothing when the list closes without a pick', () => {
    const { button, component } = mount({ items: ITEMS })
    const onSelected = vi.fn()
    component.$on('selected', onSelected)
    button.click()
    lastOnClose()(undefined)
    expect(onSelected).not.toHaveBeenCalled()
  })

  it('leaves the selected item unmarked with noSelection', () => {
    const { button } = mount({ items: ITEMS, selected: 'list', noSelection: true })
    button.click()
    expect(popups.showPopup.mock.calls[0][1].selected).toBeUndefined()
  })

  it('selects a single item right away with autoSelectSingle', () => {
    const { button, component } = mount({ items: [ITEMS[0]], autoSelectSingle: true })
    const onSelected = vi.fn<(event: CustomEvent<DropdownIntlItem['id']>) => void>()
    component.$on('selected', onSelected)
    button.click()
    expect(popups.showPopup).not.toHaveBeenCalled()
    expect(onSelected.mock.calls[0][0].detail).toBe('list')
  })

  it('updates an open list in place when items change', async () => {
    const { button, component } = mount({ items: ITEMS })
    button.click()
    popups.update.mockClear()

    const next = [...ITEMS, { id: 'table', label: getEmbeddedLabel('Table') }]
    component.$set({ items: next })
    await tick()
    expect(popups.update).toHaveBeenCalledWith({ items: next, selected: undefined, params: {} })
    expect(popups.showPopup).toHaveBeenCalledTimes(1)
  })

  it('sends no update right after opening or for equal items recreated by the parent', async () => {
    const { button, component } = mount({ items: ITEMS })
    button.click()
    await tick()
    expect(popups.update).not.toHaveBeenCalled()

    component.$set({ items: ITEMS.map((item) => ({ ...item })) })
    await tick()
    expect(popups.update).not.toHaveBeenCalled()
  })

  it('closes its own open list when destroyed', () => {
    const { button, component } = mount({ items: ITEMS })
    button.click()
    component.$destroy()
    expect(popups.close).toHaveBeenCalledTimes(1)
  })

  it('is icon-only without label or content, and not with slot content', () => {
    const { button } = mount({ items: ITEMS, icon: ICON })
    expect(button.classList.contains('button--icon-only')).toBe(true)

    const host = document.createElement('div')
    target.appendChild(host)
    mounted.push(new MenuButtonWithContent({ target: host, props: { icon: ICON, items: ITEMS } }))
    const withContent = host.querySelector('button') as HTMLButtonElement
    expect(withContent.querySelector('.content')?.textContent).toBe('Custom')
    expect(withContent.classList.contains('button--icon-only')).toBe(false)
  })

  it('forwards click to the caller as well', () => {
    const { button, component } = mount({ items: ITEMS })
    const onClick = vi.fn()
    component.$on('click', onClick)
    button.click()
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
