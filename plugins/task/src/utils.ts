//
// Copyright © 2020, 2021 Anticrm Platform Contributors.
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

import core, {
  type AnyAttribute,
  type Attribute,
  Class,
  ClassifierKind,
  Data,
  Doc,
  generateId,
  Hierarchy,
  IdMap,
  notEmpty,
  type Rank,
  Ref,
  type RefTo,
  Status,
  type StatusCategory,
  TxOperations
} from '@hcengineering/core'
import {
  getEmbeddedLabel,
  getResource,
  PlatformError,
  Severity,
  Status as PlatformStatus,
  translate,
  unknownStatus
} from '@hcengineering/platform'
import { makeRank } from '@hcengineering/rank'
import task, { Project, ProjectStatus, ProjectType, Task, TaskType, TaskTypeDescriptor } from '.'

export { genRanks, makeRank } from '@hcengineering/rank'
export * from './transfer'

/**
 * @deprecated Prefer {@link makeRank}
 *
 * TODO: Drop after everything migrates to {@link makeRank}
 */
export const calcRank = (prev?: { rank: Rank }, next?: { rank: Rank }): string => {
  return makeRank(prev?.rank, next?.rank)
}

/**
 * @public
 * Statuses of the project type, each once. An entry without a task type is a status that
 * no task type lists: the settings screens need it, `onlyInTaskTypes` leaves it out.
 */
export function getProjectTypeStates (
  projectType: Ref<ProjectType> | undefined,
  types: IdMap<ProjectType>,
  statuses: IdMap<Status>,
  onlyInTaskTypes: boolean = false
): Status[] {
  if (projectType === undefined) return []
  const seen = new Set<Ref<Status>>()
  const res: Status[] = []
  for (const p of types.get(projectType)?.statuses ?? []) {
    if (seen.has(p._id) || (onlyInTaskTypes && p.taskType === undefined)) continue
    const status = statuses.get(p._id)
    if (status !== undefined) {
      seen.add(p._id)
      res.push(status)
    }
  }
  return res
}

/**
 * @public
 * Statuses a task of the project can have: the ones some task type of its project type lists.
 */
export function getStates (space: Project | undefined, types: IdMap<ProjectType>, statuses: IdMap<Status>): Status[] {
  if (space === undefined) return []
  return getProjectTypeStates(space.type, types, statuses, true)
}

/**
 * @public
 */
export function getTaskTypeStates (
  taskType: Ref<TaskType> | undefined,
  types: IdMap<TaskType>,
  statuses: IdMap<Status>
): Status[] {
  if (taskType === undefined) return []
  return (
    (types
      .get(taskType)
      ?.statuses?.map((p) => statuses.get(p))
      ?.filter((p) => p !== undefined) as Status[]) ?? []
  )
}

/**
 * @public
 * Status categories in the order of the "process states" settings screen.
 * A function, not a constant: `task` is not initialised yet when this module is first evaluated.
 */
export function getStatusCategoryOrder (): Array<Ref<StatusCategory>> {
  return [
    task.statusCategory.UnStarted,
    task.statusCategory.ToDo,
    task.statusCategory.Active,
    task.statusCategory.Won,
    task.statusCategory.Lost
  ]
}

/**
 * @public
 * Task types sorted the way the project type settings screen lists them (by name).
 * `ProjectType.tasks` keeps creation order, which the user never sees.
 */
export function sortTaskTypesByName (taskTypes: TaskType[]): TaskType[] {
  return [...taskTypes].sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * @public
 * Task types of a project type in the order the settings screen lists them.
 */
export function getOrderedTaskTypes (type: ProjectType | undefined, taskTypes: IdMap<TaskType>): TaskType[] {
  const res = (type?.tasks ?? []).map((it) => taskTypes.get(it)).filter(notEmpty)
  return sortTaskTypesByName(res)
}

/**
 * @public
 * Task types of several project types for one merged status order: project types by name (then id), inside each
 * its task types as the settings screen lists them. A single project type gives its own order, so a shared
 * status has the same place in every view of that type; the order never depends on a selected task type.
 */
export function getStatusOrderTaskTypes (types: ProjectType[], taskTypes: IdMap<TaskType>): TaskType[] {
  const sorted = [...types].sort((a, b) => {
    const byName = a.name.localeCompare(b.name)
    return byName !== 0 ? byName : a._id.localeCompare(b._id)
  })
  return sorted
    .flatMap((it) => getOrderedTaskTypes(it, taskTypes))
    .filter((it, idx, arr) => arr.findIndex((p) => p._id === it._id) === idx)
}

/**
 * @public
 * Merges the status sequences of the task types into one rank per status that keeps every task type's own
 * order: a status shared by several task types goes after everything that precedes it in any of them. Ties,
 * and conflicting orders, resolve by task type order, then by position in that task type.
 */
export function mergeStatusOrder (orderedTaskTypes: TaskType[]): Map<Ref<Status>, number> {
  const keys = new Map<Ref<Status>, [number, number]>()
  const successors = new Map<Ref<Status>, Set<Ref<Status>>>()
  const indegree = new Map<Ref<Status>, number>()

  orderedTaskTypes.forEach((taskType, taskTypeIndex) => {
    const statuses = (taskType.statuses ?? []).filter((it, idx, arr) => arr.indexOf(it) === idx)
    statuses.forEach((status, statusIndex) => {
      if (!keys.has(status)) {
        keys.set(status, [taskTypeIndex, statusIndex])
        successors.set(status, new Set())
        indegree.set(status, 0)
      }
      if (statusIndex > 0) {
        const next = successors.get(statuses[statusIndex - 1]) as Set<Ref<Status>>
        if (!next.has(status)) {
          next.add(status)
          indegree.set(status, (indegree.get(status) ?? 0) + 1)
        }
      }
    })
  })

  const compareKeys = (a: Ref<Status>, b: Ref<Status>): number => {
    const [aType, aIndex] = keys.get(a) as [number, number]
    const [bType, bIndex] = keys.get(b) as [number, number]
    return aType !== bType ? aType - bType : aIndex - bIndex
  }

  const remaining = new Set(keys.keys())
  const rank = new Map<Ref<Status>, number>()
  while (remaining.size > 0) {
    // The smallest status nothing remaining precedes. Only a cycle (task types disagreeing on the order)
    // leaves no such status: then the smallest one at all, so task type order wins.
    let pick: Ref<Status> | undefined
    for (const status of remaining) {
      if (indegree.get(status) === 0 && (pick === undefined || compareKeys(status, pick) < 0)) pick = status
    }
    if (pick === undefined) {
      for (const status of remaining) {
        if (pick === undefined || compareKeys(status, pick) < 0) pick = status
      }
    }
    const picked = pick as Ref<Status>
    remaining.delete(picked)
    rank.set(picked, rank.size)
    for (const next of successors.get(picked) ?? []) {
      if (remaining.has(next)) indegree.set(next, (indegree.get(next) ?? 1) - 1)
    }
  }
  return rank
}

/**
 * @public
 * One rank per status for the given project types, by name. Inside a type `ProjectType.statusOrder` goes
 * first, then the merged task type order (`mergeStatusOrder`), then statuses of no task type in
 * `ProjectType.statuses` order. No type has `statusOrder`: the plain merged order of all their task types.
 */
export function getProjectStatusRank (
  types: Array<Pick<ProjectType, '_id' | 'name' | 'statuses' | 'tasks' | 'statusOrder'>>,
  taskTypes: IdMap<TaskType>
): Map<Ref<Status>, number> {
  if (!types.some((it) => it.statusOrder !== undefined)) {
    return mergeStatusOrder(getStatusOrderTaskTypes(types as ProjectType[], taskTypes))
  }
  const sorted = [...types].sort((a, b) => {
    const byName = a.name.localeCompare(b.name)
    return byName !== 0 ? byName : a._id.localeCompare(b._id)
  })
  const rank = new Map<Ref<Status>, number>()
  for (const type of sorted) {
    const merged = [...mergeStatusOrder(getOrderedTaskTypes(type as ProjectType, taskTypes))]
      .sort((a, b) => a[1] - b[1])
      .map(([id]) => id)
    const ids = [...(type.statusOrder ?? []), ...merged, ...type.statuses.map((it) => it._id)]
    for (const id of ids) {
      if (!rank.has(id)) rank.set(id, rank.size)
    }
  }
  return rank
}

/**
 * @public
 * Position of a status among the UNIQUE statuses of its category in the project type, for the category icon
 * (`index` of `count`; `count` is one more than the number of statuses). Task types are ignored, so every
 * place that shows the status draws the same icon. Order is `getProjectStatusRank`.
 * `index` is 0 when the status is not in the project type.
 */
export function getStatusIconPosition (
  type: Pick<ProjectType, 'statuses' | 'tasks' | 'statusOrder'> | undefined,
  taskTypes: IdMap<TaskType>,
  statuses: IdMap<Status>,
  statusId: Ref<Status>
): { index: number, count: number } {
  const category = statuses.get(statusId)?.category
  const unique = [...new Set((type?.statuses ?? []).map((it) => it._id))].filter(
    (id) => statuses.get(id)?.category === category
  )
  const rank =
    type !== undefined
      ? getProjectStatusRank([{ _id: '' as Ref<ProjectType>, name: '', ...type }], taskTypes)
      : new Map<Ref<Status>, number>()
  const order = (id: Ref<Status>): number => rank.get(id) ?? rank.size
  // Array.sort is stable, so equal ranks keep the ProjectType.statuses order
  unique.sort((a, b) => order(a) - order(b))
  return { index: unique.indexOf(statusId) + 1, count: unique.length + 1 }
}

/**
 * @public
 * Position of a status among the statuses of its category in the order of one task type (`TaskType.statuses`),
 * same `index`/`count` convention as `getStatusIconPosition`. `undefined` when the task type does not list the status.
 */
export function getTaskTypeStatusIconPosition (
  taskType: Pick<TaskType, 'statuses'> | undefined,
  statuses: IdMap<Status>,
  statusId: Ref<Status>
): { index: number, count: number } | undefined {
  const category = statuses.get(statusId)?.category
  const unique = [...new Set(taskType?.statuses ?? [])].filter((id) => statuses.get(id)?.category === category)
  const index = unique.indexOf(statusId)
  return index < 0 ? undefined : { index: index + 1, count: unique.length + 1 }
}

/**
 * @public
 * Task type a `kind` condition of a query narrows to: a plain ref or `$in` with one value, otherwise `undefined`.
 */
export function getSingleQueryKind (kind: unknown): Ref<TaskType> | undefined {
  if (typeof kind === 'string') return kind as Ref<TaskType>
  const list = (kind as { $in?: unknown } | null | undefined)?.$in
  return Array.isArray(list) && list.length === 1 && typeof list[0] === 'string'
    ? (list[0] as Ref<TaskType>)
    : undefined
}

/**
 * @public
 * The only task type of the project type, or the only one that lists any of `statusIds`; `undefined` when
 * there are several (or none).
 */
export function getSingleStatusTaskType (
  type: Pick<ProjectType, 'tasks'> | undefined,
  taskTypes: IdMap<TaskType>,
  statusIds: Array<Ref<Status>>
): Ref<TaskType> | undefined {
  if (type?.tasks.length === 1) return type.tasks[0]
  const found = new Set<Ref<TaskType>>()
  for (const id of type?.tasks ?? []) {
    if (statusIds.some((it) => taskTypes.get(id)?.statuses.includes(it) === true)) found.add(id)
  }
  return found.size === 1 ? [...found][0] : undefined
}

/**
 * @public
 * Comparator for status refs used by grouped views: by category (`categoryOrder`), then by the merged order
 * of the task types (`mergeStatusOrder`), then by name. Unknown categories and statuses outside
 * `orderedTaskTypes` go after the known ones.
 */
export function statusOrderComparator (
  categoryOrder: ReadonlyArray<Ref<StatusCategory>>,
  orderedTaskTypes: TaskType[],
  statuses: IdMap<Status>,
  // Ranks that replace the merged order of `orderedTaskTypes`, see `getProjectStatusRank`
  rankOverride?: Map<Ref<Status>, number>
): (a: Ref<Status>, b: Ref<Status>) => number {
  const rank = rankOverride ?? mergeStatusOrder(orderedTaskTypes)
  const unknownRank = rank.size
  const categoryIndex = (status: Status | undefined): number => {
    const idx = status?.category != null ? categoryOrder.indexOf(status.category) : -1
    return idx >= 0 ? idx : categoryOrder.length
  }
  return (a, b) => {
    const aVal = statuses.get(a)
    const bVal = statuses.get(b)
    const byCategory = categoryIndex(aVal) - categoryIndex(bVal)
    if (byCategory !== 0) return byCategory
    const byRank = (rank.get(a) ?? unknownRank) - (rank.get(b) ?? unknownRank)
    if (byRank !== 0) return byRank
    return (aVal?.name ?? '').localeCompare(bVal?.name ?? '')
  }
}

/**
 * @public
 */
export async function createState<T extends Status> (
  client: TxOperations,
  _class: Ref<Class<T>>,
  data: Data<T>,
  _id?: Ref<T>
): Promise<Ref<T>> {
  if (_id !== undefined) {
    const byId = await client.findOne<Status>(_class, { _id })
    if (byId !== undefined) {
      return byId._id as Ref<T>
    }
    return await client.createDoc(_class, core.space.Model, data, _id)
  }

  return await client.createDoc(_class, core.space.Model, data)
}

type StatusLike = Pick<Status, '_id' | 'name' | 'ofAttribute' | 'category'>

/**
 * Identity of a status inside a project type: same attribute and same name,
 * ignoring case and outer spaces.
 * @public
 */
export function statusKey (ofAttribute: Ref<Attribute<Status>>, name: string): string {
  return `${ofAttribute}:${name.trim().toLowerCase()}`
}

/**
 * @public
 */
export type StatusReuse =
  | { action: 'create' }
  | { action: 'reuse', status: StatusLike }
  // Same key exists in another category: the caller must reject the name.
  | { action: 'conflict', status: StatusLike }

/**
 * Decides what to do with a status named `data.name`, given the statuses already
 * in the project type.
 * `exclude` is the status being renamed: it never matches itself.
 * @public
 */
export function resolveStatusReuse (
  existing: StatusLike[],
  data: Pick<Data<Status>, 'ofAttribute' | 'name' | 'category'>,
  exclude?: Ref<Status>
): StatusReuse {
  const key = statusKey(data.ofAttribute, data.name)
  const same = existing.filter((it) => it._id !== exclude && statusKey(it.ofAttribute, it.name) === key)
  const sameCategory = same.find((it) => it.category === data.category)
  if (sameCategory !== undefined) return { action: 'reuse', status: sameCategory }
  if (same.length > 0) return { action: 'conflict', status: same[0] }
  return { action: 'create' }
}

/**
 * True when no other project type lists the status, so changing the Status document itself is visible
 * only inside `typeId`.
 * @public
 */
export function isStatusOnlyInType (
  statusId: Ref<Status>,
  typeId: Ref<ProjectType>,
  types: Iterable<Pick<ProjectType, '_id' | 'statuses'>>
): boolean {
  for (const t of types) {
    if (t._id !== typeId && t.statuses.some((it) => it._id === statusId)) return false
  }
  return true
}

/**
 * @public
 * Why the new name of a status is rejected, if it is. `conflict`: the name exists in another category;
 * `exists`: it is already listed by one of `taskTypes`; `duplicateWithTasks`: `tasks` tasks would move to
 * the existing status, the duplicate merge is offered instead.
 */
export function getStatusNameBlock (
  found: StatusReuse,
  taskTypes: Array<Pick<TaskType, 'statuses'>>,
  tasks: number
): 'conflict' | 'exists' | 'duplicateWithTasks' | undefined {
  if (found.action === 'create') return undefined
  if (found.action === 'conflict') return 'conflict'
  if (taskTypes.some((tt) => tt.statuses.includes(found.status._id))) return 'exists'
  return tasks > 0 ? 'duplicateWithTasks' : undefined
}

/**
 * @public
 * A rename updates the Status document itself when the model does not define it, no other project type
 * lists it and no other status of the project type has the new name. Model builders name documents by
 * plugin id (`tracker:status:Backlog`), while `generateId` (user and import created ones) has no ':'.
 * `createdBy` cannot tell them apart: the importer creates statuses as System too.
 */
export function canRenameStatusInPlace (
  status: Pick<Status, '_id'>,
  found: StatusReuse,
  typeId: Ref<ProjectType>,
  types: Iterable<Pick<ProjectType, '_id' | 'statuses'>>
): boolean {
  return found.action === 'create' && !status._id.includes(':') && isStatusOnlyInType(status._id, typeId, types)
}

/**
 * @public
 */
export interface StatusPlacement {
  taskType: Ref<TaskType>
  // New status list of the task type, given its current list and the id of the created or reused status
  place: (statuses: Array<Ref<Status>>, id: Ref<Status>) => Array<Ref<Status>>
}

/**
 * @public
 * Puts `id` right after `after`, which stays. At the end when `after` is not in the list.
 */
export function placeStatusAfter (list: Array<Ref<Status>>, after: Ref<Status>, id: Ref<Status>): Array<Ref<Status>> {
  const rest = list.filter((it) => it !== id)
  const at = rest.indexOf(after)
  return at < 0 ? [...rest, id] : [...rest.slice(0, at + 1), id, ...rest.slice(at + 1)]
}

/**
 * @public
 */
export interface StatusItem {
  data: Data<Status>
  // Id to give a new status; an existing status with this id is used as is
  id?: Ref<Status>
  // `id` is a status of the project type to attach as it is, without the name rule
  attachExisting?: boolean
  // The status this item replaces: it never matches itself in the name rule
  exclude?: Ref<Status>
}

/**
 * Creates (or reuses, by the key rule) statuses of the project type and attaches them in one compare-and-set
 * apply: it commits only while `ProjectType.modifiedOn` is the value read, and applies of one project type run
 * one after another (the scope). Every status added to the project type updates it, so a concurrent creator
 * makes the commit fail; this then re-reads and reuses what the other side created. Two creators of one key
 * therefore end with one Status. No `notMatch` on the Status name: statuses are global and other project
 * types have the same names.
 *
 * `placements` put the statuses into existing task types (the task types and the project type entries are
 * updated in the same apply). With `newTaskType` instead, the statuses are reserved in the project type for a
 * task type the caller creates right after. With `projectOnly` the statuses become entries of the project type
 * without a task type.
 * `onConflict`: a name that exists in another category throws, or gets the category name appended.
 * @public
 */
export async function createStatusesAtomic (
  client: TxOperations,
  projectTypeId: Ref<ProjectType>,
  statusClass: Ref<Class<Status>>,
  items: StatusItem[],
  target: { placements?: StatusPlacement[], newTaskType?: Ref<TaskType>, projectOnly?: boolean },
  options: {
    icon?: ProjectStatus['icon']
    // Store the color, icon and description of a created status in the project type entry too
    projectEntry?: boolean
    onConflict?: 'throw' | 'rename'
    retries?: number
    delay?: (attempt: number) => Promise<void>
  } = {}
): Promise<Array<{ id: Ref<Status>, reused: boolean }>> {
  const retries = options.retries ?? 3
  // A concurrent model update may not have reached this client yet
  const delay =
    options.delay ??
    (async (attempt: number) => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 200 * attempt)
      })
    })
  const placements = target.placements ?? []
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await delay(attempt)
    const type = await client.findOne(task.class.ProjectType, { _id: projectTypeId })
    if (type === undefined) throw new PlatformError(unknownStatus('No project type found'))
    const known: StatusLike[] = await client.findAll(core.class.Status, {
      _id: { $in: type.statuses.map((it) => it._id) }
    })
    const taskTypes = await client.findAll(task.class.TaskType, { _id: { $in: type.tasks } })

    const resolved: Array<{ id: Ref<Status>, reused: boolean, create?: Data<Status> }> = []
    for (const item of items) {
      if (item.attachExisting === true && item.id !== undefined) {
        resolved.push({ id: item.id, reused: true })
        continue
      }
      let data = item.data
      let reuse = resolveStatusReuse(known, data, item.exclude)
      if (reuse.action === 'conflict') {
        if (options.onConflict !== 'rename') {
          throw new PlatformError(
            new PlatformStatus(Severity.ERROR, task.status.StatusExistsInOtherCategory, { name: data.name })
          )
        }
        const categoryName = client.getModel().findAllSync(core.class.StatusCategory, { _id: data.category })[0]
        data = { ...data, name: `${data.name.trim()} (${categoryName?.defaultStatusName ?? data.category})` }
        console.warn(`Status "${item.data.name}" exists in another category, created as "${data.name}"`)
        reuse = resolveStatusReuse(known, data, item.exclude)
      }
      if (reuse.action === 'reuse') {
        resolved.push({ id: reuse.status._id as Ref<Status>, reused: true })
        continue
      }
      const existing = item.id !== undefined ? await client.findOne(core.class.Status, { _id: item.id }) : undefined
      if (existing !== undefined) {
        resolved.push({ id: existing._id, reused: false })
        known.push(existing)
        continue
      }
      const id = item.id ?? generateId<Status>()
      resolved.push({ id, reused: false, create: data })
      known.push({ _id: id, name: data.name, ofAttribute: data.ofAttribute, category: data.category })
    }

    const overrides: Array<{ taskTypeId: Ref<TaskType>, statuses: Array<Ref<Status>> }> = []
    for (const p of placements) {
      const tt = taskTypes.find((it) => it._id === p.taskType)
      if (tt === undefined) throw new PlatformError(unknownStatus('No task type found'))
      let list = tt.statuses
      for (const r of resolved) list = p.place(list, r.id)
      overrides.push({ taskTypeId: tt._id, statuses: list.filter((it, i, arr) => arr.indexOf(it) === i) })
    }
    const entryTaskType = overrides[0]?.taskTypeId ?? target.newTaskType
    if (entryTaskType === undefined && target.projectOnly !== true) {
      throw new Error('No task type to attach the statuses to')
    }
    const entries = [...type.statuses]
    for (const r of resolved) {
      if (entryTaskType === undefined) {
        if (!entries.some((it) => it._id === r.id)) {
          const created = options.projectEntry === true ? r.create : undefined
          entries.push({
            _id: r.id,
            ...(created !== undefined
              ? { color: created.color, icon: options.icon, description: created.description }
              : {})
          })
        }
        continue
      }
      const wanted = placements.length > 0 ? (r.reused ? undefined : entryTaskType) : entryTaskType
      if (wanted !== undefined && !entries.some((it) => it._id === r.id && it.taskType === wanted)) {
        const created = options.projectEntry === true ? r.create : undefined
        entries.push({
          _id: r.id,
          ...(created !== undefined
            ? { color: created.color, icon: options.icon, description: created.description }
            : {}),
          taskType: wanted
        })
      }
    }

    const op = client.apply(`task-status:${projectTypeId}`, 'create-status')
    op.match(task.class.ProjectType, { _id: projectTypeId, modifiedOn: type.modifiedOn })
    for (const r of resolved) {
      if (r.create !== undefined) await op.createDoc(statusClass, core.space.Model, r.create, r.id)
    }
    for (const o of overrides) {
      const tt = taskTypes.find((it) => it._id === o.taskTypeId) as TaskType
      await op.update(tt, { statuses: o.statuses })
    }
    await op.update(type, {
      statuses:
        placements.length > 0
          ? calculateStatuses(
              { statuses: entries, tasks: type.tasks },
              new Map(taskTypes.map((it) => [it._id, it])),
              overrides
            )
          : entries
    })
    if ((await op.commit()).result) return resolved.map((r) => ({ id: r.id, reused: r.reused }))
  }
  throw new PlatformError(new PlatformStatus(Severity.ERROR, task.status.StatusesChangedConcurrently, {}))
}

/**
 * One status, see {@link createStatusesAtomic}. No `placements`: the status is only added to the project type.
 * @public
 */
export async function createStatusAtomic (
  client: TxOperations,
  projectTypeId: Ref<ProjectType>,
  statusClass: Ref<Class<Status>>,
  data: Data<Status>,
  placements: StatusPlacement[],
  icon?: ProjectStatus['icon'],
  options: { exclude?: Ref<Status>, retries?: number, delay?: (attempt: number) => Promise<void> } = {}
): Promise<{ id: Ref<Status>, reused: boolean }> {
  const { exclude, ...retry } = options
  const [res] = await createStatusesAtomic(
    client,
    projectTypeId,
    statusClass,
    [{ data, exclude }],
    { placements, projectOnly: placements.length === 0 },
    {
      ...retry,
      icon,
      projectEntry: true
    }
  )
  return res
}

/**
 * @public
 * Inline text of an error: a PlatformError is translated by its status code,
 * any other error gives its message.
 */
export async function getStatusErrorText (err: unknown): Promise<string> {
  if (err instanceof PlatformError) return await translate(err.status.code, err.status.params)
  return err instanceof Error ? err.message : String(err)
}

/**
 * @public
 * The status that survives the merge of same-key statuses, the rule of the duplicate merge migration and of the
 * statuses table: most tasks, then defined by the model, then oldest, then smallest id.
 */
export function chooseMergeTarget (
  members: Array<{ _id: string, tasks: number, system: boolean, createdOn?: number }>
): string {
  const sorted = [...members].sort((a, b) => {
    const diffs = [
      b.tasks - a.tasks,
      Number(b.system) - Number(a.system),
      (a.createdOn ?? Infinity) - (b.createdOn ?? Infinity)
    ]
    return diffs.find((d) => d !== 0 && !Number.isNaN(d)) ?? a._id.localeCompare(b._id)
  })
  return sorted[0]._id
}

/**
 * @public
 * Disambiguation for statuses shown together under one name: for every status whose trimmed, case-insensitive
 * name is shared with another listed status, the name of its project type, or of its project when that type has
 * exactly one project. A status listed by several project types takes the first of them by name. When several
 * statuses of one name get the same label (they come from one project type or project), the names of the task
 * types that list the status are used instead. Statuses with a unique name, or without a project type, get no
 * entry.
 */
export function getStatusNameSuffixes (
  statuses: Status[],
  types: Iterable<Pick<ProjectType, '_id' | 'name' | 'statuses'>>,
  projects: Iterable<Pick<Project, '_id' | 'type' | 'name'>>,
  taskTypes: Iterable<Pick<TaskType, '_id' | 'name' | 'parent' | 'statuses'>> = []
): Map<Ref<Status>, string> {
  const byName = new Map<string, Status[]>()
  for (const s of statuses) {
    const key = s.name.trim().toLowerCase()
    byName.set(key, [...(byName.get(key) ?? []), s])
  }
  const sortedTypes = [...types].sort((a, b) => a.name.localeCompare(b.name))
  const projectsByType = new Map<Ref<ProjectType>, Array<Pick<Project, 'name'>>>()
  for (const p of projects) {
    projectsByType.set(p.type, [...(projectsByType.get(p.type) ?? []), p])
  }
  const taskTypeList = [...taskTypes]
  const result = new Map<Ref<Status>, string>()
  for (const group of byName.values()) {
    const unique = group.filter((it, idx, arr) => arr.findIndex((p) => p._id === it._id) === idx)
    if (unique.length < 2) continue
    const labels = new Map<Ref<Status>, { label: string, type: Ref<ProjectType> }>()
    for (const s of unique) {
      const type = sortedTypes.find((t) => t.statuses.some((it) => it._id === s._id))
      if (type === undefined) continue
      const typeProjects = projectsByType.get(type._id) ?? []
      labels.set(s._id, { label: typeProjects.length === 1 ? typeProjects[0].name : type.name, type: type._id })
    }
    for (const [id, { label, type }] of labels) {
      const clash = [...labels].some(([other, it]) => other !== id && it.label === label)
      const names = taskTypeList
        .filter((tt) => tt.parent === type && tt.statuses.includes(id))
        .map((tt) => tt.name)
        .sort((a, b) => a.localeCompare(b))
      result.set(id, clash && names.length > 0 ? names.join(', ') : label)
    }
  }
  return result
}

/**
 * @public
 * Statuses of the project type a task type can still take: not in the task type and without a status of the same
 * name in it. Grouped by category in `categoryOrder`, empty groups left out; the order inside a group is kept.
 */
export function getExistingStatusOptions (
  projectTypeStatuses: Status[],
  taskTypeStatuses: Status[],
  categoryOrder: ReadonlyArray<Ref<StatusCategory>>
): Array<{ category: Ref<StatusCategory> | undefined, statuses: Status[] }> {
  const taken = new Set(taskTypeStatuses.map((it) => it._id))
  const takenKeys = new Set(taskTypeStatuses.map((it) => statusKey(it.ofAttribute, it.name)))
  const offered = projectTypeStatuses.filter(
    (it, idx, arr) =>
      !taken.has(it._id) &&
      !takenKeys.has(statusKey(it.ofAttribute, it.name)) &&
      arr.findIndex((p) => p._id === it._id) === idx
  )
  const groups = new Map<Ref<StatusCategory> | undefined, Status[]>()
  for (const s of offered) groups.set(s.category, [...(groups.get(s.category) ?? []), s])
  const index = (c: Ref<StatusCategory> | undefined): number => {
    const i = c !== undefined ? categoryOrder.indexOf(c) : -1
    return i >= 0 ? i : categoryOrder.length
  }
  return [...groups].sort((a, b) => index(a[0]) - index(b[0])).map(([category, statuses]) => ({ category, statuses }))
}

/**
 * @public
 * Statuses of the given attributes that no project type and no task type lists, the ones that got left behind
 * when everything that used them was removed.
 */
export function getOrphanStatuses (
  statuses: Iterable<Status>,
  types: Iterable<Pick<ProjectType, 'statuses'>>,
  taskTypes: Iterable<Pick<TaskType, 'statuses'>>,
  attributes: ReadonlySet<Ref<Attribute<Status>>>
): Status[] {
  const used = new Set<Ref<Status>>()
  for (const type of types) {
    for (const it of type.statuses) used.add(it._id)
  }
  for (const taskType of taskTypes) {
    for (const it of taskType.statuses) used.add(it)
  }
  return [...statuses].filter((it) => attributes.has(it.ofAttribute) && !used.has(it._id))
}

/**
 * Groups of statuses sharing a key within one list, only groups with more than one status.
 * @public
 */
export function findDuplicateStatusGroups<T extends StatusLike> (statuses: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const s of statuses) {
    const key = statusKey(s.ofAttribute, s.name)
    groups.set(key, [...(groups.get(key) ?? []), s])
  }
  for (const [key, list] of groups) {
    if (list.length < 2) groups.delete(key)
  }
  return groups
}

/**
 * @public
 */
export function countTasksByStatus (tasks: Array<{ status: Ref<Status> }>): Map<Ref<Status>, number> {
  const counts = new Map<Ref<Status>, number>()
  for (const t of tasks) counts.set(t.status, (counts.get(t.status) ?? 0) + 1)
  return counts
}

/**
 * @public
 */
export function calculateStatuses (
  projectType: { statuses: ProjectType['statuses'], tasks: ProjectType['tasks'] },
  taskTypes: Map<Ref<TaskType>, Data<TaskType>>,
  override: Array<{ taskTypeId: Ref<TaskType>, statuses: Array<Ref<Status>> }>
): ProjectStatus[] {
  const stIds = new Map<Ref<Status>, ProjectStatus>()
  for (const s of projectType.statuses) {
    if (!stIds.has(s._id)) {
      stIds.set(s._id, s)
    }
  }
  const processed = new Set<string>()
  const result: ProjectStatus[] = []

  for (const tt of projectType.tasks) {
    const statusesList = override.find((it) => it.taskTypeId === tt)?.statuses ?? taskTypes.get(tt)?.statuses ?? []
    for (const tts of statusesList) {
      const prjStatus = stIds.get(tts)
      const key = `${tts}:${tt}`
      if (!processed.has(key)) {
        processed.add(key)
        result.push({ ...(prjStatus ?? {}), _id: tts, taskType: tt })
      }
    }
  }
  // A status in no task type stays in the project type, without a task type
  const used = new Set(result.map((it) => it._id))
  for (const [id, entry] of stIds) {
    if (used.has(id)) continue
    const { taskType, ...rest } = entry
    result.push(rest)
  }
  return result
}

/**
 * @public
 */
export function findStatusAttr (h: Hierarchy, _class: Ref<Class<Task>>): AnyAttribute {
  const attrs = h.getAllAttributes(_class)
  for (const it of attrs.values()) {
    if (it.type._class === core.class.RefTo && h.isDerived((it.type as RefTo<any>).to, core.class.Status)) {
      return it
    }
  }
  return h.getAttribute(task.class.Task, 'status')
}

export type TaskTypeWithFactory = Omit<Data<TaskType>, 'statuses' | 'parent' | 'targetClass'> & {
  _id: TaskType['_id']
  factory: Data<Status>[]
} & Partial<Pick<TaskType, 'targetClass'>>

type ProjectData = Omit<Data<ProjectType>, 'statuses' | 'targetClass'>

// `known` holds the statuses of the project type created so far, so task types of one type share them.
// A name that exists in another category gets the category name appended: an import must not fail halfway
// and two statuses with the same name in one project type are confusing.
async function createStates (
  client: TxOperations,
  states: Data<Status>[],
  stateClass: Ref<Class<Status>>,
  known: StatusLike[]
): Promise<Ref<Status>[]> {
  const statuses: Ref<Status>[] = []
  for (const st of states) {
    let data = st
    let reuse = resolveStatusReuse(known, data)
    if (reuse.action === 'conflict') {
      const categoryName = client.getModel().findAllSync(core.class.StatusCategory, { _id: st.category })[0]
      data = { ...st, name: `${st.name.trim()} (${categoryName?.defaultStatusName ?? st.category})` }
      console.warn(`Status "${st.name}" exists in another category, created as "${data.name}"`)
      reuse = resolveStatusReuse(known, data)
    }
    let id: Ref<Status>
    if (reuse.action === 'reuse') {
      id = reuse.status._id
    } else {
      id = await createState(client, stateClass, data)
      known.push({ _id: id, name: data.name, ofAttribute: data.ofAttribute, category: data.category })
    }
    if (!statuses.includes(id)) statuses.push(id)
  }
  return statuses
}

/**
 * Creates the statuses that the project type does not have yet and reserves them in the project type for
 * `taskTypeId`, which the caller creates right after (see {@link createStatusesAtomic}). Returns ids in the
 * order of `states`.
 * @public
 */
export async function createProjectTypeStates (
  client: TxOperations,
  projectTypeId: Ref<ProjectType>,
  states: Data<Status>[],
  stateClass: Ref<Class<Status>>,
  taskTypeId: Ref<TaskType>
): Promise<Ref<Status>[]> {
  const res = await createStatusesAtomic(
    client,
    projectTypeId,
    stateClass,
    states.map((data) => ({ data })),
    { newTaskType: taskTypeId },
    { onConflict: 'rename' }
  )
  return res.map((it) => it.id).filter((it, idx, arr) => arr.indexOf(it) === idx)
}

/**
 * @public
 */
export async function createProjectType (
  client: TxOperations,
  data: ProjectData,
  tasks: TaskTypeWithFactory[],
  _id: Ref<ProjectType>
): Promise<Ref<ProjectType>> {
  const current = await client.findOne(task.class.ProjectType, { _id })
  if (current !== undefined) {
    return current._id
  }

  const _tasks: Ref<TaskType>[] = []
  const tasksData = new Map<Ref<TaskType>, Data<TaskType>>()
  const _statues = new Set<Ref<Status>>()

  const categoryObj = client.getModel().findObject(data.descriptor)
  if (categoryObj === undefined) {
    throw new Error('category is not found in model')
  }

  const known: StatusLike[] = []
  await createTaskTypes(tasks, _id, client, _statues, tasksData, _tasks, async (factory, statusClass) => {
    return await createStates(client, factory, statusClass, known)
  })

  const baseClassClass = client.getHierarchy().getClass(categoryObj.baseClass)

  // NOTE: it is important for this id to be consistent when re-creating the same
  // project type with the same id as it will happen during every migration if type is created by the system
  const targetProjectClassId = `${_id}:type:mixin` as Ref<Class<Doc>>
  const tmpl = await client.createDoc(
    task.class.ProjectType,
    core.space.Model,
    {
      description: data.description,
      shortDescription: data.shortDescription,
      descriptor: data.descriptor,
      roles: 0,
      tasks: _tasks,
      name: data.name,
      statuses: calculateStatuses({ tasks: _tasks, statuses: [] }, tasksData, []),
      targetClass: targetProjectClassId,
      classic: data.classic
    },
    _id
  )

  // Mixin to hold custom fields of this project type
  await client.createDoc(
    core.class.Mixin,
    core.space.Model,
    {
      extends: categoryObj.baseClass,
      kind: ClassifierKind.MIXIN,
      label: getEmbeddedLabel(data.name),
      icon: baseClassClass.icon
    },
    targetProjectClassId
  )

  // TODO: not needed ???
  await client.createMixin(targetProjectClassId, core.class.Mixin, core.space.Model, task.mixin.ProjectTypeClass, {
    projectType: _id
  })

  return tmpl
}

/**
 * Adds a new task type of the descriptor with its default statuses, as the "+" in project type settings does.
 * @public
 */
export async function createDefaultTaskType (
  client: TxOperations,
  projectType: ProjectType,
  descriptorId: Ref<TaskTypeDescriptor>,
  name: string
): Promise<Ref<TaskType> | undefined> {
  const descriptor = client.getModel().findAllSync(task.class.TaskTypeDescriptor, { _id: descriptorId })[0]
  if (descriptor === undefined) return undefined

  const h = client.getHierarchy()
  const ofClass = descriptor.baseClass
  const statusAttr = findStatusAttr(h, ofClass)
  const statusClass = (statusAttr.type as RefTo<Status>).to

  const statusCategories =
    descriptor.statusCategoriesFunc !== undefined
      ? (await getResource(descriptor.statusCategoriesFunc))(projectType)
      : [task.statusCategory.UnStarted, task.statusCategory.Active, task.statusCategory.Won, task.statusCategory.Lost]
  const taskTypeId = generateId<TaskType>()
  let statuses =
    descriptor.defaultStatusesFunc !== undefined ? (await getResource(descriptor.defaultStatusesFunc))(projectType) : []
  // Statuses created here are already reserved in the project type for the new task type
  let reserved = false
  if (statuses.length === 0) {
    const categories = await client.findAll(core.class.StatusCategory, { _id: { $in: statusCategories } })
    const defaults: Array<Data<Status>> = []
    for (const category of statusCategories) {
      const std = categories.find((it) => it._id === category)
      if (std === undefined) continue
      defaults.push({ name: std.defaultStatusName, ofAttribute: statusAttr._id, category })
    }
    statuses = await createProjectTypeStates(client, projectType._id, defaults, statusClass, taskTypeId)
    reserved = true
  }

  const ofClassClass = h.getClass(ofClass)
  // Class for custom fields of the new task type
  const targetClass = await client.createDoc(core.class.Class, core.space.Model, {
    extends: ofClass,
    kind: ClassifierKind.CLASS,
    label: getEmbeddedLabel(name),
    icon: ofClassClass.icon,
    color: ofClassClass.color,
    shortLabel: ofClassClass.shortLabel,
    sortingKey: ofClassClass.sortingKey,
    filteringKey: ofClassClass.filteringKey,
    titleKey: ofClassClass.titleKey
  })
  await client.createMixin(targetClass, core.class.Class, core.space.Model, task.mixin.TaskTypeClass, {
    taskType: taskTypeId,
    projectType: projectType._id
  })

  await client.createDoc(
    task.class.TaskType,
    core.space.Model,
    {
      name,
      descriptor: descriptorId,
      parent: projectType._id,
      ofClass,
      targetClass,
      statuses,
      statusClass,
      statusCategories,
      icon: descriptor.icon,
      isRootTaskType: true,
      allowAnyParent: true,
      allowedAsChildOf: []
    },
    taskTypeId
  )

  // $push, not a rewrite of the lists: concurrent creators of statuses and task types keep their entries
  await client.update(projectType, { $push: { tasks: taskTypeId } })
  if (!reserved) {
    for (const s of statuses.filter((it) => !projectType.statuses.some((p) => p._id === it))) {
      await client.update(projectType, { $push: { statuses: { _id: s, taskType: taskTypeId } } })
    }
  }
  return taskTypeId
}

/**
 * @public
 */
export async function updateProjectType (
  client: TxOperations,
  projectType: Ref<ProjectType>,
  tasks: TaskTypeWithFactory[]
): Promise<void> {
  const current = await client.findOne(task.class.ProjectType, { _id: projectType })
  if (current === undefined) {
    throw new PlatformError(unknownStatus('No project type found'))
  }

  const _tasks: Ref<TaskType>[] = [...current.tasks]
  const tasksData = new Map<Ref<TaskType>, Data<TaskType>>()
  const _statues = new Set<Ref<Status>>()

  // The project type exists: its statuses are created in compare-and-set applies, reserved for the new task type
  const hasUpdates = await createTaskTypes(
    tasks,
    projectType,
    client,
    _statues,
    tasksData,
    _tasks,
    async (factory, statusClass, taskId) =>
      await createProjectTypeStates(client, projectType, factory, statusClass, taskId),
    true
  )

  if (hasUpdates) {
    const ttypes = await client.findAll<TaskType>(task.class.TaskType, { _id: { $in: _tasks } })
    const newStatuses = calculateStatuses(
      {
        statuses: current.statuses,
        tasks: _tasks
      },
      new Map(ttypes.map((it) => [it._id, it])),
      []
    )
    await client.update(current, {
      tasks: _tasks,
      statuses: newStatuses
    })
  }
}

async function createTaskTypes (
  tasks: TaskTypeWithFactory[],
  _id: Ref<ProjectType>,
  client: TxOperations,
  _statues: Set<Ref<Status>>,
  tasksData: Map<Ref<TaskType>, Data<TaskType>>,
  _tasks: Ref<TaskType>[],
  createStatuses: (
    factory: Data<Status>[],
    statusClass: Ref<Class<Status>>,
    taskId: Ref<TaskType>
  ) => Promise<Ref<Status>[]>,
  skipExisting: boolean = false
): Promise<boolean> {
  const existingTaskTypes = await client.findAll(task.class.TaskType, { parent: _id })

  let hasUpdates = false
  for (const it of tasks) {
    const { factory, _id: taskId, ...data } = it

    if (skipExisting) {
      const existingOne = existingTaskTypes.find((tt) => tt.ofClass === data.ofClass)
      if (existingOne !== undefined) {
        // We have similar one, check categories
        continue
      }
    }
    hasUpdates = true

    const statuses = await createStatuses(factory, data.statusClass, taskId)
    for (const st of statuses) {
      _statues.add(st)
    }
    const tdata = {
      isRootTaskType: true,
      allowAnyParent: true,
      allowedAsChildOf: [],
      ...data,
      parent: _id,
      statuses
    }

    const ofClassClass = client.getHierarchy().getClass(data.ofClass)

    tdata.icon = ofClassClass.icon

    if (tdata.targetClass === undefined) {
      // Create target class for custom field.
      // NOTE: it is important for this id to be consistent when re-creating the same
      // task type with the same id as it will happen during every migration if type is created by the system
      const targetClassId = `${taskId}:type:mixin` as Ref<Class<Task>>
      tdata.targetClass = targetClassId

      await client.createDoc(
        core.class.Class,
        core.space.Model,
        {
          extends: data.ofClass,
          kind: ClassifierKind.CLASS,
          label: ofClassClass.label,
          icon: ofClassClass.icon,
          color: ofClassClass.color,
          shortLabel: ofClassClass.shortLabel,
          sortingKey: ofClassClass.sortingKey,
          filteringKey: ofClassClass.filteringKey,
          titleKey: ofClassClass.titleKey
        },
        targetClassId
      )

      await client.createMixin(targetClassId, core.class.Class, core.space.Model, task.mixin.TaskTypeClass, {
        taskType: taskId,
        projectType: _id
      })
    }
    await client.createDoc(task.class.TaskType, core.space.Model, tdata as Data<TaskType>, taskId)
    tasksData.set(taskId, tdata as Data<TaskType>)
    _tasks.push(taskId)
  }
  return hasUpdates
}

/**
 * Returns allowed subtask types for a given parent task type in a project type.
 *
 * @public
 */
export function getAllowedChildTaskTypes (
  projectType: Ref<ProjectType>,
  taskType: Ref<TaskType>,
  taskTypes: TaskType[]
): TaskType[] {
  const scopedTypes = taskTypes.filter((t) => t.parent === projectType)

  return scopedTypes.filter((tt) => {
    return tt.allowAnyParent === true || (tt.allowedAsChildOf ?? []).includes(taskType)
  })
}

/**
 * Returns allowed parent task types for a given child task type in a project type.
 *
 * @public
 */
export function getAllowedParentTaskTypes (
  projectType: Ref<ProjectType>,
  taskType: Ref<TaskType>,
  taskTypes: TaskType[]
): TaskType[] {
  const scopedTypes = taskTypes.filter((t) => t.parent === projectType)
  const childTaskType = scopedTypes.find((t) => t._id === taskType)

  if (childTaskType == null) {
    return []
  }

  if (childTaskType.allowAnyParent === true) {
    return scopedTypes
  }

  const allowedParents = childTaskType.allowedAsChildOf ?? []
  return scopedTypes.filter((parentTT) => allowedParents.includes(parentTT._id))
}

/**
 * Returns task types allowed to be created as root tasks in a project type.
 *
 * @public
 */
export function getRootTaskTypes (projectType: Ref<ProjectType>, taskTypes: TaskType[]): TaskType[] {
  return taskTypes.filter((t) => t.parent === projectType && t.isRootTaskType !== false)
}
