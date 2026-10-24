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

import Dropdown from '../../ui-kit/dropdown/Dropdown.svelte'
import type { DropdownItem, DropdownItemId } from '../../ui-kit/dropdown/types'
import DropdownWithValue from './DropdownWithValue.svelte'

const popups = vi.hoisted(() => ({
  showPopup: vi.fn(),
  close: vi.fn(),
  update: vi.fn()
}))

vi.mock('../../popups', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  showPopup: popups.showPopup
}))

type Id = DropdownItemId

const ICON = 'ui:icon:Settings' as Asset
const PLACEHOLDER = getEmbeddedLabel('No priority')
const ITEMS: DropdownItem[] = [
  { id: 'high', label: getEmbeddedLabel('High') },
  { id: 'low', label: getEmbeddedLabel('Low') }
]

let target: HTMLElement
const mounted: Array<{ $destroy: () => void }> = []

// Single and multiple choice in one helper: `selected` takes both shapes.
type Props = Omit<ComponentProps<Dropdown>, 'selected'> & { selected?: Id | Id[] }

function mount (props: Props): { root: HTMLElement, button: HTMLButtonElement, component: Dropdown } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new Dropdown({ target: host, props: props as ComponentProps<Dropdown> })
  mounted.push(component)
  return {
    root: host.querySelector('.select-button') as HTMLElement,
    button: host.querySelector('button') as HTMLButtonElement,
    component
  }
}

function update (component: Dropdown, props: Partial<Props>): void {
  component.$set(props as Partial<ComponentProps<Dropdown>>)
}

function value (root: HTMLElement): string | undefined {
  return root.querySelector('.select-button__value')?.textContent?.trim()
}

function lastCall (): any[] {
  return popups.showPopup.mock.calls[popups.showPopup.mock.calls.length - 1]
}

describe('ui-kit Dropdown', () => {
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

  it('shows the chosen item with a chevron', () => {
    const { root } = mount({ items: ITEMS, selected: 'low' })
    expect(value(root)).toBe('Low')
    expect(root.querySelector('.select-button__chevron')).not.toBeNull()
    expect(root.classList.contains('select-button--placeholder')).toBe(false)
  })

  it('shows the placeholder and its icon while nothing is chosen', () => {
    const { root } = mount({ items: ITEMS, placeholder: PLACEHOLDER, icon: ICON })
    expect(value(root)).toBe('No priority')
    expect(root.classList.contains('select-button--placeholder')).toBe(true)
  })

  it('opens the list with the chosen id and reports it open', async () => {
    const { button } = mount({ items: ITEMS, selected: 'high', withSearch: true, itemParams: { count: 2 } })
    button.click()
    await tick()

    const [, props, anchor] = lastCall()
    expect(props).toEqual({
      items: ITEMS,
      selected: 'high',
      multiselect: false,
      withSearch: true,
      params: { count: 2 },
      popupClass: 'fit',
      minWidth: 'clamp(10rem, 0px, 16.5rem)',
      focusFirst: false
    })
    expect(anchor).toBe(button)
    expect(button.getAttribute('aria-expanded')).toBe('true')
  })

  it('hands its items to the list in the list format', () => {
    const items: DropdownItem[] = [
      { id: 'all', label: getEmbeddedLabel('All'), exclusive: true },
      {
        id: 'mine',
        label: getEmbeddedLabel('Mine'),
        labelParams: { count: 3 },
        description: getEmbeddedLabel('Assigned to me'),
        divider: true,
        heading: getEmbeddedLabel('Filters')
      }
    ]
    const { root, button } = mount({ items, selected: 'mine' })
    expect(value(root)).toBe('Mine')
    button.click()
    expect(lastCall()[1].items).toEqual([
      { id: 'all', label: items[0].label, exclusive: true },
      {
        id: 'mine',
        label: items[1].label,
        params: { count: 3 },
        description: items[1].description,
        separatorBefore: true,
        separatorLabel: items[1].heading
      }
    ])
  })

  it('hands the children to the list and shows a chosen child', () => {
    const items: DropdownItem[] = [
      {
        id: 'component',
        label: getEmbeddedLabel('Component'),
        children: [{ id: 'enemy', label: getEmbeddedLabel('Enemy'), icon: ICON, labelParams: { n: 1 } }]
      }
    ]
    const { root, button } = mount({ items, selected: 'enemy' })
    expect(value(root)).toBe('Enemy')
    expect(root.querySelector('.select-button__icon')).not.toBeNull()
    button.click()
    expect(lastCall()[1].items).toEqual([
      {
        id: 'component',
        label: items[0].label,
        children: [{ id: 'enemy', label: getEmbeddedLabel('Enemy'), icon: ICON, params: { n: 1 } }]
      }
    ])
  })

  it('hands row markup and the popup width to the list', () => {
    const items: DropdownItem[] = [{ ...ITEMS[0], component: DropdownWithValue, componentProps: { selected: [] } }]
    const { button } = mount({ items, popupWidth: 'wide' })
    button.click()
    const props = lastCall()[1]
    expect(props.items[0]).toMatchObject({ component: DropdownWithValue, componentProps: { selected: [] } })
    expect(props.popupClass).toBe('wide')
    expect(props.minWidth).toBe('0px')
  })

  it('keeps and dispatches the picked item', async () => {
    const { root, button, component } = mount({ items: ITEMS, selected: 'high' })
    const onSelected = vi.fn<(event: CustomEvent<Id | Id[]>) => void>()
    component.$on('selected', onSelected)

    button.click()
    lastCall()[3]('low')
    await tick()
    expect(onSelected.mock.calls[0][0].detail).toBe('low')
    expect(value(root)).toBe('Low')
    expect(button.getAttribute('aria-expanded')).toBe('false')
  })

  it('dispatches nothing when the list closes without a pick', () => {
    const { button, component } = mount({ items: ITEMS })
    const onSelected = vi.fn()
    component.$on('selected', onSelected)
    button.click()
    lastCall()[3](undefined)
    expect(onSelected).not.toHaveBeenCalled()
  })

  it('passes an array to the list and lists the chosen items with multiselect', async () => {
    const { root, button, component } = mount({ items: ITEMS, multiselect: true, placeholder: PLACEHOLDER })
    expect(value(root)).toBe('No priority')
    const onSelected = vi.fn<(event: CustomEvent<Id | Id[]>) => void>()
    component.$on('selected', onSelected)

    button.click()
    expect(lastCall()[1].selected).toEqual([])
    lastCall()[4](['high', 'low'])
    await tick()
    expect(onSelected.mock.calls[0][0].detail).toEqual(['high', 'low'])
    expect(value(root)).toBe('HighLow')
    expect(root.querySelector('.dropdown__values--dot')).not.toBeNull()

    lastCall()[3](undefined)
    expect(onSelected).toHaveBeenCalledTimes(1)
  })

  it('separates the chosen values as asked and shows their icons', async () => {
    const items: DropdownItem[] = [{ ...ITEMS[0], icon: ICON }, ITEMS[1]]
    const { root, component } = mount({ items, multiselect: true, selected: ['high', 'low'], separator: 'comma' })
    expect(root.querySelectorAll('.dropdown__value')).toHaveLength(2)
    expect(root.querySelectorAll('.dropdown__value .dropdown__icon')).toHaveLength(1)
    expect(root.querySelector('.dropdown__values--comma')).not.toBeNull()

    component.$set({ separator: 'none' })
    await tick()
    expect(root.querySelector('.dropdown__values--none')).not.toBeNull()
  })

  it('clears a single choice on a second click only with allowDeselect', async () => {
    const { root, button, component } = mount({ items: ITEMS, selected: 'high', placeholder: PLACEHOLDER })
    const onDeselected = vi.fn()
    component.$on('deselected', onDeselected)
    button.click()
    lastCall()[3]('high')
    await tick()
    expect(onDeselected).not.toHaveBeenCalled()
    expect(value(root)).toBe('High')

    component.$set({ allowDeselect: true })
    await tick()
    button.click()
    lastCall()[3]('high')
    await tick()
    expect(onDeselected).toHaveBeenCalledTimes(1)
    expect(onDeselected.mock.calls[0][0].detail).toBeNull()
    expect(value(root)).toBe('No priority')
  })

  it('lets the last item go with multiselect unless allowDeselect is off', async () => {
    const { button, component } = mount({ items: ITEMS, multiselect: true, selected: ['high'] })
    const onSelected = vi.fn<(event: CustomEvent<Id | Id[]>) => void>()
    component.$on('selected', onSelected)
    button.click()
    lastCall()[4]([])
    expect(onSelected.mock.calls[0][0].detail).toEqual([])

    update(component, { selected: ['high'], allowDeselect: false })
    await tick()
    popups.update.mockClear()
    lastCall()[4]([])
    expect(onSelected).toHaveBeenCalledTimes(1)
    expect(popups.update).toHaveBeenCalledWith(expect.objectContaining({ selected: ['high'] }))
  })

  it('renders the value slot with the chosen items and wraps on request', async () => {
    const host = document.createElement('div')
    target.appendChild(host)
    const component = new DropdownWithValue({ target: host, props: { items: ITEMS, selected: ['high', 'low'] } })
    mounted.push(component)
    const root = host.querySelector('.select-button') as HTMLElement
    expect(root.querySelector('.custom')?.textContent).toBe('2 chosen')
    expect(root.classList.contains('select-button--wrap')).toBe(true)

    component.$set({ selected: [] })
    await tick()
    expect(root.querySelector('.custom')).toBeNull()
    expect(value(root)).toBe('No priority')
  })

  it('passes justify to the trigger', () => {
    const { root } = mount({ items: ITEMS, selected: 'high', fullWidth: true, justify: 'center' })
    expect(root.classList.contains('select-button--center')).toBe(true)
  })

  it('chooses the first item with autoSelect while nothing is chosen', async () => {
    const onSelected = vi.fn<(event: CustomEvent<Id | Id[]>) => void>()
    const { root, component } = mount({ items: [], autoSelect: true })
    component.$on('selected', onSelected)
    component.$set({ items: ITEMS })
    await tick()
    expect(onSelected.mock.calls[0][0].detail).toBe('high')
    expect(value(root)).toBe('High')
  })

  it('keeps a choice cleared with autoSelect and allowDeselect, and picks again without allowDeselect', async () => {
    const { root, button } = mount({ items: ITEMS, autoSelect: true, allowDeselect: true, placeholder: PLACEHOLDER })
    await tick()
    expect(value(root)).toBe('High')
    button.click()
    lastCall()[3]('high')
    await tick()
    expect(value(root)).toBe('No priority')

    const plain = mount({ items: ITEMS, autoSelect: true, placeholder: PLACEHOLDER })
    plain.component.$set({ selected: undefined })
    await tick()
    expect(value(plain.root)).toBe('High')
  })

  it('does not open while disabled', () => {
    const { button } = mount({ items: ITEMS, disabled: true })
    button.click()
    expect(popups.showPopup).not.toHaveBeenCalled()
  })

  it('updates an open list in place and closes it when destroyed', async () => {
    const { button, component } = mount({ items: ITEMS })
    button.click()
    await tick()
    expect(popups.update).not.toHaveBeenCalled()

    component.$set({ selected: 'low' })
    await tick()
    expect(popups.update).toHaveBeenCalledWith(expect.objectContaining({ selected: 'low' }))

    component.$destroy()
    expect(popups.close).toHaveBeenCalledTimes(1)
  })

  it('stretches with fullWidth and passes attributes to the button', () => {
    const { root, button } = mount({ items: ITEMS, fullWidth: true, kind: 'ghost', 'data-id': 'priority' })
    expect(root.classList.contains('select-button--full-width')).toBe(true)
    expect(button.classList.contains('button--ghost')).toBe(true)
    expect(button.dataset.id).toBe('priority')
  })

  it('opens by ArrowDown / ArrowUp on the trigger and is not expanded after the list closes', async () => {
    const { button } = mount({ items: ITEMS, selected: 'high' })
    const shifted = new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true, cancelable: true })
    button.dispatchEvent(shifted)
    expect(popups.showPopup).not.toHaveBeenCalled()

    const down = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
    button.dispatchEvent(down)
    await tick()
    expect(down.defaultPrevented).toBe(true)
    expect(popups.showPopup).toHaveBeenCalledTimes(1)
    expect(button.getAttribute('aria-expanded')).toBe('true')
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    expect(popups.showPopup).toHaveBeenCalledTimes(1)

    expect(lastCall()[1].focusFirst).toBe(true)
    lastCall()[3](undefined)
    await tick()
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(button)
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    expect(popups.showPopup).toHaveBeenCalledTimes(2)
  })

  it('leaves the focus alone after a pointer click', async () => {
    const { button } = mount({ items: ITEMS })
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
    expect(lastCall()[1].focusFirst).toBe(false)
    lastCall()[3]('low')
    await tick()
    expect(document.activeElement).not.toBe(button)
  })
})
