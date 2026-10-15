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

import type { CategoryType, Doc, Ref } from '@hcengineering/core'
import { describe, expect, it } from 'vitest'
import type { Item, SwimLane } from '../types'
import { cellKey, collectVisibleGroups, COLUMN_LIMIT, type VisibleGroupsInput } from '../visibleGroups'

const card = (id: string, lane = ''): Item => ({ _id: id as Ref<Item>, lane }) as unknown as Item
const cards = (prefix: string, n: number, lane = ''): Item[] =>
  Array.from({ length: n }, (_, i) => card(`${prefix}${String(i).padStart(2, '0')}`, lane))
const swimLane = (id: string): SwimLane => ({ _id: id, title: id, value: id })

function input (groupByDocs: Record<string, Item[]>, extra: Partial<VisibleGroupsInput> = {}): VisibleGroupsInput {
  return {
    groupByDocs,
    categories: Object.keys(groupByDocs),
    swimLanes: [],
    collapsed: new Set(),
    cellLimits: new Map(),
    swimLaneMode: false,
    lanesPending: false,
    dragging: false,
    previous: new Map(),
    getGroupByValues: (docs, category) => docs[category as string],
    ...extra
  }
}

// Lanes by parent issue: the header document is `parent-<lane>`, a card names its lane.
function laneInput (
  groupByDocs: Record<string, Item[]>,
  lanes: SwimLane[],
  extra: Partial<VisibleGroupsInput> = {}
): VisibleGroupsInput {
  return input(groupByDocs, {
    swimLanes: lanes,
    swimLaneMode: true,
    getSwimLaneOfDoc: (doc: Doc) => (doc as any).lane,
    getSwimLaneDocId: (lane) => `parent-${lane._id}` as Ref<Doc>,
    ...extra
  })
}

describe('collectVisibleGroups', () => {
  it('loads the header document of a lane collapsed from the start, without its cards', () => {
    const groups = collectVisibleGroups(
      laneInput({ todo: [card('a', 'L1'), card('b', 'L2')] }, [swimLane('L1'), swimLane('L2')], {
        collapsed: new Set(['L1'])
      })
    )
    expect(groups.get('L1')).toEqual(['parent-L1'])
    expect(groups.get('L2')).toEqual(['b', 'parent-L2'])
  })

  it('drops a collapsed lane without a header document', () => {
    const groups = collectVisibleGroups(
      laneInput({ todo: [card('a', 'L1')] }, [swimLane('L1')], {
        collapsed: new Set(['L1']),
        getSwimLaneDocId: () => undefined
      })
    )
    expect(groups.get('L1')).toEqual([])
  })

  it('limits each lane cell separately', () => {
    const groups = collectVisibleGroups(
      laneInput({ todo: cards('t', 5, 'L1'), done: cards('d', 5, 'L1') }, [swimLane('L1')], {
        cellLimits: new Map([[cellKey('L1', 'done'), 4]])
      })
    )
    expect(groups.get('L1')).toEqual(['d00', 'd01', 'd02', 'd03', 'parent-L1', 't00', 't01', 't02'])
  })

  it('keeps the previous ids while a card is dragged', () => {
    const groupByDocs = { todo: cards('t', 12), done: cards('d', 12) }
    const before = collectVisibleGroups(input(groupByDocs))

    // What panelDragOver and cardDragOver do to groupByDocs: t00 leaves todo, enters the top of done.
    const dragged = groupByDocs.todo.shift() as Item
    groupByDocs.done.unshift(dragged)

    expect(collectVisibleGroups(input(groupByDocs, { dragging: true, previous: before }))).toBe(before)
    const after = collectVisibleGroups(input(groupByDocs, { previous: before }))
    expect(after.get(cellKey('', 'todo'))).toContain('t10')
    expect(after.get(cellKey('', 'done'))).not.toContain('d09')
  })

  it('keeps an expanded limit on its category when a status is inserted before it', () => {
    const groupByDocs = { todo: cards('t', 15), done: cards('d', 15), review: cards('r', 15) }
    const cellLimits = new Map([[cellKey('', 'done'), 15]])
    const categories: CategoryType[] = ['todo', 'review', 'done']

    const shifted = collectVisibleGroups(input(groupByDocs, { categories, cellLimits }))
    expect(shifted.get(cellKey('', 'done'))).toHaveLength(15)
    expect(shifted.get(cellKey('', 'review'))).toHaveLength(COLUMN_LIMIT)
  })

  it('does not query while the lanes are pending or have no cards yet', () => {
    expect(collectVisibleGroups(input({ todo: cards('t', 3) }, { lanesPending: true })).size).toBe(0)
    expect(collectVisibleGroups(laneInput({ todo: [] }, [swimLane('L1')])).size).toBe(0)
  })
})
