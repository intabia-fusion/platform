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

import type { Doc, OperationDomain, Ref, Status } from '@hcengineering/core'
import type { ProjectType } from './index'

/**
 * Domain request served by the transactor: merges statuses of a project type.
 * @public
 */
export const statusMergeDomain = 'task:domain:StatusMerge' as OperationDomain

/**
 * @public
 */
export interface MergeStatusesParams {
  projectType: Ref<ProjectType>
  target: Ref<Status>
  sources: Array<Ref<Status>>
  // Delete-with-transfer: a source may have another category and may be outside the project type
  transfer?: boolean
}

/**
 * `ok: false` means nothing was written; `conflicts` tells why.
 * @public
 */
export interface MergeStatusesResult {
  ok: boolean
  merged: Array<Ref<Status>>
  tasksMoved: number
  removed: Array<Ref<Status>>
  // Merged sources that something else still refers to.
  kept: Array<Ref<Status>>
  conflicts: Array<{
    kind: 'self' | 'conflict' | 'forbiddenTask'
    workflow?: Ref<Doc>
    transition?: Ref<Doc>
    task?: Ref<Doc>
    // Structured parts of the message for the client to localize: transition names (`self`: the transition,
    // `conflict`: the transition and the one it clashes with), status ids (`forbiddenTask`: from and to)
    names?: string[]
    statuses?: string[]
    message: string
  }>
}

// Pure helpers of the merge, kept free of server types.

export function mapStatusId (id: string, map: Map<string, string>): string {
  return map.get(id) ?? id
}

/**
 * Replaces ids and drops repeats, keeping the first position.
 * @public
 */
export function mapStatusIds (ids: string[], map: Map<string, string>): string[] {
  const out: string[] = []
  for (const id of ids) {
    const m = mapStatusId(id, map)
    if (!out.includes(m)) out.push(m)
  }
  return out
}

/**
 * @public
 */
export interface ProjectStatusEntry {
  _id: string
  taskType?: string
  [key: string]: any
}

/**
 * One entry per (status, taskType): first position, content of the target's own entry. An entry without a
 * task type goes when the status has another entry.
 * @public
 */
export function mergeProjectStatusEntries (
  entries: ProjectStatusEntry[],
  map: Map<string, string>
): ProjectStatusEntry[] {
  const out: ProjectStatusEntry[] = []
  const index = new Map<string, number>()
  const own = new Set<string>()
  for (const e of entries) {
    const key = `${mapStatusId(e._id, map)}:${e.taskType}`
    const isOwn = !map.has(e._id)
    const next = { ...e, _id: mapStatusId(e._id, map) }
    const at = index.get(key)
    if (at === undefined) {
      index.set(key, out.length)
      out.push(next)
      if (isOwn) own.add(key)
    } else if (isOwn && !own.has(key)) {
      out[at] = next
      own.add(key)
    }
  }
  const typed = new Set(out.filter((it) => it.taskType !== undefined).map((it) => it._id))
  return out.filter((it) => it.taskType !== undefined || !typed.has(it._id))
}

/**
 * @public
 */
export interface StatusAttributeUpdates {
  set?: any[]
  added?: any[]
  removed?: any[]
  prevValue?: any
  [key: string]: any
}

/**
 * @public
 */
export function statusIdsInAttributeUpdates (au: StatusAttributeUpdates): string[] {
  return [...(au.set ?? []), ...(au.added ?? []), ...(au.removed ?? []), au.prevValue].filter(
    (it) => typeof it === 'string'
  )
}

/**
 * Rewrites only the fields that are present.
 * @public
 */
export function rewriteStatusAttributeUpdates (
  au: StatusAttributeUpdates,
  map: Map<string, string>
): StatusAttributeUpdates {
  const result: StatusAttributeUpdates = { ...au }
  for (const key of ['set', 'added', 'removed']) {
    if (Array.isArray(au[key])) {
      result[key] = au[key].map((it: any) => (typeof it === 'string' ? mapStatusId(it, map) : it))
    }
  }
  if (typeof au.prevValue === 'string') result.prevValue = mapStatusId(au.prevValue, map)
  return result
}

/**
 * Replaces quoted ids in a JSON string (saved filters).
 * @public
 */
export function replaceStatusIdsInJson (json: string, map: Map<string, string>): string {
  let result = json
  for (const [from, to] of map) {
    result = result.split(`"${from}"`).join(`"${to}"`)
  }
  return result
}

/**
 * Request check against the live statuses: the target belongs to the project type, same attribute and same
 * category as every source. Sources outside the project type count as already merged.
 * `transfer`: the category may differ and an existing source outside the project type is moved too.
 * @public
 */
export function checkStatusMerge (
  req: { target: string, sources: string[], transfer?: boolean },
  statuses: Map<string, { ofAttribute: string, category?: string }>,
  inProjectType: Set<string>
): { errors: string[], sources: string[] } {
  const errors: string[] = []
  const sources: string[] = []
  const target = statuses.get(req.target)
  if (target === undefined || !inProjectType.has(req.target)) {
    return { errors: [`target ${req.target} is not a status of the project type`], sources }
  }
  for (const id of new Set(req.sources)) {
    const src = statuses.get(id)
    if (id === req.target) {
      errors.push(`${id}: target listed as its own source`)
    } else if (src === undefined || (!inProjectType.has(id) && req.transfer !== true)) {
      continue
    } else if (src.ofAttribute !== target.ofAttribute) {
      errors.push(`${id}: attribute differs from the target`)
    } else if (req.transfer !== true && src.category !== target.category) {
      errors.push(`${id}: category differs from the target, only same-category statuses can be merged`)
    } else {
      sources.push(id)
    }
  }
  return { errors, sources }
}
