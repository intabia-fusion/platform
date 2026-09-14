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
import Timeline from '../components/Timeline.svelte'
import type { TimelineItem, TimelineRow } from '../types'

const DAY = 86_400_000
const locale = new Intl.NumberFormat().resolvedOptions().locale
const monthLabel = (d: Date): string => Intl.DateTimeFormat(locale, { month: 'long' }).format(d)

// Thursday, mid-month - clear of month/DST boundaries so the offset math below is unambiguous.
const CURRENT_TIME = new Date(2026, 0, 15).getTime()

function item (startOffsetDays: number, targetOffsetDays: number | undefined): TimelineItem {
  return {
    startDate: CURRENT_TIME + startOffsetDays * DAY,
    targetDate: targetOffsetDays === undefined ? undefined : CURRENT_TIME + targetOffsetDays * DAY
  }
}

let target: HTMLElement

function mount (props: Record<string, unknown> = {}): { host: HTMLElement, component: Timeline } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new Timeline({ target: host, props })
  return { host, component }
}

describe('Timeline', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('builds the month/day grid and today marker from currentTime alone', () => {
    // jsdom measures the header as zero-width, so offsetView is 0 and the rendered range is driven
    // purely by currentTime - this pins the pure date math (getNextMonth/getNextWeek/getOffsetByDate).
    const { host } = mount({ currentTime: CURRENT_TIME })

    const months = host.querySelectorAll('.month')
    expect(months).toHaveLength(2)
    expect((months[0] as HTMLElement).style.left).toBe('-70px')
    expect(months[0].querySelector('b')?.textContent).toBe('2026') // January carries the year
    expect(months[0].querySelector('span')?.textContent).toBe(monthLabel(new Date(2026, 0, 1)))
    expect((months[1] as HTMLElement).style.left).toBe('85px')
    expect(months[1].querySelector('b')).toBeNull()
    expect(months[1].querySelector('span')?.textContent).toBe(monthLabel(new Date(2026, 1, 1)))

    const days = host.querySelectorAll('.day')
    expect(Array.from(days).map((d) => (d as HTMLElement).style.left)).toEqual(['-70px', '-35px', '0px', '35px', '70px'])
    expect(Array.from(days).map((d) => d.textContent)).toEqual(['1', '8', '15', '22', '29'])

    const cursor = host.querySelector('.cursor') as HTMLElement
    expect(cursor.textContent).toBe('15')
    expect(cursor.style.left).toBe('0px')
  })

  it('defaults currentTime to today at midnight when the prop is omitted', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 15, 9, 0, 0))
    try {
      const { host } = mount()
      expect((host.querySelector('.cursor') as HTMLElement).textContent).toBe('15')
    } finally {
      vi.useRealTimers()
    }
  })

  it('renders no rows and no today-marker overlay when lines is not provided', () => {
    const { host } = mount({ currentTime: CURRENT_TIME })
    expect(host.querySelector('.listGrid')).toBeNull()
    expect(host.querySelector('.todayMarker')).toBeNull()
  })

  describe('with rows', () => {
    const rowNull: TimelineRow = { items: undefined }
    const rowRight: TimelineRow = { items: [item(30, 40)] } // range starts ahead of the view
    const rowLeft: TimelineRow = { items: [item(-10, -5)] } // range ends behind the view
    const rowNoTarget: TimelineRow = { items: [item(2, undefined)] }
    const lines = [rowNull, rowRight, rowLeft, rowNoTarget]

    function mountRows (extra: Record<string, unknown> = {}): { host: HTMLElement, component: Timeline, rows: NodeListOf<Element> } {
      const { host, component } = mount({ currentTime: CURRENT_TIME, lines, selectedRows: [0, 3], selectedRow: 2, ...extra })
      return { host, component, rows: host.querySelectorAll('.listGrid') }
    }

    it("positions a component item's left/right/width from its date range", () => {
      const { rows } = mountRows()
      const el = rows[1].querySelector('.component-item') as HTMLElement
      expect(el.style.left).toBe('150px')
      expect(el.style.right).toBe('204px')
      expect(el.style.width).toBe('54px')
    })

    it('shows the right jump button when the row range starts ahead of the view, not the left one', () => {
      const { rows } = mountRows()
      expect(rows[1].querySelector('.timeline-action__button.right')).not.toBeNull()
      expect(rows[1].querySelector('.timeline-action__button.left')).toBeNull()
    })

    it('shows the left jump button when the row range ends behind the view, not the right one', () => {
      const { rows } = mountRows()
      expect(rows[2].querySelector('.timeline-action__button.left')).not.toBeNull()
      expect(rows[2].querySelector('.timeline-action__button.right')).toBeNull()
    })

    it('never applies noTarget, even for an item with no targetDate', () => {
      // Pinned behaviour, not a desired one: the template checks `item.targetDate === null`, but the
      // type (and every real caller) only ever produces `undefined` - the class can never apply.
      const { rows } = mountRows()
      const el = rows[3].querySelector('.component-item') as HTMLElement
      expect(el.classList.contains('noTarget')).toBe(false)
    })

    it('marks a row with no items as a nullRow', () => {
      const { rows } = mountRows()
      expect(rows[0].querySelector('.contentWrapper')?.classList.contains('nullRow')).toBe(true)
      expect(rows[1].querySelector('.contentWrapper')?.classList.contains('nullRow')).toBe(false)
    })

    it('applies mListGridChecked from selectedRows and mListGridSelected from selectedRow', () => {
      const { rows } = mountRows()
      expect(rows[0].classList.contains('mListGridChecked')).toBe(true)
      expect(rows[3].classList.contains('mListGridChecked')).toBe(true)
      expect(rows[1].classList.contains('mListGridChecked')).toBe(false)
      expect(rows[2].classList.contains('mListGridSelected')).toBe(true)
      expect(rows[0].classList.contains('mListGridSelected')).toBe(false)
    })

    it('selectRow() moves the selected-row class', async () => {
      const { component, rows } = mountRows()
      component.selectRow(0)
      await tick()
      expect(rows[0].classList.contains('mListGridSelected')).toBe(true)
      expect(rows[2].classList.contains('mListGridSelected')).toBe(false)
    })

    it('onObjectChecked() dispatches check with the row and value', () => {
      const { component } = mountRows()
      const onCheck = vi.fn()
      component.$on('check', onCheck)
      component.onObjectChecked(1, true)
      expect(onCheck).toHaveBeenLastCalledWith(expect.objectContaining({ detail: { row: 1, value: true } }))
    })

    it('dispatches row-focus on mousemove, except for the already-selected row', () => {
      const { component, rows } = mountRows()
      const onFocus = vi.fn()
      component.$on('row-focus', onFocus)

      rows[2].dispatchEvent(new MouseEvent('mousemove', { clientX: 0, clientY: 0 })) // row 2 is selectedRow
      expect(onFocus).not.toHaveBeenCalled()

      rows[1].dispatchEvent(new MouseEvent('mousemove', { clientX: 0, clientY: 0 }))
      expect(onFocus).toHaveBeenLastCalledWith(expect.objectContaining({ detail: 1 }))
    })
  })

  it('tracks the cursor on mousemove and shows add on a selected null row; mouseout clears it', async () => {
    const lines: TimelineRow[] = [{ items: undefined }]
    const { host } = mount({ currentTime: CURRENT_TIME, lines, selectedRow: 0 })
    const container = host.querySelector('.timeline-container') as HTMLElement

    container.dispatchEvent(new MouseEvent('mousemove', { clientX: 0, clientY: 0 }))
    await tick()
    const addButton = host.querySelector('.timeline-action__button.add') as HTMLElement
    expect(addButton).not.toBeNull()
    expect(addButton.style.left).toBe('0px')

    container.dispatchEvent(new MouseEvent('mouseout', { clientX: 0, clientY: 0 }))
    await tick()
    expect(host.querySelector('.timeline-action__button.add')).toBeNull()
  })

  it('wheel-scrolls the header/content, and the Today button resets the view', async () => {
    const { host } = mount({ currentTime: CURRENT_TIME })
    const container = host.querySelector('.timeline-container') as HTMLElement

    container.dispatchEvent(new WheelEvent('wheel', { deltaX: 20, deltaY: 0, clientX: 0, clientY: 0, bubbles: true }))
    await tick()
    const headerContent = host.querySelector('.timeline-header__time-content') as HTMLElement
    const bgContent = host.querySelector('.timeline-wrapped_content') as HTMLElement
    expect(headerContent.style.transform).toBe('translateX(-20px)') // offsetView += -deltaX
    expect(bgContent.style.transform).toBe('translateX(-20px)')

    const todayButton = host.querySelector('.timeline-header__title button') as HTMLButtonElement
    todayButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick()
    expect(headerContent.style.transform).toBe('translateX(0px)')
  })

  it('refuses to resize the panel when the container measures narrow', () => {
    // jsdom's real (unstubbed) getBoundingClientRect is always zero, so timelineBox.width <= 450 holds
    // and splitterStart bails before adding any listeners - this pins that guard, not a layout fluke.
    const { host } = mount({ currentTime: CURRENT_TIME })
    const splitter = host.querySelector('.timeline-splitter') as HTMLElement
    const title = host.querySelector('.timeline-header__title') as HTMLElement
    const before = title.style.width

    splitter.dispatchEvent(new MouseEvent('mousedown', { clientX: 320, bubbles: true }))
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 500 }))
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 500 }))

    expect(title.style.width).toBe(before)
    expect(splitter.classList.contains('moving')).toBe(false)
  })

  it('drags the splitter to resize the header panel, clamped to its min/max', async () => {
    // Timeline mixes flex with absolutely-positioned siblings, which fakeLayout's flex-only model
    // cannot represent (it left viewBox.width at 0 regardless). Stubbing just the two rects this
    // component reads - the container and the viewbox - is the direct, precise alternative.
    const nativeRect = Element.prototype.getBoundingClientRect.bind(null) as (this: Element) => DOMRect
    Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
      if (this.classList.contains('timeline-container')) {
        const rect: DOMRect = { x: 0, y: 0, width: 1000, height: 1000, left: 0, top: 0, right: 1000, bottom: 1000, toJSON: () => ({}) }
        return rect
      }
      if (this.classList.contains('timeline-header__time')) {
        const rect: DOMRect = { x: 320, y: 0, width: 0, height: 1000, left: 320, top: 0, right: 320, bottom: 1000, toJSON: () => ({}) }
        return rect
      }
      return nativeRect.call(this)
    }

    try {
      const { host } = mount({ currentTime: CURRENT_TIME })
      const splitter = host.querySelector('.timeline-splitter') as HTMLElement
      const title = host.querySelector('.timeline-header__title') as HTMLElement

      splitter.dispatchEvent(new MouseEvent('mousedown', { clientX: 320, bubbles: true }))
      await tick()
      expect(splitter.classList.contains('moving')).toBe(true)

      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 500 }))
      await tick()
      expect(title.style.width).toBe('500px')

      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 100 }))
      await tick()
      expect(title.style.width).toBe('300px') // clamped to the 300px minimum

      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 950 }))
      await tick()
      expect(title.style.width).toBe('850px') // clamped to timelineBox.width(1000) - 150

      document.dispatchEvent(new MouseEvent('mouseup', { clientX: 950 }))
      await tick()
      expect(splitter.classList.contains('moving')).toBe(false)
    } finally {
      Element.prototype.getBoundingClientRect = nativeRect
    }
  })
})
