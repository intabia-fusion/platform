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

import { describe, expect, it } from 'vitest'
import {
  cellLimit,
  columnPlace,
  getCategoryGroups,
  groupsSignature,
  isBlocked,
  isOtherBoardGroup,
  cardPointerOffset,
  dragswap,
  captureDragOriginScrolls,
  isAtDragOrigin
} from '../boardView'

describe('board view helpers', () => {
  it.each([0, 1, 20, 100])('keeps an explicit cell limit %s', (limit) => {
    expect(cellLimit(new Map([['cell', limit]]), 'cell', 99)).toBe(limit)
    expect(cellLimit(new Map(), 'missing', limit)).toBe(limit)
  })

  it('compares group membership independently of order, without mutating it', () => {
    const groups = [
      ['b', 'a'],
      ['d', 'c']
    ]
    expect(groupsSignature(groups)).toBe(
      groupsSignature([
        ['c', 'd'],
        ['a', 'b']
      ])
    )
    expect(groups).toEqual([
      ['b', 'a'],
      ['d', 'c']
    ])
    expect(getCategoryGroups(['a', 'b', 'c', 'd'], (state) => (state === 'd' ? undefined : 'same'))).toEqual([
      ['a', 'b', 'c']
    ])
    expect(getCategoryGroups(['a', 'b'], undefined)).toEqual([])
  })

  it('retains groups of other boards only when no member belongs here', () => {
    expect(isOtherBoardGroup(['a'], ['b', 'c'])).toBe(true)
    expect(isOtherBoardGroup(['a'], ['a', 'b'])).toBe(false)
  })

  it.each([
    [false, undefined, undefined, false],
    [true, undefined, undefined, true],
    [true, [], 'a', false],
    [true, ['b'], 'a', false],
    [true, ['a', 'b'], undefined, true]
  ] as const)('blocks merged columns with source exception: %j', (dragging, available, from, expected) => {
    const members = new Map([['a', ['a', 'b']]])
    expect(isBlocked('a', dragging, available === undefined ? undefined : [...available], from, members)).toBe(expected)
    expect(columnPlace('a', new Set(), members)).toBe('open')
    expect(columnPlace('a', new Set(['a']), members)).toBe('stack')
    expect(columnPlace('b', new Set(), members)).toBe('hidden')
  })
  it.each([149, 150, 151])('uses the outer card midpoint at clientY %s despite a nested target', (clientY) => {
    const wrapper = document.createElement('div')
    const card = document.createElement('div')
    const title = document.createElement('span')
    card.dataset.cardId = 'card'
    card.append(title)
    wrapper.append(card)
    card.getBoundingClientRect = () => new DOMRect(10, 100, 200, 100)
    const event = { currentTarget: wrapper, target: title, clientY, offsetY: 5 } as unknown as MouseEvent
    expect(cardPointerOffset(event)).toBe(clientY - 150)
    expect(dragswap(event, 0, 1)).toBe(clientY < 150)
    expect(dragswap(event, 1, 0)).toBe(clientY > 150)
    expect(dragswap(event, 0, 0)).toBe(false)
    expect(dragswap(event, 0, -1)).toBe(false)
  })

  it.each([
    [92, 92, true],
    [308, 208, true],
    [91.99, 100, false],
    [308.01, 100, false],
    [100, 91.99, false],
    [100, 208.01, false]
  ] as const)('keeps the inclusive origin margin at (%s, %s)', (clientX, clientY, expected) => {
    expect(isAtDragOrigin(new DOMRect(100, 100, 200, 100), { clientX, clientY }, [])).toBe(expected)
  })

  it('captures source ancestors through the board and keeps their offsets after the source detaches', () => {
    const outside = document.createElement('div')
    const outer = document.createElement('div')
    const inner = document.createElement('div')
    const source = document.createElement('div')
    outside.append(outer)
    outer.append(inner)
    inner.append(source)
    outer.scrollLeft = 60
    inner.scrollTop = 200
    const scrolls = captureDragOriginScrolls(source, outer)
    expect(scrolls.map((scroll) => scroll.element)).toEqual([inner, outer])
    expect(scrolls.map((scroll) => [scroll.left, scroll.top])).toEqual([
      [0, 200],
      [60, 0]
    ])
    source.remove()
    outside.scrollLeft = 1000
    outer.scrollLeft = 80
    inner.scrollTop = 250
    const rect = new DOMRect(100, 100, 200, 100)
    expect(isAtDragOrigin(rect, { clientX: 90, clientY: 75 }, scrolls)).toBe(true)
    expect(isAtDragOrigin(rect, { clientX: 150, clientY: 175 }, scrolls)).toBe(false)
    expect(isAtDragOrigin(undefined, { clientX: 90, clientY: 75 }, scrolls)).toBe(false)
    expect(captureDragOriginScrolls(undefined, outer)).toEqual([])
    expect(rect.left).toBe(100)
    expect(rect.top).toBe(100)
  })
})
