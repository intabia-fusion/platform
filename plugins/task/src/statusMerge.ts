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
import type { ProjectType, TaskType } from './index'

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
  // Only these task types of the project type take the target in place of the sources, absent: all
  taskTypes?: Array<Ref<TaskType>>
}

/**
 * Domain request served by the transactor: how much of the workspace uses a status.
 * @public
 */
export const statusUsageDomain = 'task:domain:StatusUsage' as OperationDomain

/**
 * @public
 */
export interface StatusUsageParams {
  projectType: Ref<ProjectType>
  status: Ref<Status>
}

/**
 * @public
 */
export interface StatusUsageResult {
  // Tasks in the status in the whole workspace, archived and private spaces included
  tasks: number
  // Of them, per task type of the project type
  byKind: Record<string, number>
  // Projects of the project type whose defaultIssueStatus is the status
  projects: number
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
 * Adds the target right after the first source of a list that lacks it, sources stay.
 * Returns the same array when nothing is added.
 * @public
 */
export function addStatusTarget (ids: string[], map: Map<string, string>): string[] {
  const out: string[] = []
  for (const id of ids) {
    out.push(id)
    const target = map.get(id)
    if (target !== undefined && !ids.includes(target) && !out.includes(target)) out.push(target)
  }
  return out.length === ids.length ? ids : out
}

/**
 * Replaces ids and drops repeats; a source in `kept` stays and the target joins right after it.
 * @public
 */
export function mapStatusOrder (order: string[], map: Map<string, string>, kept: Set<string>): string[] {
  const out: string[] = []
  const push = (id: string): void => {
    if (!out.includes(id)) out.push(id)
  }
  for (const id of order) {
    const target = map.get(id)
    if (target === undefined || !kept.has(id)) {
      push(mapStatusId(id, map))
    } else {
      push(id)
      if (!order.includes(target)) push(target)
    }
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

const entryStyleKeys = ['color', 'icon', 'description']

// Readers take the first entry of a status: all entries of the target share its style.
function withStyleOf (entry: ProjectStatusEntry, template: ProjectStatusEntry): ProjectStatusEntry {
  const next = { ...entry }
  for (const key of entryStyleKeys) {
    if (template[key] === undefined) {
      delete next[key] // eslint-disable-line @typescript-eslint/no-dynamic-delete
    } else {
      next[key] = template[key]
    }
  }
  return next
}

/**
 * One entry per (status, taskType): first position, content of the target's own entry. An entry without a
 * task type goes when the status has another entry.
 * @public
 */
export function mergeProjectStatusEntries (
  entries: ProjectStatusEntry[],
  map: Map<string, string>,
  taskTypes?: Set<string>
): ProjectStatusEntry[] {
  const out: ProjectStatusEntry[] = []
  const index = new Map<string, number>()
  const own = new Set<string>()
  const merged = new Set<string>()
  for (const e of entries) {
    // An entry of a task type outside `taskTypes` keeps its status
    const moves = map.has(e._id) && (taskTypes === undefined || (e.taskType !== undefined && taskTypes.has(e.taskType)))
    const id = moves ? mapStatusId(e._id, map) : e._id
    const key = `${id}:${e.taskType}`
    const next = { ...e, _id: id }
    const at = index.get(key)
    if (moves) merged.add(id)
    if (at === undefined) {
      index.set(key, out.length)
      out.push(next)
      if (!moves) own.add(key)
    } else if (!moves && !own.has(key)) {
      out[at] = next
      own.add(key)
    }
  }
  for (const id of merged) {
    const template = entries.find((it) => it._id === id) ?? out.find((it) => it._id === id)
    if (template === undefined) continue
    for (let i = 0; i < out.length; i++) {
      if (out[i]._id === id) out[i] = withStyleOf(out[i], template)
    }
  }
  const typed = new Set(out.filter((it) => it.taskType !== undefined).map((it) => it._id))
  return out.filter((it) => it.taskType !== undefined || !typed.has(it._id))
}

/**
 * Adds a target entry after the first source entry of a task type that lacks one.
 * Sources stay; returns the same array when nothing is added.
 * @public
 */
export function addTargetStatusEntries (
  entries: ProjectStatusEntry[],
  map: Map<string, string>,
  taskTypes?: Set<string>
): ProjectStatusEntry[] {
  const have = new Set(entries.map((it) => `${it._id}:${it.taskType}`))
  const out: ProjectStatusEntry[] = []
  for (const e of entries) {
    out.push(e)
    const target = map.get(e._id)
    if (target === undefined || e.taskType === undefined) continue
    if (taskTypes !== undefined && !taskTypes.has(e.taskType)) continue
    const key = `${target}:${e.taskType}`
    if (have.has(key)) continue
    have.add(key)
    out.push({ ...(entries.find((it) => it._id === target) ?? e), _id: target, taskType: e.taskType })
  }
  return out.length === entries.length ? entries : out
}

/**
 * Applies `rewrite` to the status lists of a subtask or parent status rule, `null` stays.
 * `taskTypes` limits it to those task types.
 * @public
 */
export function rewriteRuleStatuses (
  statuses: Record<string, string[] | null>,
  rewrite: (ids: string[]) => string[],
  taskTypes?: Set<string>
): Record<string, string[] | null> {
  const out: Record<string, string[] | null> = {}
  for (const [taskType, ids] of Object.entries(statuses)) {
    out[taskType] = Array.isArray(ids) && (taskTypes === undefined || taskTypes.has(taskType)) ? rewrite(ids) : ids
  }
  return out
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
