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

import SegmentedControl from '../../ui-kit/segmented-control/SegmentedControl.svelte'

const ITEMS = [
  { id: 'all', label: getEmbeddedLabel('All') },
  { id: 'planned', label: getEmbeddedLabel('Planned') },
  { id: 'active', label: getEmbeddedLabel('Active') }
]
const ICONS = [
  { id: 'list', icon: 'ui:icon:List' as Asset, label: getEmbeddedLabel('List') },
  { id: 'board', icon: 'ui:icon:Board' as Asset, label: getEmbeddedLabel('Board') }
]

let target: HTMLElement
const mounted: Array<{ $destroy: () => void }> = []

function mount (props: ComponentProps<SegmentedControl>): {
  root: HTMLElement
  segments: HTMLButtonElement[]
  component: SegmentedControl
} {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new SegmentedControl({ target: host, props })
  mounted.push(component)
  const root = host.querySelector('.segmented-control') as HTMLElement
  return { root, segments: Array.from(root.querySelectorAll('button')), component }
}

function key (element: HTMLElement, key: string): void {
  element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
}

describe('ui-kit SegmentedControl', () => {
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

  it('is a small radiogroup of radios, ids kept as tab-<item id>', async () => {
    const { root, segments } = mount({ items: ITEMS, selected: 'planned', 'aria-label': 'Milestones' })
    await tick()
    expect(root.getAttribute('role')).toBe('radiogroup')
    expect(root.getAttribute('aria-label')).toBe('Milestones')
    expect(root.classList.contains('segmented-control--small')).toBe(true)
    expect(segments.map((s) => s.getAttribute('role'))).toEqual(['radio', 'radio', 'radio'])
    expect(segments.map((s) => s.dataset.id)).toEqual(['tab-all', 'tab-planned', 'tab-active'])
    expect(segments.map((s) => s.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false'])
    expect(segments.map((s) => s.textContent?.trim())).toEqual(['All', 'Planned', 'Active'])
  })

  it('keeps a single tab stop on the selected segment, the first one while nothing is selected', async () => {
    const { segments, component } = mount({ items: ITEMS })
    expect(segments.map((s) => s.tabIndex)).toEqual([0, -1, -1])
    component.$set({ selected: 'active' })
    await tick()
    expect(segments.map((s) => s.tabIndex)).toEqual([-1, -1, 0])
  })

  it('selects on click and does not report the selected segment again', async () => {
    const { segments, component } = mount({ items: ITEMS, selected: 'all' })
    const onSelect = vi.fn<(event: CustomEvent<string>) => void>()
    component.$on('select', onSelect)

    segments[0].click()
    segments[2].click()
    await tick()
    expect(segments[2].getAttribute('aria-checked')).toBe('true')
    expect(segments[0].getAttribute('aria-checked')).toBe('false')
    expect(onSelect.mock.calls.map(([event]) => event.detail)).toEqual(['active'])
  })

  it('moves the selection with arrows, Home and End, wrapping and skipping disabled segments', async () => {
    const items = ITEMS.map((it) => ({ ...it, disabled: it.id === 'planned' }))
    const { segments, component } = mount({ items, selected: 'all' })
    const onSelect = vi.fn<(event: CustomEvent<string>) => void>()
    component.$on('select', onSelect)

    key(segments[0], 'ArrowRight')
    await tick()
    expect(document.activeElement).toBe(segments[2])
    key(segments[2], 'ArrowRight')
    key(segments[0], 'End')
    key(segments[2], 'Home')
    key(segments[0], 'ArrowLeft')
    await tick()
    expect(onSelect.mock.calls.map(([event]) => event.detail)).toEqual(['active', 'all', 'active', 'all', 'active'])
    expect(segments[1].disabled).toBe(true)
  })

  it('hides labels with iconOnly but keeps them as accessible names', async () => {
    const { segments } = mount({ items: ICONS, selected: 'list', iconOnly: true })
    await tick()
    expect(segments[0].classList.contains('segmented-control__segment--icon-only')).toBe(true)
    const label = segments[0].querySelector('.segmented-control__label')
    expect(label?.classList.contains('segmented-control__label--hidden')).toBe(true)
    expect(label?.textContent?.trim()).toBe('List')
    expect(segments[0].querySelector('svg')).not.toBeNull()
  })

  it('shows a badge after the visible label, hides it with the label in iconOnly', async () => {
    const items = [
      { id: 'monthly', label: getEmbeddedLabel('Monthly') },
      { id: 'yearly', label: getEmbeddedLabel('Yearly'), badge: getEmbeddedLabel('−20%') },
      { id: 'list', label: getEmbeddedLabel('List'), icon: ICONS[0].icon, badge: getEmbeddedLabel('New') }
    ]
    const { segments, component } = mount({ items, selected: 'monthly', size: 'medium' })
    await tick()
    expect(segments[1].querySelector('.segmented-control__badge')?.textContent?.trim()).toBe('−20%')
    expect(segments[2].querySelector('.segmented-control__badge')?.textContent?.trim()).toBe('New')
    component.$set({ iconOnly: true })
    await tick()
    expect(segments[2].querySelector('.segmented-control__badge')).toBeNull()
    // Without an icon the label and its badge stay visible.
    expect(segments[1].querySelector('.segmented-control__label--hidden')).toBeNull()
    expect(segments[1].querySelector('.segmented-control__badge')).not.toBeNull()
  })

  it('gives a tooltip only to segments whose label is hidden', async () => {
    const items = [ICONS[0], { id: 'text', label: getEmbeddedLabel('Text') }]
    const { segments } = mount({ items, selected: 'list', iconOnly: true })
    await tick()
    expect(segments[0].classList.contains('segmented-control__segment--icon-only')).toBe(true)
    expect(segments[1].classList.contains('segmented-control__segment--icon-only')).toBe(false)
    expect(segments[1].querySelector('.segmented-control__label--hidden')).toBeNull()
  })

  it('a disabled segment is skipped by the click and the selected one may be disabled', async () => {
    const items = ITEMS.map((it) => ({ ...it, disabled: it.id !== 'active' }))
    const { segments, component } = mount({ items, selected: 'all' })
    const onSelect = vi.fn()
    component.$on('select', onSelect)
    segments[1].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await tick()
    expect(onSelect).not.toHaveBeenCalled()
    // The tab stop moves to the first enabled segment.
    expect(segments.map((s) => s.tabIndex)).toEqual([-1, -1, 0])
  })

  it('falls back to the default size when size is later set to undefined', async () => {
    const { root, component } = mount({ items: ITEMS, size: 'medium' })
    expect(root.classList.contains('segmented-control--medium')).toBe(true)
    component.$set({ size: undefined })
    await tick()
    expect(root.classList.contains('segmented-control--small')).toBe(true)
    expect(root.className).not.toContain('undefined')
  })
})
