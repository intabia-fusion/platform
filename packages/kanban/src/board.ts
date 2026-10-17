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
import { stateKey } from './visibleGroups'

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

export type CollapseScope = 'swimlane' | 'column'

const collapsedKey = (key: string, scope: CollapseScope): string => `kanban-${scope}-collapsed-${key}`

export function loadCollapsed (key: string | undefined, scope: CollapseScope = 'swimlane'): Set<string> {
  if (key === undefined || typeof localStorage === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(collapsedKey(key, scope))
    if (raw == null) return new Set()
    const arr: string[] = JSON.parse(raw)
    return new Set(arr)
  } catch {
    return new Set()
  }
}

export function saveCollapsed (key: string | undefined, set: Set<string>, scope: CollapseScope = 'swimlane'): void {
  if (key === undefined || typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(collapsedKey(key, scope), JSON.stringify([...set]))
  } catch {
    // ignore
  }
}

// A board column: one category, or several merged into one by the user (a view setting only).
export interface BoardColumn {
  state: CategoryType
  members: CategoryType[]
}

// A merged group stays where its first member (the column it was merged into) is.
export function buildColumns (categories: CategoryType[], groups: string[][]): BoardColumn[] {
  const keys = new Set(categories.map((c) => stateKey(c)))
  const leadOf = new Map<string, string[]>()
  const merged = new Set<string>()
  for (const group of groups) {
    const present = group.filter((key) => keys.has(key))
    leadOf.set(present[0], present)
    for (const key of present) merged.add(key)
  }
  const columns: BoardColumn[] = []
  for (const state of categories) {
    const key = stateKey(state)
    const group = leadOf.get(key)
    if (group !== undefined) columns.push({ state, members: categories.filter((c) => group.includes(stateKey(c))) })
    else if (!merged.has(key)) columns.push({ state, members: [state] })
  }
  return columns
}

// Adds `other` to the column of `column`, or takes it out when it is already there.
// `other` leaves its previous group alone: the rest of that group stays merged.
export function toggleMerge (groups: string[][], column: string, other: string): string[][] {
  const without = (group: string[] | undefined): string[][] => {
    const left = (group ?? []).filter((key) => key !== other)
    return left.length > 1 ? [left] : []
  }
  const own = groups.find((g) => g.includes(column))
  if (own?.includes(other) === true) {
    return [...groups.filter((g) => g !== own), ...without(own)]
  }
  const theirs = groups.find((g) => g.includes(other))
  const rest = groups.filter((g) => g !== own && g !== theirs)
  return [...rest, ...without(theirs), [...(own ?? [column]), other]]
}

const mergedKey = (key: string): string => `kanban-column-merged-${key}`

export function loadMerged (key: string | undefined): string[][] {
  if (key === undefined || typeof localStorage === 'undefined') return []
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(mergedKey(key)) ?? '[]')
    return Array.isArray(raw)
      ? raw.filter((g): g is string[] => Array.isArray(g) && g.every((k) => typeof k === 'string'))
      : []
  } catch {
    return []
  }
}

export function saveMerged (key: string | undefined, groups: string[][]): void {
  if (key === undefined || typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(mergedKey(key), JSON.stringify(groups))
  } catch {
    // ignore
  }
}
