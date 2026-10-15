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

import type { CategoryType, Doc, Rank, Ref } from '@hcengineering/core'
import type { Item } from './types'

export interface DragState {
  card: Item | undefined
  initialLane: string | undefined
  initialState: CategoryType | undefined
  lane: string | undefined
  state: CategoryType | undefined
  // Insertion index among the other cards of the cell; undefined - append at the end.
  targetIndex: number | undefined
}

// Cards of one lane cell, with the dragged card shown where it would land.
export function laneCellValues (
  raw: Item[],
  laneId: string,
  category: CategoryType,
  ofDoc: ((doc: Doc) => string | undefined) | undefined,
  drag: DragState
): Item[] {
  const card = drag.card
  const inThisLane = card !== undefined && drag.lane === laneId && drag.state === category
  const isOriginal = card !== undefined && drag.initialLane === laneId && drag.initialState === category
  if (inThisLane && isOriginal && drag.targetIndex === undefined) {
    // Card stays at its original position in the original cell — no filtering of dragCard.
    return ofDoc === undefined ? raw : raw.filter((doc) => doc._id === card._id || ofDoc(doc) === laneId)
  }
  const arr = raw.filter((doc) => doc._id !== card?._id)
  const filtered = ofDoc === undefined ? arr : arr.filter((doc) => ofDoc(doc) === laneId)
  if (!inThisLane) return filtered
  const idx = drag.targetIndex
  if (idx !== undefined && idx >= 0 && idx <= filtered.length) {
    return [...filtered.slice(0, idx), card, ...filtered.slice(idx)]
  }
  return [...filtered, card]
}

// Drop at `desired` of the cell as shown, mapped to an index among the other cards.
export function insertIndex (desired: number, dragIdx: number, length: number): number {
  const without = length - (dragIdx !== -1 ? 1 : 0)
  const mapped = dragIdx !== -1 && dragIdx < desired ? desired - 1 : desired
  return Math.max(0, Math.min(mapped, without))
}

// Ranks around the dragged card: at `targetIndex`, else at its own place, else at the end.
export function neighbourRanks (
  cell: Item[],
  dragId: Ref<Doc>,
  targetIndex: number | undefined
): [Rank | undefined, Rank | undefined] {
  const without = cell.filter((doc) => doc._id !== dragId)
  const pos = cell.findIndex((doc) => doc._id === dragId)
  const idx = targetIndex ?? (pos === -1 ? without.length : pos)
  return [without[idx - 1]?.rank, without[idx]?.rank]
}

const collapsedKey = (key: string): string => `kanban-swimlane-collapsed-${key}`

export function loadCollapsed (key: string | undefined): Set<string> {
  if (key === undefined || typeof localStorage === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(collapsedKey(key))
    if (raw == null) return new Set()
    const arr: string[] = JSON.parse(raw)
    return new Set(arr)
  } catch {
    return new Set()
  }
}

export function saveCollapsed (key: string | undefined, set: Set<string>): void {
  if (key === undefined || typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(collapsedKey(key), JSON.stringify([...set]))
  } catch {
    // ignore
  }
}
