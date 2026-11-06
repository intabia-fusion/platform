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

import { buildColumns } from './board'
import type { Item, DropTarget } from './types'
import type { CategoryType } from '@hcengineering/core'
import { stateKey } from './visibleGroups'

export function cellLimit (limits: Map<string, number>, key: string, initial: number): number {
  return limits.get(key) ?? initial
}

export function getCategoryGroups (
  states: CategoryType[],
  groupOf: ((state: CategoryType) => string | undefined) | undefined
): string[][] {
  if (groupOf === undefined) return []
  const byGroup = new Map<string, string[]>()
  for (const state of states) {
    const group = groupOf(state)
    if (group !== undefined) byGroup.set(group, [...(byGroup.get(group) ?? []), stateKey(state)])
  }
  return Array.from(byGroup.values()).filter((keys) => keys.length > 1)
}

export function groupsSignature (groups: string[][]): string {
  return JSON.stringify(groups.map((keys) => JSON.stringify([...keys].sort())).sort())
}

export function isOtherBoardGroup (states: CategoryType[], group: string[]): boolean {
  const keys = new Set(states.map((state) => stateKey(state)))
  return !group.some((key) => keys.has(key))
}

export function isMerged (state: CategoryType, members: Map<string, CategoryType[]>): boolean {
  return (members.get(stateKey(state))?.length ?? 1) > 1
}

// Where a category is drawn: its own column, the stack of collapsed ones, or nowhere (merged into another column).
export function columnPlace (
  state: CategoryType,
  collapsedKeys: Set<string>,
  members: Map<string, CategoryType[]>
): 'open' | 'stack' | 'hidden' {
  if (!members.has(stateKey(state))) return 'hidden'
  return collapsedKeys.has(stateKey(state)) ? 'stack' : 'open'
}

// No drop: outside the workflow, or a merged column. The column the card left is never blocked.
export function isBlocked (
  state: CategoryType,
  dragging: boolean,
  available: CategoryType[] | undefined,
  from: CategoryType | undefined,
  members: Map<string, CategoryType[]>
): boolean {
  if (!dragging) return false
  const own = members.get(stateKey(state)) ?? [state]
  if (from !== undefined && own.includes(from)) return false
  return own.length > 1 || (available !== undefined && !available.includes(state))
}

export function dragswap (ev: MouseEvent, i: number, s: number): boolean {
  if (s === -1) return false
  if (i < s) {
    return cardPointerOffset(ev) < 0
  } else if (i > s) {
    return cardPointerOffset(ev) > 0
  }
  return false
}

export function swimCellKey (laneId: string, stateIdx: number): string {
  return `${laneId}::${stateIdx}`
}

export interface BoardColumnView {
  membersOf: Map<string, CategoryType[]>
  categoryGroups: string[][]
  canMergeByGroup: boolean
  openColumns: CategoryType[]
  categories: CategoryType[]
  merged: boolean
  hasCollapsed: boolean
  gridColumns: string
}

// Collapsed columns leave their place and gather in one column at the end of the board.
export function buildColumnView (
  categories: CategoryType[],
  groups: string[][],
  collapsed: Set<string>,
  groupOf: ((state: CategoryType) => string | undefined) | undefined,
  fitColumns: boolean
): BoardColumnView {
  const membersOf = new Map(buildColumns(categories, groups).map((column) => [stateKey(column.state), column.members]))
  // Statuses of each `getCategoryGroup` group that holds more than one of them.
  const categoryGroups = getCategoryGroups(categories, groupOf)
  // Merging by category is offered only when it would change this board.
  const canMergeByGroup =
    categoryGroups.length > 0 &&
    groupsSignature(groups.filter((group) => !isOtherBoardGroup(categories, group))) !== groupsSignature(categoryGroups)
  const openColumns = categories.filter((state) => columnPlace(state, collapsed, membersOf) === 'open')
  return {
    membersOf,
    categoryGroups,
    canMergeByGroup,
    openColumns,
    categories: categories.filter((state) => membersOf.has(stateKey(state))),
    merged: Array.from(membersOf.values()).some((members) => members.length > 1),
    hasCollapsed: categories.some((state) => columnPlace(state, collapsed, membersOf) === 'stack'),
    gridColumns: openColumns
      .map(() => (fitColumns ? 'minmax(0, var(--kanban-col-width))' : 'var(--kanban-col-width)'))
      .join(' ')
  }
}

export function columnCardCounts (
  groups: Record<string | number, Item[]>,
  categories: CategoryType[],
  members: Map<string, CategoryType[]>,
  read: (groups: Record<string | number, Item[]>, state: CategoryType) => Item[]
): Map<string, number> {
  return new Map(
    categories.map((state) => [
      stateKey(state),
      (members.get(stateKey(state)) ?? [state]).reduce<number>(
        (total, member) => total + (read(groups, member)?.length ?? 0),
        0
      )
    ])
  )
}

export function availableDropTargets (
  categories: CategoryType[],
  targets: Map<string, DropTarget[]>,
  members: Map<string, CategoryType[]>,
  available: CategoryType[] | undefined
): Map<string, DropTarget[]> {
  return new Map(
    categories
      .filter((state) => (available === undefined || available.includes(state)) && !isMerged(state, members))
      .map((state) => [stateKey(state), targets.get(stateKey(state)) ?? []])
  )
}

export function cardPointerOffset (event: MouseEvent): number {
  const wrapper = event.currentTarget instanceof Element ? event.currentTarget : undefined
  const target = event.target instanceof Element ? event.target : undefined
  const card =
    wrapper?.matches('[data-card-id]') === true
      ? wrapper
      : (wrapper?.querySelector('[data-card-id]') ?? target?.closest('[data-card-id]'))
  const rect = card?.getBoundingClientRect()
  // Native offsetY changes its origin when the hit target becomes a nested title or icon.
  if (rect !== undefined && rect.height > 0) return event.clientY - rect.top - rect.height / 2
  return event.offsetY - ((event.target as HTMLElement)?.offsetHeight ?? 0) / 2
}

export interface DragOriginScroll {
  element: HTMLElement
  left: number
  top: number
}

export function captureDragOriginScrolls (
  source: HTMLElement | undefined,
  boundary: HTMLElement | undefined
): DragOriginScroll[] {
  const scrolls: DragOriginScroll[] = []
  for (let element = source?.parentElement; element != null; element = element.parentElement) {
    scrolls.push({ element, left: element.scrollLeft, top: element.scrollTop })
    if (element === boundary) break
  }
  return scrolls
}

export function isAtDragOrigin (
  rect: DOMRect | undefined,
  point: Pick<MouseEvent, 'clientX' | 'clientY'>,
  scrolls: DragOriginScroll[]
): boolean {
  if (rect === undefined) return false
  let x = point.clientX
  let y = point.clientY
  // The original card can detach; translate the pointer instead of measuring its preview.
  for (const scroll of scrolls) {
    x += scroll.element.scrollLeft - scroll.left
    y += scroll.element.scrollTop - scroll.top
  }
  return x >= rect.left - 8 && x <= rect.right + 8 && y >= rect.top - 8 && y <= rect.bottom + 8
}
