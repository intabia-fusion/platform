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
import { getEmbeddedLabel, translateCB, type Asset } from '@hcengineering/platform'
import { tick, type ComponentProps } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import Menu from '../../ui-kit/menu/Menu.svelte'
import type { MenuItem } from '../../ui-kit/menu/types'

vi.mock('@hcengineering/platform', async (importOriginal) => {
  const platform = await importOriginal<typeof import('@hcengineering/platform')>()
  return { ...platform, translateCB: vi.fn(platform.translateCB) }
})

const popups = vi.hoisted(() => ({ showPopup: vi.fn(), closePopup: vi.fn() }))

vi.mock('../../popups', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  showPopup: popups.showPopup,
  closePopup: popups.closePopup
}))

const t = getEmbeddedLabel
const ITEMS: MenuItem[] = [
  { id: 'open', label: t('Open'), icon: 'ui:icon:Open' as Asset },
  { id: 'copy', label: t('Copy link'), icon: 'ui:icon:Link' as Asset },
  { id: 'delete', label: t('Delete'), icon: 'ui:icon:Delete' as Asset, divider: true }
]
const TREE: MenuItem[] = [
  { id: 'doc', label: t('Document') },
  {
    id: 'component',
    label: t('Game Component'),
    children: [
      { id: 'character', label: t('Character'), children: [{ id: 'enemy', label: t('Enemy') }] },
      { id: 'item', label: t('Item') }
    ]
  }
]

let target: HTMLElement
const mounted: Array<{ $destroy: () => void }> = []

function mount (props: ComponentProps<Menu>): { host: HTMLElement, component: Menu, rows: () => HTMLElement[] } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new Menu({ target: host, props: { autofocus: false, ...props } })
  mounted.push(component)
  return { host, component, rows: () => Array.from(host.querySelectorAll<HTMLElement>('.menu__row')) }
}

async function settle (): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await tick()
}

function text (rows: HTMLElement[]): string[] {
  return rows.map((row) => row.querySelector('.menu__label')?.textContent?.trim() ?? '')
}

describe('ui-kit Menu', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
    popups.showPopup.mockReset().mockReturnValue({ id: 'sub', close: vi.fn(), update: vi.fn() })
    popups.closePopup.mockReset()
  })

  afterEach(() => {
    mounted.splice(0).forEach((component) => {
      component.$destroy()
    })
    target.remove()
  })

  it('is a menu of menuitem rows with a line before a divider item', async () => {
    const { host, rows } = mount({ items: ITEMS, 'aria-label': 'Actions' })
    await settle()
    const list = host.querySelector('[role="menu"]')
    expect(list?.getAttribute('aria-label')).toBe('Actions')
    expect(rows().map((row) => row.getAttribute('role'))).toEqual(['menuitem', 'menuitem', 'menuitem'])
    expect(text(rows())).toEqual(['Open', 'Copy link', 'Delete'])
    expect(host.querySelectorAll('.menu__divider')).toHaveLength(1)
  })

  it('closes with the chosen id', async () => {
    const { component, rows } = mount({ items: ITEMS })
    const onClose = vi.fn()
    component.$on('close', onClose)
    rows()[1].click()
    await tick()
    expect(onClose.mock.calls.map(([event]) => event.detail)).toEqual(['copy'])
  })

  it('checks the selected row as a radio item', () => {
    const { rows } = mount({ items: ITEMS, selected: 'copy' })
    expect(rows().map((row) => row.getAttribute('role'))).toEqual(['menuitemradio', 'menuitemradio', 'menuitemradio'])
    expect(rows().map((row) => row.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false'])
  })

  it('toggles with multiselect, stays open and keeps an exclusive item alone', async () => {
    const items: MenuItem[] = [{ id: 'any', label: t('Any'), exclusive: true }, ...ITEMS]
    const { component, rows } = mount({ items, selected: ['open'], multiselect: true })
    const onUpdate = vi.fn()
    const onClose = vi.fn()
    component.$on('update', onUpdate)
    component.$on('close', onClose)

    rows()[2].click()
    await tick()
    rows()[0].click()
    await tick()
    rows()[1].click()
    await tick()
    expect(onUpdate.mock.calls.map(([event]) => event.detail)).toEqual([['open', 'copy'], ['any'], ['open']])
    expect(onClose).not.toHaveBeenCalled()
    expect(rows()[1].getAttribute('role')).toBe('menuitemcheckbox')
    expect(rows()[1].getAttribute('aria-checked')).toBe('true')
  })

  it('searches every level flat, with the parents in the second line', async () => {
    const { rows, component, host } = mount({ items: TREE, search: 'nem' })
    await settle()
    expect(text(rows())).toEqual(['Enemy'])
    expect(rows()[0].querySelector('.menu__description')?.textContent?.trim()).toBe('Game Component › Character')
    component.$set({ search: 'zzz' })
    await settle()
    expect(rows()).toHaveLength(0)
    expect(host.querySelector('.menu__empty')).not.toBeNull()
  })

  it('opens children in a submenu, the parent first and its children under a line', async () => {
    const { rows } = mount({ items: TREE })
    const parent = rows()[1]
    expect(parent.getAttribute('aria-haspopup')).toBe('menu')
    parent.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    await tick()
    expect(popups.showPopup).toHaveBeenCalledTimes(1)
    const [component, props, anchor, , , options] = popups.showPopup.mock.calls[0]
    expect(component).toBe(Menu)
    expect(props.items.map((it: MenuItem) => it.id)).toEqual(['component', 'character', 'item'])
    expect(props.items[1].divider).toBe(true)
    expect(anchor.kind).toBe('submenu')
    expect(options.overlay).toBe(false)
    expect(parent.getAttribute('aria-expanded')).toBe('true')
  })

  it('leaves the parent out with submenuOnly and sends a submenu choice to the root', async () => {
    const items: MenuItem[] = [{ id: 'type', label: t('Type'), submenuOnly: true, children: ITEMS }]
    const { rows, component } = mount({ items })
    const onClose = vi.fn()
    component.$on('close', onClose)
    rows()[0].click()
    await tick()
    const props = popups.showPopup.mock.calls[0][1]
    expect(props.items.map((it: MenuItem) => it.id)).toEqual(['open', 'copy', 'delete'])
    props.onSelect('copy')
    expect(onClose.mock.calls[0][0].detail).toBe('copy')
  })

  it('reports the result of a popup submenu and closes with null', async () => {
    const Picker = vi.fn() as any
    const items: MenuItem[] = [{ id: 'icon', label: t('Change icon'), popup: { component: Picker, props: { a: 1 } } }]
    const { rows, component } = mount({ items })
    const onSubmenu = vi.fn()
    const onClose = vi.fn()
    component.$on('submenu', onSubmenu)
    component.$on('close', onClose)
    rows()[0].click()
    await tick()
    const [shown, props, , onPopupClose] = popups.showPopup.mock.calls[0]
    expect(shown).toBe(Picker)
    expect(props).toEqual({ a: 1 })
    onPopupClose('star')
    expect(onSubmenu.mock.calls[0][0].detail).toEqual({ id: 'icon', result: 'star' })
    expect(onClose.mock.calls[0][0].detail).toBeNull()
  })

  it('takes the focus back from a popup submenu that grabs it when opened by hover', async () => {
    const items: MenuItem[] = [{ id: 'icon', label: t('Change icon'), popup: { component: vi.fn() as any } }]
    const { rows } = mount({ items })
    const outside = document.createElement('button')
    target.appendChild(outside)
    rows()[0].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    outside.focus()
    expect(document.activeElement).not.toBe(outside)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    outside.focus()
    expect(document.activeElement).toBe(outside)
  })

  it('gives the focus back without scrolling the page when a hover opens a submenu', async () => {
    const items: MenuItem[] = [{ id: 'icon', label: t('Change icon'), popup: { component: vi.fn() as any } }]
    const { rows } = mount({ items })
    const link = document.createElement('a')
    link.href = '#toc'
    target.appendChild(link)
    link.focus()
    const focus = vi.spyOn(link, 'focus')
    popups.showPopup.mockImplementationOnce(() => {
      link.blur()
      return { id: 'p', close: vi.fn(), update: vi.fn() }
    })
    rows()[0].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
    expect(document.activeElement).toBe(link)
  })

  it('closes the submenu when a scroll moves its row', async () => {
    const items: MenuItem[] = [{ id: 'icon', label: t('Change icon'), popup: { component: vi.fn() as any } }]
    const { rows } = mount({ items })
    const close = vi.fn()
    popups.showPopup.mockReturnValueOnce({ id: 'p', close, update: vi.fn() })
    rows()[0].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    const aside = document.createElement('div')
    target.appendChild(aside)
    aside.dispatchEvent(new Event('scroll'))
    expect(close).not.toHaveBeenCalled()
    target.dispatchEvent(new Event('scroll'))
    expect(close).toHaveBeenCalled()
  })

  it('closes the submenu when the pointer leaves the menu and its popups', async () => {
    const items: MenuItem[] = [{ id: 'icon', label: t('Change icon'), popup: { component: vi.fn() as any } }]
    const { rows } = mount({ items })
    const close = vi.fn()
    popups.showPopup.mockReturnValueOnce({ id: 'p', close, update: vi.fn() })
    rows()[0].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    const popup = document.createElement('div')
    popup.className = 'popup'
    const outside = document.createElement('div')
    target.append(popup, outside)
    popup.dispatchEvent(new MouseEvent('pointermove', { bubbles: true }))
    expect(close).not.toHaveBeenCalled()
    outside.dispatchEvent(new MouseEvent('pointermove', { bubbles: true }))
    expect(close).toHaveBeenCalled()
  })

  it('closes the submenu on a press outside the menu and its popups', async () => {
    const items: MenuItem[] = [{ id: 'icon', label: t('Change icon'), popup: { component: vi.fn() as any } }]
    const { rows } = mount({ items })
    const close = vi.fn()
    popups.showPopup.mockReturnValueOnce({ id: 'p', close, update: vi.fn() })
    rows()[0].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    const popup = document.createElement('div')
    popup.className = 'popup'
    const outside = document.createElement('div')
    target.append(popup, outside)
    popup.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    rows()[0].dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    expect(close).not.toHaveBeenCalled()
    outside.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    expect(close).toHaveBeenCalled()
  })

  it('moves the focus with the arrows and chooses with Enter from the search field', async () => {
    const { rows, host, component } = mount({ items: ITEMS, withSearch: true })
    const onClose = vi.fn()
    component.$on('close', onClose)
    const input = host.querySelector('input') as HTMLInputElement
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect(document.activeElement).toBe(rows()[0])
    rows()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    expect(document.activeElement).toBe(rows()[2])
    rows()[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    expect(document.activeElement).toBe(rows()[0])
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(onClose.mock.calls[0][0].detail).toBe('open')
  })

  it('is driven by onKeydown while the focus stays in an editor', async () => {
    const { rows, component } = mount({ items: ITEMS })
    const onClose = vi.fn()
    component.$on('close', onClose)
    expect(component.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }))).toBe(true)
    expect(component.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }))).toBe(true)
    await tick()
    expect(rows()[1].classList.contains('menu__row--active')).toBe(true)
    expect(component.onKeydown(new KeyboardEvent('keydown', { key: 'a' }))).toBe(false)
    component.onKeydown(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(onClose.mock.calls[0][0].detail).toBe('copy')
  })

  it('renders a link row that a modifier click leaves to the browser', async () => {
    const items: MenuItem[] = [{ id: 'settings', label: t('Settings'), href: '/settings', opensPage: true }]
    const { rows, component } = mount({ items })
    const onClose = vi.fn()
    component.$on('close', onClose)
    const link = rows()[0]
    expect(link.tagName).toBe('A')
    expect(link.getAttribute('href')).toBe('/settings')
    const modified = new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true })
    link.dispatchEvent(modified)
    expect(onClose).not.toHaveBeenCalled()
    const plain = new MouseEvent('click', { bubbles: true, cancelable: true })
    link.dispatchEvent(plain)
    expect(plain.defaultPrevented).toBe(true)
    expect(onClose.mock.calls[0][0].detail).toBe('settings')
  })

  it('marks a link row with the arrow unless opensPage turns it off', () => {
    const rows = mount({
      items: [
        { id: 'settings', label: t('Settings'), href: '/settings' },
        { id: 'here', label: t('Here'), href: '#here', opensPage: false }
      ]
    }).rows()
    expect(rows.map((row) => row.querySelector('.menu__icon--secondary svg') !== null)).toEqual([true, false])
  })

  it('shows a spinner on the chosen row while loading and ignores clicks', async () => {
    const { rows, component, host } = mount({ items: ITEMS })
    const onClose = vi.fn()
    component.$on('close', onClose)
    rows()[0].click()
    component.$set({ loading: true })
    await tick()
    expect(rows()[0].querySelector('.menu__icon .spinner, .menu__icon svg')).not.toBeNull()
    expect(rows()[0].getAttribute('aria-disabled')).toBe('true')
    rows()[1].click()
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(host.querySelector('[role="menu"]')?.getAttribute('aria-busy')).toBe('true')
  })

  it('draws a color swatch for a color item and keeps the label color', () => {
    const { rows } = mount({ items: [{ id: 'new', label: t('New'), color: 3 }] })
    expect(rows()[0].querySelector('.menu__swatch')).not.toBeNull()
    expect((rows()[0].querySelector('.menu__label') as HTMLElement).style.color).toBe('')
  })

  it('jumps to the next row by its first letters without a search field', async () => {
    const items: MenuItem[] = ['Delete', 'Copy', 'Cut', 'Duplicate'].map((name) => ({ id: name, label: t(name) }))
    const { rows } = mount({ items })
    await settle()
    rows()[0].focus()
    rows()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true }))
    expect(document.activeElement).toBe(rows()[1])
    rows()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'u', bubbles: true }))
    expect(document.activeElement).toBe(rows()[2])
    await new Promise((resolve) => setTimeout(resolve, 550))
    rows()[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }))
    expect(document.activeElement).toBe(rows()[3])
    rows()[3].dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }))
    expect(document.activeElement).toBe(rows()[0])
  })

  it('sends a letter typed on a row to the search field, ArrowUp from the field to the last row', async () => {
    const { rows, host } = mount({ items: ITEMS, withSearch: true })
    await settle()
    const input = host.querySelector('input') as HTMLInputElement
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    expect(document.activeElement).toBe(rows()[2])
    rows()[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'o', bubbles: true }))
    expect(document.activeElement).toBe(input)
  })

  it('does not redraw the labels of hundreds of rows on hover, submenu or highlight', async () => {
    const many: MenuItem[] = Array.from({ length: 300 }, (_, i) => ({
      id: `item-${i}`,
      label: t(`Item ${i}`),
      children: i % 50 === 0 ? [{ id: `child-${i}`, label: t(`Child ${i}`) }] : undefined
    }))
    const { rows, component } = mount({ items: many, withSearch: true, selected: 'item-1' })
    await settle()
    vi.mocked(translateCB).mockClear()

    rows()[0].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    rows()[5].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    rows()[50].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    component.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    component.$set({ selected: 'item-2' })
    await settle()
    expect(popups.showPopup).toHaveBeenCalled()
    expect(translateCB).not.toHaveBeenCalled()
  })

  it('draws every label once on mount, the search titles arriving later do not redraw the rows', async () => {
    const many: MenuItem[] = Array.from({ length: 100 }, (_, i) => ({ id: i, label: t(`Row ${i}`) }))
    vi.mocked(translateCB).mockClear()
    mount({ items: many, withSearch: true })
    await settle()
    await settle()
    const rowLabels = vi.mocked(translateCB).mock.calls.filter(([label]) => String(label).includes('Row '))
    expect(rowLabels).toHaveLength(100)
  })

  it('filters on a query keeping the matched rows, without new rows for the kept ones', async () => {
    const many: MenuItem[] = Array.from({ length: 30 }, (_, i) => ({ id: i, label: t(`Row ${i}`) }))
    const { rows, component } = mount({ items: many, search: 'row 1' })
    await settle()
    expect(rows()).toHaveLength(11)
    const kept = rows()[0]
    component.$set({ search: 'row 1 ' })
    await settle()
    expect(rows()[0]).toBe(kept)
    component.$set({ search: '' })
    await settle()
    expect(rows()).toHaveLength(30)
  })
  it('keeps the focus in the search field when a row with a submenu is hovered', async () => {
    // The popup host blurs the active element on open.
    popups.showPopup.mockImplementation(() => {
      ;(document.activeElement as HTMLElement | null)?.blur()
      return { id: 'sub', close: vi.fn(), update: vi.fn() }
    })
    const { host, rows } = mount({ items: TREE, withSearch: true })
    await settle()
    const field = host.querySelector('input') as HTMLInputElement
    field.focus()
    rows()[1].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    expect(popups.showPopup).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(field)
  })

  it('keeps the focus on the hovered row when it was in the list', async () => {
    popups.showPopup.mockImplementation(() => {
      ;(document.activeElement as HTMLElement | null)?.blur()
      return { id: 'sub', close: vi.fn(), update: vi.fn() }
    })
    const { rows } = mount({ items: TREE })
    await settle()
    rows()[0].focus()
    rows()[1].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    expect(document.activeElement).toBe(rows()[1])
  })

  it('gives an embedded menu without a field one Tab stop: the checked row, else the first, then the last focused', async () => {
    const { component, rows } = mount({ items: ITEMS, embedded: true, selected: 'copy' })
    await settle()
    const stops = (): string[] => rows().map((row) => row.getAttribute('tabindex') ?? '')
    expect(stops()).toEqual(['-1', '0', '-1'])

    component.$set({ selected: undefined })
    await settle()
    expect(stops()).toEqual(['0', '-1', '-1'])

    rows()[2].focus()
    await settle()
    expect(stops()).toEqual(['-1', '-1', '0'])
  })

  it('keeps every row out of the Tab order in a popup menu', async () => {
    const { rows } = mount({ items: ITEMS })
    await settle()
    expect(rows().every((row) => row.getAttribute('tabindex') === '-1')).toBe(true)
  })

  it('keeps the check column on every row of a choice, only on rows with a chevron in a plain menu', () => {
    const choice = mount({ items: ITEMS, selected: 'copy' }).rows()
    expect(choice.map((row) => row.querySelector('.menu__trail') !== null)).toEqual([true, true, true])
    expect(choice[1].querySelector('.menu__trail .menu__icon')).not.toBeNull()
    // An unchecked row keeps the empty check column, so the checks line up.
    expect(choice[0].querySelector('.menu__trail .menu__icon')).not.toBeNull()
    expect(choice[0].querySelector('.menu__trail svg')).toBeNull()

    const plain = mount({ items: TREE }).rows()
    expect(plain.map((row) => row.querySelector('.menu__trail') !== null)).toEqual([false, true])
  })

  it('parts groups by lines beside the headings, a line above them, or the headings alone', async () => {
    const items = [
      { id: 'a', label: getEmbeddedLabel('A'), heading: getEmbeddedLabel('One') },
      { id: 'b', label: getEmbeddedLabel('B'), heading: getEmbeddedLabel('Two'), divider: true }
    ]
    const { host, component } = mount({ items })
    expect(host.querySelectorAll('.menu__heading')).toHaveLength(2)
    expect(host.querySelectorAll('.menu__heading .menu__line')).toHaveLength(4)
    expect(host.querySelectorAll('.menu__divider')).toHaveLength(0)
    component.$set({ headings: 'divider' })
    await tick()
    expect(host.querySelectorAll('.menu__line')).toHaveLength(0)
    expect(host.querySelectorAll('.menu__divider')).toHaveLength(1)
    component.$set({ headings: 'plain' })
    await tick()
    expect(host.querySelectorAll('.menu__line, .menu__divider')).toHaveLength(0)
  })

  it('drops the line under the search when the first heading has lines of its own', async () => {
    const items = [{ id: 'a', label: getEmbeddedLabel('A'), heading: getEmbeddedLabel('One') }]
    const { host, component } = mount({ items, withSearch: true })
    const search = host.querySelector('.menu__search') as HTMLElement
    expect(search.classList.contains('menu__search--open')).toBe(true)
    component.$set({ headings: 'divider' })
    await tick()
    expect(search.classList.contains('menu__search--open')).toBe(false)
  })

  it('fades the edge of the list only where rows are hidden by the scroll', async () => {
    let report: ((entries: Array<{ target: Element, isIntersecting: boolean }>) => void) | undefined
    const observed: Element[] = []
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor (callback: typeof report) {
          report = callback
        }

        observe (element: Element): void {
          observed.push(element)
        }

        disconnect (): void {}
      }
    )
    try {
      const { host } = mount({ items: ITEMS })
      const list = host.querySelector('.menu__list') as HTMLElement
      const [top, bottom] = observed
      expect(top.classList.contains('menu__edge--top')).toBe(true)
      expect(bottom.classList.contains('menu__edge--bottom')).toBe(true)
      const fades = (): boolean[] => [
        list.classList.contains('menu__list--fade-top'),
        list.classList.contains('menu__list--fade-bottom')
      ]

      report?.([
        { target: top, isIntersecting: true },
        { target: bottom, isIntersecting: true }
      ])
      await tick()
      expect(fades()).toEqual([false, false])

      report?.([{ target: bottom, isIntersecting: false }])
      await tick()
      expect(fades()).toEqual([false, true])

      report?.([
        { target: top, isIntersecting: false },
        { target: bottom, isIntersecting: true }
      ])
      await tick()
      expect(fades()).toEqual([true, false])
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
