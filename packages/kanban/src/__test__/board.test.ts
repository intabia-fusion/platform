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

import type { Doc, Ref } from '@hcengineering/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { type DragState, insertIndex, laneCellValues, loadCollapsed, neighbourRanks, saveCollapsed } from '../board'
import type { Item } from '../types'

const card = (id: string, lane = 'L1', rank = id): Item => ({ _id: id as Ref<Item>, lane, rank }) as unknown as Item
const ids = (items: Item[]): string[] => items.map((it) => it._id)
const ofDoc = (doc: Doc): string => (doc as any).lane

const noDrag: DragState = {
  card: undefined,
  initialLane: undefined,
  initialState: undefined,
  lane: undefined,
  state: undefined,
  targetIndex: undefined
}
const drag = (dragged: Item, extra: Partial<DragState>): DragState => ({
  card: dragged,
  initialLane: 'L1',
  initialState: 'todo',
  lane: 'L1',
  state: 'todo',
  targetIndex: undefined,
  ...extra
})

describe('laneCellValues', () => {
  const a = card('a')
  const b = card('b')
  const c = card('c')
  const x = card('x', 'L2')
  const raw = [a, b, x, c]

  it('keeps only the cards of the lane without a drag', () => {
    expect(ids(laneCellValues(raw, 'L1', 'todo', ofDoc, noDrag))).toEqual(['a', 'b', 'c'])
    expect(ids(laneCellValues(raw, 'L2', 'todo', ofDoc, noDrag))).toEqual(['x'])
  })

  it('returns every card when there is no lane function', () => {
    expect(ids(laneCellValues(raw, 'L1', 'todo', undefined, noDrag))).toEqual(['a', 'b', 'x', 'c'])
  })

  it('leaves the dragged card in place while it has not moved', () => {
    expect(ids(laneCellValues(raw, 'L1', 'todo', ofDoc, drag(b, {})))).toEqual(['a', 'b', 'c'])
  })

  it('moves the dragged card to the target index of its own cell', () => {
    expect(ids(laneCellValues(raw, 'L1', 'todo', ofDoc, drag(c, { targetIndex: 0 })))).toEqual(['c', 'a', 'b'])
    expect(ids(laneCellValues(raw, 'L1', 'todo', ofDoc, drag(a, { targetIndex: 2 })))).toEqual(['b', 'c', 'a'])
  })

  it('removes the dragged card from the cell it left', () => {
    expect(ids(laneCellValues(raw, 'L1', 'todo', ofDoc, drag(b, { lane: 'L2' })))).toEqual(['a', 'c'])
    expect(ids(laneCellValues(raw, 'L1', 'todo', ofDoc, drag(b, { state: 'done' })))).toEqual(['a', 'c'])
  })

  it('shows the dragged card in another lane, at the index or at the end', () => {
    expect(ids(laneCellValues(raw, 'L2', 'todo', ofDoc, drag(b, { lane: 'L2' })))).toEqual(['x', 'b'])
    expect(ids(laneCellValues(raw, 'L2', 'todo', ofDoc, drag(b, { lane: 'L2', targetIndex: 0 })))).toEqual(['b', 'x'])
  })

  it('appends the dragged card when the target index is out of range', () => {
    for (const targetIndex of [-1, 3, 100]) {
      expect(ids(laneCellValues(raw, 'L2', 'todo', ofDoc, drag(b, { lane: 'L2', targetIndex })))).toEqual(['x', 'b'])
    }
  })

  it('shows the dragged card in an empty cell of another column', () => {
    expect(ids(laneCellValues([], 'L1', 'done', ofDoc, drag(a, { state: 'done' })))).toEqual(['a'])
  })

  it('matches object categories by reference', () => {
    const todo = { name: 'todo' } as any
    const sameName = { name: 'todo' } as any
    const values = laneCellValues([a], 'L1', sameName, ofDoc, drag(b, { initialState: todo, state: todo }))
    expect(ids(values)).toEqual(['a'])
  })

  // move() and cardDrop() take the neighbour ranks from the card's own place in the target cell.
  it('shows the dragged card exactly once in its current cell after it moved', () => {
    const cells = [[], [a], [a, b, c], [x, a, b]]
    for (const cell of cells) {
      for (const targetIndex of [undefined, 0, 1, 2, 5, -1]) {
        for (const initialLane of ['L1', 'L2']) {
          if (initialLane === 'L1' && targetIndex === undefined) continue
          const values = laneCellValues(cell, 'L1', 'todo', ofDoc, drag(b, { targetIndex, initialLane }))
          expect(ids(values).filter((id) => id === 'b')).toHaveLength(1)
        }
      }
    }
  })

  // Pinned: the original cell is shown as is, so a card a live update took away is not in it.
  it('does not add the dragged card back to its original cell', () => {
    expect(ids(laneCellValues([a, c], 'L1', 'todo', ofDoc, drag(b, {})))).toEqual(['a', 'c'])
  })
})

describe('insertIndex', () => {
  it('keeps the index for a card coming from elsewhere', () => {
    expect(insertIndex(0, -1, 3)).toBe(0)
    expect(insertIndex(2, -1, 3)).toBe(2)
    expect(insertIndex(3, -1, 3)).toBe(3)
  })

  it('shifts by one when the card moves down in its own cell', () => {
    // a b c, b dropped after c: index 2 among [a, c].
    expect(insertIndex(3, 1, 3)).toBe(2)
    expect(insertIndex(2, 1, 3)).toBe(1)
  })

  it('does not shift when the card moves up', () => {
    expect(insertIndex(0, 2, 3)).toBe(0)
    expect(insertIndex(1, 2, 3)).toBe(1)
  })

  it('clamps into the range of the other cards', () => {
    expect(insertIndex(-3, -1, 3)).toBe(0)
    expect(insertIndex(10, -1, 3)).toBe(3)
    expect(insertIndex(10, 0, 3)).toBe(2)
    expect(insertIndex(0, 0, 1)).toBe(0)
  })

  it('stays within [0, other cards] for every combination', () => {
    for (let length = 0; length < 6; length++) {
      for (let dragIdx = -1; dragIdx < length; dragIdx++) {
        for (let desired = -2; desired <= length + 2; desired++) {
          const idx = insertIndex(desired, dragIdx, length)
          expect(idx).toBeGreaterThanOrEqual(0)
          expect(idx).toBeLessThanOrEqual(length - (dragIdx !== -1 ? 1 : 0))
        }
      }
    }
  })
})

describe('neighbourRanks', () => {
  const cell = [card('a', 'L1', 'r1'), card('b', 'L1', 'r2'), card('c', 'L1', 'r3')]
  const id = (s: string): Ref<Doc> => s as Ref<Doc>

  it('takes the ranks around the card at its own place', () => {
    expect(neighbourRanks(cell, id('b'), undefined)).toEqual(['r1', 'r3'])
    expect(neighbourRanks(cell, id('a'), undefined)).toEqual([undefined, 'r2'])
    expect(neighbourRanks(cell, id('c'), undefined)).toEqual(['r2', undefined])
  })

  it('takes the ranks around the target index among the other cards', () => {
    expect(neighbourRanks(cell, id('a'), 2)).toEqual(['r3', undefined])
    expect(neighbourRanks(cell, id('c'), 0)).toEqual([undefined, 'r1'])
    expect(neighbourRanks(cell, id('x'), 1)).toEqual(['r1', 'r2'])
  })

  it('puts a card from elsewhere at the end without a target index', () => {
    expect(neighbourRanks(cell, id('x'), undefined)).toEqual(['r3', undefined])
  })

  it('gives no ranks in an empty cell or for the only card', () => {
    expect(neighbourRanks([], id('x'), undefined)).toEqual([undefined, undefined])
    expect(neighbourRanks([cell[0]], id('a'), undefined)).toEqual([undefined, undefined])
  })

  it('matches the ranks next to the card in the cell laneCellValues shows', () => {
    const shown = [card('a', 'L1', 'r1'), card('x', 'L1', 'rx'), card('b', 'L1', 'r2')]
    expect(neighbourRanks(shown, id('x'), undefined)).toEqual(['r1', 'r2'])
  })
})

describe('collapsed lanes storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('round-trips the set under its key', () => {
    saveCollapsed('board', new Set(['L1', 'L2']))
    expect(localStorage.getItem('kanban-swimlane-collapsed-board')).toBe('["L1","L2"]')
    expect(loadCollapsed('board')).toEqual(new Set(['L1', 'L2']))
    expect(loadCollapsed('other')).toEqual(new Set())
  })

  it('ignores a missing key', () => {
    saveCollapsed(undefined, new Set(['L1']))
    expect(localStorage.length).toBe(0)
    expect(loadCollapsed(undefined)).toEqual(new Set())
  })

  it('returns an empty set for broken JSON', () => {
    localStorage.setItem('kanban-swimlane-collapsed-board', '{oops')
    expect(loadCollapsed('board')).toEqual(new Set())
  })
})
