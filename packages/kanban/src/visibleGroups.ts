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
import type { Item, SwimLane } from './types'

export const SWIM_CELL_LIMIT = 3
export const COLUMN_LIMIT = 10

export function stateKey (state: CategoryType): string {
  return String(typeof state === 'object' ? state.name : state)
}

// By category, not column index: a status inserted before a column must not take its limit.
export function cellKey (laneId: string, state: CategoryType): string {
  return `${laneId}::${stateKey(state)}`
}

export interface VisibleGroupsInput {
  groupByDocs: Record<string | number, Item[]>
  categories: CategoryType[]
  swimLanes: SwimLane[]
  collapsed: Set<string>
  // Lanes that have reached the viewport; the rest wait. Undefined - every lane.
  seenLanes?: Set<string>
  // stateKey of collapsed columns: they show no cards.
  collapsedColumns?: Set<string>
  cellLimits: Map<string, number>
  // Limits of a cell nobody expanded yet; COLUMN_LIMIT and SWIM_CELL_LIMIT when absent
  columnLimit?: number
  swimCellLimit?: number
  swimLaneMode: boolean
  // Lanes not built yet: the board shows columns for a moment, they must not query.
  lanesPending: boolean
  // A drag reorders groupByDocs in place: cards would cross the limits and re-query.
  dragging: boolean
  previous: Map<string, Array<Ref<Doc>>>
  getSwimLaneOfDoc?: (doc: Doc) => string | undefined
  getSwimLaneDocId?: (swimLane: SwimLane) => Ref<Doc> | undefined
  getGroupByValues: (groupByDocs: Record<string | number, Item[]>, category: CategoryType) => Item[]
}

// Ids per lane (per column in the legacy layout): the cards each cell shows up to its limit and the lane
// header document. A card moving between cells keeps its id, so only the lanes it leaves or enters change.
export function collectVisibleGroups (input: VisibleGroupsInput): Map<string, Array<Ref<Doc>>> {
  if (input.dragging) return input.previous
  if (input.lanesPending) return new Map()
  const groups = new Map<string, Set<Ref<Doc>>>()
  const result = (): Map<string, Array<Ref<Doc>>> =>
    new Map(Array.from(groups, ([key, ids]) => [key, Array.from(ids).sort()]))
  const values = (category: CategoryType): Item[] => input.getGroupByValues(input.groupByDocs, category) ?? []
  const categories = input.categories.filter((category) => input.collapsedColumns?.has(stateKey(category)) !== true)
  if (!input.swimLaneMode) {
    for (const category of categories) {
      const key = cellKey('', category)
      const docs = values(category).slice(0, input.cellLimits.get(key) ?? input.columnLimit ?? COLUMN_LIMIT)
      groups.set(key, new Set(docs.map((doc) => doc._id)))
    }
    return result()
  }
  // Lanes are known before their cards: wait for the cards so each lane queries once.
  if (input.categories.every((category) => values(category).length === 0)) return new Map()
  // A collapsed lane still loads its header document, without cards.
  for (const lane of input.swimLanes) {
    if (input.seenLanes !== undefined && !input.seenLanes.has(lane._id)) continue
    const id = input.getSwimLaneDocId?.(lane)
    groups.set(lane._id, new Set(id !== undefined ? [id] : []))
  }
  for (const category of categories) {
    const perLane = new Map<string, number>()
    for (const doc of values(category)) {
      const laneId = input.getSwimLaneOfDoc?.(doc)
      const ids = laneId !== undefined ? groups.get(laneId) : undefined
      if (laneId === undefined || ids === undefined || input.collapsed.has(laneId)) continue
      const count = perLane.get(laneId) ?? 0
      perLane.set(laneId, count + 1)
      if (count < (input.cellLimits.get(cellKey(laneId, category)) ?? input.swimCellLimit ?? SWIM_CELL_LIMIT)) {
        ids.add(doc._id)
      }
    }
  }
  return result()
}
