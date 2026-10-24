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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import FilterCategoryPopup from '../../components/FilterCategoryPopup.svelte'
import type { FilterButtonActiveFilter, FilterButtonCategory } from '../../ui-kit/filter-button/types'
import FilterButton from '../../ui-kit/filter-button/FilterButton.svelte'

const popups = vi.hoisted(() => ({ showPopup: vi.fn() }))

vi.mock('../../popups', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  showPopup: popups.showPopup
}))

interface PopupProps {
  activeFilters: FilterButtonActiveFilter[]
  onFilterChange: (filter: FilterButtonActiveFilter) => void
  onFilterRemove: (categoryId: string) => void
}

const CATEGORIES: FilterButtonCategory[] = [
  {
    id: 'type',
    label: getEmbeddedLabel('Type'),
    options: [
      { id: 'user', label: getEmbeddedLabel('User') },
      { id: 'group', label: getEmbeddedLabel('Group') }
    ]
  },
  { id: 'mode', label: getEmbeddedLabel('Mode'), options: [{ id: 'on', label: getEmbeddedLabel('On') }] }
]

const TYPE_USER: FilterButtonActiveFilter = {
  categoryId: 'type',
  optionId: 'user',
  categoryLabel: getEmbeddedLabel('Type'),
  optionLabel: getEmbeddedLabel('User')
}
const MODE_ON: FilterButtonActiveFilter = {
  categoryId: 'mode',
  optionId: 'on',
  categoryLabel: getEmbeddedLabel('Mode'),
  optionLabel: getEmbeddedLabel('On')
}

let target: HTMLElement
const mounted: Array<{ $destroy: () => void }> = []

function mount (props: ComponentProps<FilterButton>): { host: HTMLElement, component: FilterButton } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new FilterButton({ target: host, props })
  mounted.push(component)
  return { host, component }
}

function buttons (host: HTMLElement): HTMLButtonElement[] {
  return Array.from(host.querySelectorAll('button'))
}

function changes (component: FilterButton): FilterButtonActiveFilter[][] {
  const calls: FilterButtonActiveFilter[][] = []
  component.$on('change', (event: CustomEvent<FilterButtonActiveFilter[]>) => calls.push(event.detail))
  return calls
}

describe('ui-kit FilterButton', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
    popups.showPopup.mockReset()
  })

  afterEach(() => {
    mounted.splice(0).forEach((component) => {
      component.$destroy()
    })
    target.remove()
  })

  it('is one secondary small menu button without filters', () => {
    const { host } = mount({ categories: CATEGORIES })
    const [button, ...rest] = buttons(host)
    expect(rest).toHaveLength(0)
    expect(button.classList.contains('button--secondary')).toBe(true)
    expect(button.classList.contains('button--small')).toBe(true)
    expect(button.getAttribute('aria-haspopup')).toBe('true')
    expect(host.querySelector('.filter-button__count')).toBeNull()
  })

  it('opens the category popup and keeps one filter per category', async () => {
    const { host, component } = mount({ categories: CATEGORIES, activeFilters: [TYPE_USER] })
    const calls = changes(component)

    buttons(host)[0].click()
    await tick()
    expect(buttons(host)[0].getAttribute('aria-expanded')).toBe('true')
    const [popup, props, , onClose] = popups.showPopup.mock.calls[0] as [unknown, PopupProps, unknown, () => void]
    expect(popup).toBe(FilterCategoryPopup)
    expect(props.activeFilters).toEqual([TYPE_USER])

    props.onFilterChange({ ...TYPE_USER, optionId: 'group', optionLabel: getEmbeddedLabel('Group') })
    props.onFilterChange(MODE_ON)
    props.onFilterRemove('type')
    expect(calls).toEqual([
      [{ ...TYPE_USER, optionId: 'group', optionLabel: getEmbeddedLabel('Group') }],
      [TYPE_USER, MODE_ON],
      []
    ])

    onClose()
    await tick()
    expect(buttons(host)[0].getAttribute('aria-expanded')).toBe('false')
  })

  it('shows the count of active filters and resets them all with a named button', async () => {
    const { host, component } = mount({ categories: CATEGORIES, activeFilters: [TYPE_USER, MODE_ON] })
    const calls = changes(component)
    expect(host.querySelector('.filter-button__count')?.textContent).toBe('2')

    const reset = buttons(host)[1]
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(reset.getAttribute('aria-label')).toBe('ui:string:ClearFilters')
    reset.focus()
    reset.click()
    expect(calls).toEqual([[]])
    expect(popups.showPopup).not.toHaveBeenCalled()
    // The reset goes away with the filters: the focus moves to the button, not to the page.
    expect(document.activeElement).toBe(buttons(host)[0])

    component.$set({ activeFilters: [] })
    await tick()
    expect(buttons(host)).toHaveLength(1)
  })

  it('stays a neutral button with filters, not in the selected tone', () => {
    const { host } = mount({ categories: CATEGORIES, activeFilters: [TYPE_USER] })
    expect(buttons(host).some((b) => b.classList.contains('button--selected'))).toBe(false)
    expect(buttons(host)[0].classList.contains('button--secondary')).toBe(true)
  })

  it('shows a dot on the funnel instead of the count with the dot indicator', async () => {
    const { host, component } = mount({ categories: CATEGORIES, activeFilters: [TYPE_USER, MODE_ON], indicator: 'dot' })
    const root = host.querySelector('.filter-button') as HTMLElement
    expect(root.classList.contains('filter-button--dot')).toBe(true)
    expect(host.querySelector('.filter-button__count')).toBeNull()
    expect(buttons(host)).toHaveLength(2)
    // The dot is CSS only: the number stays in the button's text for assistive technology.
    expect(buttons(host)[0].querySelector('.filter-button__hidden-count')?.textContent).toBe('2')

    component.$set({ activeFilters: [] })
    await tick()
    expect(root.classList.contains('filter-button--dot')).toBe(false)
  })

  it('disables both buttons and passes kind and size', () => {
    const { host } = mount({
      categories: CATEGORIES,
      activeFilters: [TYPE_USER],
      kind: 'ghost',
      size: 'extra-small',
      disabled: true
    })
    const [main, reset] = buttons(host)
    expect(buttons(host).every((b) => b.disabled)).toBe(true)
    expect(main.classList.contains('button--ghost')).toBe(true)
    expect(main.classList.contains('button--extra-small')).toBe(true)
    // The reset is a plate inside the button, the size of the count, whatever the button's size.
    expect(reset.classList.contains('button--min')).toBe(true)
    expect(reset.closest('.filter-button__reset')).not.toBeNull()
  })

  it('opens one popup at a time and closes it when destroyed', async () => {
    const close = vi.fn()
    popups.showPopup.mockReturnValue({ id: '1', close, update: vi.fn() })
    const { host, component } = mount({ categories: CATEGORIES })
    buttons(host)[0].click()
    buttons(host)[0].click()
    await tick()
    expect(popups.showPopup).toHaveBeenCalledTimes(1)

    component.$destroy()
    expect(close).toHaveBeenCalledTimes(1)
  })
})
