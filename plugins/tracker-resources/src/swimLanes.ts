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

import { Analytics } from '@hcengineering/analytics'
import { getObjectValue, type Doc, type DocumentUpdate, type IDocManager, type Ref } from '@hcengineering/core'
import type { Item, SwimLane } from '@hcengineering/kanban'
import { type Component, IssuePriority } from '@hcengineering/tracker'
import tracker from './plugin'
import { defaultPriorities, issuePriorities } from './types'

// Pure helpers of the kanban swim lanes, kept free of Svelte imports so that jest can load them.

export const UNASSIGNED_SWIM = '__swim_unassigned__'

// Fields that must not be changed via drag (project immutable).
// Board lanes are filters: no single value puts a card into one, so cards stay in their lane.
const IMMUTABLE_SWIM_FIELDS = new Set<string>(['space', 'board'])

const labelKey = (label: string): string => label.toLowerCase().trim()

export function normalizeSwimValue (
  field: string,
  v: unknown,
  components: IDocManager<Component>
): { key: string, value: unknown, empty: boolean, title?: string } {
  if (v == null) return { key: UNASSIGNED_SWIM, value: null, empty: true }
  if (field === 'attachedTo' && v === tracker.ids.NoParent) {
    return { key: UNASSIGNED_SWIM, value: tracker.ids.NoParent, empty: true }
  }
  // Components with the same label may exist in different projects — group
  // them under one swimlane keyed by the (case-folded, trimmed) label so the
  // user sees a single "Chat" lane instead of one per project.
  if (field === 'component') {
    const c = components.get(v as Ref<Component>)
    if (c !== undefined) {
      const label = c.label
      return { key: 'component:' + labelKey(label), value: v, empty: false, title: label }
    }
  }
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
    return { key: String(v), value: v, empty: false }
  }
  return { key: JSON.stringify(v), value: v, empty: false }
}

// One lane per distinct value of `field`, the empty lane first.
export function buildSwimLanes (
  field: string,
  tasks: Doc[],
  components: IDocManager<Component>,
  emptyLabel: string
): SwimLane[] {
  if (field === 'none' || field === '') return []
  const seen = new Map<string, { value: unknown, empty: boolean, title?: string }>()
  for (const t of tasks) {
    const n = normalizeSwimValue(field, getObjectValue(field, t), components)
    if (!seen.has(n.key)) seen.set(n.key, { value: n.value, empty: n.empty, title: n.title })
  }
  // Priority has a fixed ordered set; preseed to keep empty lanes too.
  if (field === 'priority') {
    for (const p of defaultPriorities) {
      const k = String(p)
      if (!seen.has(k)) seen.set(k, { value: p, empty: false })
    }
  }
  const lanes: SwimLane[] = []
  let unassigned: SwimLane | undefined
  for (const [key, { value, empty, title }] of seen) {
    const lane: SwimLane = {
      _id: key,
      title: empty ? emptyLabel : (title ?? ''),
      value,
      icon: field === 'priority' && !empty ? issuePriorities[value as IssuePriority]?.icon : undefined
    }
    if (empty) unassigned = lane
    else lanes.push(lane)
  }
  if (unassigned !== undefined) lanes.unshift(unassigned)
  return lanes
}

// The empty lane stays first; the rest follow `sort` and fall back to `fallbackKey`.
// A failing sort keeps the fallback order: with no lanes the board would load no cards.
export async function sortSwimLanes (
  lanes: SwimLane[],
  sort: (values: unknown[]) => Promise<unknown[] | undefined>,
  fallbackKey: (lane: SwimLane) => string
): Promise<SwimLane[]> {
  const unassigned = lanes.filter((it) => it._id === UNASSIGNED_SWIM)
  const rest = lanes.filter((it) => it._id !== UNASSIGNED_SWIM)
  const sorted =
    rest.length > 1
      ? await sort(rest.map((it) => it.value)).catch((err) => {
        console.error('Swim lane sort failed', err)
        Analytics.handleError(err)
        return undefined
      })
      : undefined
  return [...unassigned, ...orderSwimLanes(rest, sorted, fallbackKey)]
}

// The update a drop on `swimLane` applies to `doc`; undefined when the field cannot change.
export function swimLaneUpdateProps (
  field: string,
  doc: Doc,
  swimLane: SwimLane,
  components: IDocManager<Component>
): DocumentUpdate<Item> | undefined {
  if (field === 'none' || field === '') return undefined
  if (IMMUTABLE_SWIM_FIELDS.has(field)) return undefined
  let value: unknown = swimLane.value
  // Components are aggregated by label across projects; pick the ref that
  // belongs to the dropped issue's project, or skip the update entirely if
  // this lane has no matching component for the issue's project.
  if (field === 'component') {
    const label = labelKey(components.get(swimLane.value as Ref<Component>)?.label ?? '')
    const match = components.filter((c) => labelKey(c.label) === label && c.space === doc.space)[0]?._id
    if (match === undefined) return undefined
    value = match
  }
  const update: DocumentUpdate<Item> = { [field]: value }
  if (field === 'attachedTo') {
    ;(update as any).attachedToClass = tracker.class.Issue
  }
  return update
}

/**
 * Swim lanes in display order: lanes whose values are in `sortedValues` go first in that order, the rest
 * follow, sorted by `fallbackKey`.
 */
export function orderSwimLanes<T extends { value: unknown }> (
  lanes: T[],
  sortedValues: unknown[] | undefined,
  fallbackKey: (lane: T) => string
): T[] {
  const index = new Map<unknown, number>((sortedValues ?? []).map((value, i) => [value, i]))
  const unknown = index.size
  return [...lanes].sort((a, b) => {
    const ai = index.get(a.value) ?? unknown
    const bi = index.get(b.value) ?? unknown
    if (ai !== bi) return ai - bi
    return fallbackKey(a).localeCompare(fallbackKey(b))
  })
}
