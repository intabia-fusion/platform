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

import type { Doc, DocumentQuery, Ref, Timestamp } from '@hcengineering/core'
import { groupByArray } from '@hcengineering/core'
import type { TimelineField } from '@hcengineering/view'

export interface Window {
  from: Timestamp
  to: Timestamp
}

type Rec = Record<string, any>

export const toField = (field: string | TimelineField): TimelineField =>
  typeof field === 'string' ? { key: field } : field

export const queryKey = (field: TimelineField): string =>
  field.mixin !== undefined ? `${field.mixin}.${field.key}` : field.key

export const sortField = (rankField: string | undefined, startField: TimelineField): string =>
  rankField ?? queryKey(startField)

// `months` in total, the selected one in the middle (earlier side gets the smaller half).
export function getWindow (month: Timestamp, months: number): Window {
  const d = new Date(month)
  const from = new Date(d.getFullYear(), d.getMonth() - Math.floor((months - 1) / 2), 1)
  const to = new Date(from.getFullYear(), from.getMonth() + months, 1)
  return { from: from.getTime(), to: to.getTime() - 1 }
}

export function endChain (field: TimelineField): TimelineField[] {
  return field.fallback !== undefined ? [field, ...endChain(toField(field.fallback))] : [field]
}

// The postgres adapter has no $or: bars ending after the window start, plus started bars with no end yet.
export function windowConditions (
  { from, to }: Window,
  startField: TimelineField,
  endField: TimelineField
): Array<DocumentQuery<Doc>> {
  const ends = endChain(endField).map(queryKey)
  const noEnd = Object.fromEntries(ends.map((key) => [key, null]))
  return [...ends.map((key) => ({ [key]: { $gte: from } })), { [queryKey(startField)]: { $lte: to }, ...noEnd }]
}

export function inWindow (
  start: Timestamp | undefined,
  end: Timestamp | undefined,
  window: Window | undefined
): boolean {
  if (window === undefined) return true
  if (start === undefined && end === undefined) return false
  return (start ?? end ?? 0) <= window.to && (end === undefined || end >= window.from)
}

// Start of a bar ending on `end` that lasts `hours` in 8-hour work days (Mon-Fri), min one day.
export function estimatedStart (end: Timestamp, hours: number | undefined): Timestamp {
  let days = Math.max(1, Math.ceil((hours ?? 0) / 8))
  const d = new Date(end)
  d.setHours(0, 0, 0, 0)
  while (--days > 0) {
    do d.setDate(d.getDate() - 1)
    while (d.getDay() === 0 || d.getDay() === 6)
  }
  return d.getTime()
}

export const getRank = (doc: Doc, rankField: string | undefined): string =>
  rankField !== undefined ? ((doc as Rec)[rankField] ?? '') : ''

export function mergeResults (
  results: Doc[][],
  rankField: string | undefined,
  getStart: (doc: Doc) => Timestamp | undefined
): Doc[] {
  const byId = new Map<Ref<Doc>, Doc>()
  for (const res of results) for (const doc of res) byId.set(doc._id, doc)
  const docs = Array.from(byId.values())
  return rankField !== undefined
    ? docs.sort((a, b) => getRank(a, rankField).localeCompare(getRank(b, rankField)))
    : docs.sort((a, b) => (getStart(a) ?? 0) - (getStart(b) ?? 0))
}

export function distinctResources (docs: Doc[], field: string | undefined): Array<Ref<Doc>> {
  if (field === undefined) return []
  const ids = docs.map((it) => (it as Rec)[field] as Ref<Doc> | undefined)
  return Array.from(new Set(ids.filter((it): it is Ref<Doc> => it != null)))
}

export function groupDocsBy (docs: Doc[], key: string): Map<string, Doc[]> {
  return groupByArray(docs, (it) => (it as Rec)[key] ?? '')
}

// Greedy: the first lane whose last bar ended on an earlier day than this one starts.
export function assignLanes (
  docs: Doc[],
  getStart: (doc: Doc) => Timestamp | undefined,
  getEnd: (doc: Doc) => Timestamp | undefined
): { sorted: Doc[], lane: number[] } {
  const day = (time: number): number => new Date(time).setHours(0, 0, 0, 0)
  const sorted = [...docs].sort((a, b) => (getStart(a) ?? 0) - (getStart(b) ?? 0))
  const ends: number[] = []
  const lane = sorted.map((doc) => {
    const from = day(getStart(doc) ?? 0)
    const i = ends.findIndex((end) => end < from)
    const index = i === -1 ? ends.length : i
    // Timeline draws a bar without an end as NOT_ENDED (4 weeks) long
    ends[index] = Math.max(day(getEnd(doc) ?? from + 28 * 24 * 60 * 60 * 1000), from)
    return index
  })
  return { sorted, lane }
}

// Owners in order of their first doc; docs without an owner go to `free`.
export function groupByOwner (docs: Doc[], field: string): { assigned: Array<[string, Doc[]]>, free?: Doc[] } {
  const byOwner = groupByArray(docs, (doc) => (doc as Rec)[field] ?? '')
  return { assigned: Array.from(byOwner.entries()).filter(([id]) => id !== ''), free: byOwner.get('') }
}

// Emits only after every slot has answered once, so a partial merge never reaches the view.
export function windowCollector (
  count: number,
  merge: (results: Doc[][]) => Doc[],
  emit: (docs: Doc[]) => void
): (index: number, res: Doc[]) => void {
  const results: Doc[][] = Array.from({ length: count }, () => [])
  const answered = new Set<number>()
  return (index, res) => {
    results[index] = res
    answered.add(index)
    if (answered.size === count) emit(merge(results))
  }
}

// Candidates without a row in the group yet, in candidate order, at most `limit`.
export function placeholderValues<T extends Doc> (candidates: T[], shown: Iterable<string>, limit: number): T[] {
  const present = new Set(shown)
  return candidates.filter((it) => !present.has(it._id)).slice(0, limit)
}

export interface DropRow {
  doc: Doc
  group?: string
  child: boolean
  rankField?: string
  // Parent doc id of a child row; `groupValue` is the groupBy value of the root row (of the parent for child rows).
  parent?: string
  groupValue?: string
}

// Neighbours of `to` among the rows that `from` can be ranked against.
export function dropNeighbours<T extends DropRow> (rows: T[], from: T, to: T): { prev?: T, next: T } | undefined {
  if (from === to || from.rankField === undefined) return undefined
  if (
    from.parent !== to.parent ||
    from.groupValue !== to.groupValue ||
    from.child !== to.child ||
    from.group !== undefined ||
    to.group !== undefined
  ) {
    return undefined
  }
  const siblings = rows.filter(
    (it) =>
      it.group === undefined &&
      it.child === from.child &&
      it.parent === from.parent &&
      it.groupValue === from.groupValue &&
      it.rankField === from.rankField &&
      it !== from
  )
  const index = siblings.indexOf(to)
  return index === -1 ? undefined : { prev: siblings[index - 1], next: to }
}

export interface DropChange<T> {
  // Fields to write besides the rank.
  updates: Record<string, any>
  // The new rank goes between these; both empty when the target parent has no children yet.
  rank: { prev?: T, next?: T }
}

interface DropOptions {
  parentField?: string
  groupBy?: string
}

// What a dragged row changes when dropped on `to`: reorder among siblings, or move under another parent.
export function dropChange<T extends DropRow> (rows: T[], from: T, to: T, opts: DropOptions): DropChange<T> | undefined {
  if (from === to || from.rankField === undefined || from.group !== undefined || to.group !== undefined) {
    return undefined
  }
  if (!from.child || opts.parentField === undefined) {
    const near = dropNeighbours(rows, from, to)
    return near !== undefined ? { updates: {}, rank: near } : undefined
  }
  // Moving between spaces is not a field update (identifiers, counters)
  if (opts.groupBy === 'space' && from.groupValue !== to.groupValue) return undefined
  const parent = to.child ? to.parent : to.doc._id
  if (parent === undefined) return undefined
  const siblings = rows.filter(
    (it) => it.child && it.group === undefined && it.parent === parent && it.rankField === from.rankField && it !== from
  )
  const updates = parent !== from.parent ? { [opts.parentField]: parent } : {}
  if (!to.child) {
    if (parent === from.parent) return undefined
    return { updates, rank: { prev: siblings[siblings.length - 1] } }
  }
  const index = siblings.indexOf(to)
  return index === -1 ? undefined : { updates, rank: { prev: siblings[index - 1], next: to } }
}

export interface MoveRow {
  doc: Doc
  resource: boolean
  unassigned?: boolean
  parent?: string
  groupValue?: string
}

// Fields to write when a bar from one resource row lands on another one.
export function resourceMove (
  from: MoveRow,
  to: MoveRow,
  opts: { resourceField: string, parentField?: string, groupBy?: string }
): Record<string, any> | undefined {
  if (from === to || !from.resource || !to.resource) return undefined
  if (opts.groupBy === 'space' && from.groupValue !== to.groupValue) return undefined
  const updates: Record<string, any> = { [opts.resourceField]: to.unassigned === true ? null : to.doc._id }
  if (opts.parentField !== undefined && to.parent !== undefined && to.parent !== from.parent) {
    updates[opts.parentField] = to.parent
  }
  return updates
}

// Non-mixin fields go into one client.update, mixin fields into one updateMixin per mixin.
export function groupWrites (changes: Array<{ field: TimelineField, value: Timestamp }>): {
  attrs: Record<string, Timestamp>
  mixins: Map<string, Record<string, Timestamp>>
} {
  const attrs: Record<string, Timestamp> = {}
  const mixins = new Map<string, Record<string, Timestamp>>()
  for (const { field, value } of changes) {
    if (field.mixin === undefined) attrs[field.key] = value
    else mixins.set(field.mixin, { ...mixins.get(field.mixin), [field.key]: value })
  }
  return { attrs, mixins }
}
