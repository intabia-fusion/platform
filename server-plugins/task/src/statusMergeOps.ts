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

import core, { SortingOrder, type Class, type Doc, type Ref, type Status, type TxOperations } from '@hcengineering/core'
import task, {
  addStatusTarget,
  addTargetStatusEntries,
  checkStatusMerge,
  mapStatusId,
  mapStatusIds,
  mapStatusOrder,
  mergeProjectStatusEntries,
  replaceStatusIdsInJson,
  rewriteRuleStatuses,
  rewriteStatusAttributeUpdates,
  statusIdsInAttributeUpdates,
  type MergeStatusesParams,
  type MergeStatusesResult,
  type ProjectType,
  type StatusAttributeUpdates,
  type StatusUsageParams,
  type StatusUsageResult,
  type TaskType
} from '@hcengineering/task'
import workflow, { getTransitionConflict, hasSelfTransition, type WorkflowTransition } from '@hcengineering/workflow'

const docUpdateMessage = 'activity:class:DocUpdateMessage' as Ref<Class<Doc>>
const filteredView = 'view:class:FilteredView' as Ref<Class<Doc>>
const workflowClass = 'workflow:class:Workflow' as Ref<Class<Doc>>
const transitionClass = 'workflow:class:WorkflowTransition' as Ref<Class<Doc>>
const projectWorkflowMixin = 'workflow:mixin:ProjectWorkflow' as Ref<Class<Doc>>

// Every tx of the merge carries it: the notification service skips such txes.
const silent = { silent: true }

const historyPage = 1000

export interface MergeEnv {
  // Writes may be buffered by the caller; flush makes them visible to the reads that follow.
  client: TxOperations
  // Same writer with derived txes, used for tasks and projects: activity and webhook skip those.
  derived?: TxOperations
  flush: () => Promise<void>
}

type Conflict = MergeStatusesResult['conflicts'][number]

const idsOf = (v: any): string[] => (Array.isArray(v) ? (v as string[]) : typeof v === 'string' ? [v] : [])

const isId = (v: unknown): v is string => typeof v === 'string' && v !== ''
const isIds = (v: unknown): v is string[] => Array.isArray(v) && v.every(isId)
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function refused (conflicts: Conflict[]): MergeStatusesResult {
  return { ok: false, merged: [], tasksMoved: 0, removed: [], kept: [], conflicts }
}

/**
 * Trust boundary check: an object in place of an id would reach the queries as an operator.
 * Returns the reason, or undefined for a good request.
 */
export function checkMergeParams (params: unknown): string | undefined {
  if (!isObject(params)) return 'params must be an object'
  if (!isId(params.projectType) || !isId(params.target)) return 'projectType and target must be non-empty strings'
  if (!isIds(params.sources) || params.sources.length === 0) return 'sources must be a non-empty array of strings'
  if (params.transfer !== undefined && typeof params.transfer !== 'boolean') return 'transfer must be a boolean'
  if (params.taskTypes !== undefined && (!isIds(params.taskTypes) || params.taskTypes.length === 0)) {
    return 'taskTypes must be a non-empty array of strings'
  }
}

export function checkUsageParams (params: unknown): string | undefined {
  if (!isObject(params)) return 'params must be an object'
  if (!isId(params.projectType) || !isId(params.status)) return 'projectType and status must be non-empty strings'
}

async function loadProjectType (
  client: TxOperations,
  id: Ref<ProjectType>
): Promise<{ projectType: ProjectType, taskTypes: TaskType[] } | undefined> {
  const found = (await client.findAll<ProjectType>(task.class.ProjectType, { _id: id }))[0]
  if (found === undefined) return undefined
  // The lookup middleware drops query fields (here _id) from the returned docs,
  // and a tx needs the id.
  const projectType: ProjectType = { ...found, _id: id }
  const taskTypes = await client.findAll<TaskType>(task.class.TaskType, { _id: { $in: projectType.tasks } })
  return { projectType, taskTypes }
}

/**
 * Merges statuses of one project type into the target. Everything is checked against the planned
 * state with the workflow rules first; when anything would be rejected nothing is written. Writes
 * carry meta.silent and keep modifiedOn of tasks; the model documents get a fresh modifiedOn on
 * purpose, concurrent status creation compares it. The sources leave the lists last: a failed run
 * is finished by running the merge again.
 */
export async function mergeStatuses (env: MergeEnv, params: MergeStatusesParams): Promise<MergeStatusesResult> {
  const { client } = env
  const derived = env.derived ?? client
  const h = client.getHierarchy()

  const loaded = await loadProjectType(client, params.projectType)
  if (loaded === undefined) return refused([{ kind: 'conflict', message: 'project type not found' }])
  const { projectType, taskTypes } = loaded
  const scope = params.taskTypes === undefined ? undefined : new Set<string>(params.taskTypes)
  const foreign = [...(scope ?? [])].filter((id) => !projectType.tasks.includes(id as Ref<TaskType>))
  if (foreign.length > 0) {
    return refused([{ kind: 'conflict', message: `not task types of the project type: ${foreign.join(', ')}` }])
  }
  const inScope = (kind: string | undefined): boolean => scope === undefined || scope.has(kind as string)
  const statusDocs = await client.findAll(core.class.Status, {})
  const statuses = new Map(statusDocs.map((s) => [s._id as string, s]))
  const inProjectType = new Set<string>([
    ...taskTypes.flatMap((tt) => tt.statuses),
    ...projectType.statuses.map((s) => s._id)
  ])

  const check = checkStatusMerge(
    { target: params.target, sources: params.sources, transfer: params.transfer },
    statuses,
    inProjectType
  )
  if (check.errors.length > 0) return refused(check.errors.map((message) => ({ kind: 'conflict', message })))
  const sources = check.sources
  if (sources.length === 0) return { ok: true, merged: [], tasksMoved: 0, removed: [], kept: [], conflicts: [] }

  const map = new Map(sources.map((s) => [s, params.target as string]))
  const ids = new Set(sources)

  // Only the tasks of the covered task types that sit in a source status are read
  const kinds = taskTypes.map((tt) => tt._id).filter(inScope)
  const tasks =
    kinds.length === 0
      ? []
      : await client.findAll(task.class.Task, { kind: { $in: kinds }, status: { $in: sources as Array<Ref<Status>> } })
  const projects = await client.findAll(task.class.Project, { type: projectType._id })
  const workflows = h.hasClass(workflowClass)
    ? await client.findAll(workflowClass, { projectType: projectType._id } as any)
    : []
  const transitions: WorkflowTransition[] =
    h.hasClass(transitionClass) && workflows.length > 0
      ? ((await client.findAll(transitionClass, { attachedTo: { $in: workflows.map((w) => w._id) } } as any)) as any)
      : []
  const scoped = new Set(workflows.filter((w) => inScope((w as any).taskType)).map((w) => w._id as string))

  const planned = planTransitions(transitions, map, (workflowId) => scoped.has(workflowId))
  const conflicts = [...planned.conflicts, ...checkTaskMoves(h, tasks, projects, planned.byWorkflow, map)]
  if (conflicts.length > 0) return refused(conflicts)
  const rules = planRules(transitions, map, scope)

  // 1. The target joins every list that has a source. Nothing leaves yet: until step 6 a failed
  // run still finds its sources in the project type, so running the merge again finishes it.
  for (const tt of taskTypes) {
    const next = inScope(tt._id) ? addStatusTarget(tt.statuses, map) : tt.statuses
    if (next !== tt.statuses) await client.update(tt, { statuses: next } as any, false, undefined, undefined, silent)
  }
  const entries = addTargetStatusEntries(projectType.statuses as any, map, scope)
  if (entries !== (projectType.statuses as any)) {
    await client.update(projectType, { statuses: entries } as any, false, undefined, undefined, silent)
  }
  await env.flush()

  // 2. Workflows. Rules that name statuses list the target next to the sources until step 6, so
  // a task that has not moved yet still passes the rule of a transition its neighbour has taken.
  for (const w of workflows) {
    const initial = idsOf((w as any).initialStatuses)
    if (scoped.has(w._id) && initial.some((id) => ids.has(id))) {
      await client.update(
        w,
        { initialStatuses: mapStatusIds(initial, map) } as any,
        false,
        w.modifiedOn,
        w.modifiedBy,
        silent
      )
    }
  }
  const transitionById = new Map(transitions.map((t) => [t._id as string, t]))
  const rewritten = new Set<string>()
  for (const t of planned.changed) {
    rewritten.add(t.original._id)
    const validators = rules.get(t.original._id)?.extended
    await client.update(
      t.original as any,
      { to: t.to, from: t.from, ...(validators !== undefined ? { validators } : {}) } as any,
      false,
      t.original.modifiedOn,
      t.original.modifiedBy,
      silent
    )
  }
  for (const [id, rule] of rules) {
    const t = transitionById.get(id) as WorkflowTransition
    if (rule.extended !== undefined && !rewritten.has(id)) {
      await client.update(t as any, { validators: rule.extended } as any, false, t.modifiedOn, t.modifiedBy, silent)
    }
  }
  await env.flush()

  // 3. Tasks, modifiedOn and modifiedBy stay. Derived txes: no "status changed" message per task.
  let done = 0
  for (const t of tasks) {
    await derived.update(
      t,
      { status: mapStatusId((t as any).status, map) } as any,
      false,
      t.modifiedOn,
      t.modifiedBy,
      silent
    )
    if (++done % 200 === 0) await env.flush()
  }
  await env.flush()

  // 4. Default status of the projects, unless a task type outside the scope still lists the source
  const listedOutside = (id: string): boolean =>
    taskTypes.some((tt) => !inScope(tt._id) && (tt.statuses as string[]).includes(id))
  for (const p of projects) {
    const current = (p as any).defaultIssueStatus
    if (typeof current === 'string' && ids.has(current) && !listedOutside(current)) {
      await derived.update(
        p,
        { defaultIssueStatus: mapStatusId(current, map) } as any,
        false,
        p.modifiedOn,
        p.modifiedBy,
        silent
      )
    }
  }

  // 5. History: status messages of the moved tasks if scoped, of the whole projects otherwise
  const hasHistory = h.hasClass(docUpdateMessage)
  const base = { action: 'update', 'attributeUpdates.attrKey': 'status' }
  const queries: any[] = []
  if (hasHistory && scope === undefined) {
    queries.push({ ...base, space: { $in: projects.map((p) => p._id) } })
  } else if (hasHistory) {
    for (let i = 0; i < tasks.length; i += 100) {
      queries.push({ ...base, attachedTo: { $in: tasks.slice(i, i + 100).map((t) => t._id) } })
    }
  }
  for (const query of queries) {
    let last: string | undefined
    for (;;) {
      // Every status change of every task has a message: read them by pages of _id
      const page = await client.findAll(
        docUpdateMessage,
        { ...query, ...(last === undefined ? {} : { _id: { $gt: last } }) } as any,
        { limit: historyPage, sort: { _id: SortingOrder.Ascending } }
      )
      // The SQL adapter ignores operators on nested arrays, so ids are checked in memory.
      const stale = page.filter((m) =>
        statusIdsInAttributeUpdates((m as any).attributeUpdates ?? {}).some((id) => ids.has(id))
      )
      for (const m of stale) {
        const au = (m as any).attributeUpdates as StatusAttributeUpdates
        await client.update(
          m,
          { attributeUpdates: rewriteStatusAttributeUpdates(au, map) } as any,
          false,
          m.modifiedOn,
          m.modifiedBy,
          silent
        )
      }
      if (page.length < historyPage) break
      last = page[page.length - 1]._id
      await env.flush()
    }
  }
  await env.flush()

  // 6. Only now the sources leave the lists and the order. Read again: the model may have been
  // edited while the tasks moved.
  const fresh = (await loadProjectType(client, params.projectType)) ?? loaded
  for (const tt of fresh.taskTypes) {
    if (inScope(tt._id) && tt.statuses.some((id) => ids.has(id))) {
      await client.update(tt, { statuses: mapStatusIds(tt.statuses, map) } as any, false, undefined, undefined, silent)
    }
  }
  for (const [id, rule] of rules) {
    const t = transitionById.get(id) as WorkflowTransition
    if (rule.replaced !== undefined) {
      await client.update(t as any, { validators: rule.replaced } as any, false, t.modifiedOn, t.modifiedBy, silent)
    }
  }
  const current = fresh.projectType
  const statusesNow = mergeProjectStatusEntries(current.statuses as any, map, scope)
  const stay = new Set(
    sources.filter((id) => fresh.taskTypes.some((tt) => !inScope(tt._id) && (tt.statuses as string[]).includes(id)))
  )
  const orderNow = current.statusOrder === undefined ? undefined : mapStatusOrder(current.statusOrder, map, stay)
  const patch = {
    ...(JSON.stringify(statusesNow) !== JSON.stringify(current.statuses) ? { statuses: statusesNow } : {}),
    ...(orderNow !== undefined && JSON.stringify(orderNow) !== JSON.stringify(current.statusOrder)
      ? { statusOrder: orderNow }
      : {})
  }
  if (Object.keys(patch).length > 0) {
    await client.update(current, patch as any, false, undefined, undefined, silent)
  }
  await env.flush()

  // 7. Sources go only when nothing refers to them any more
  const { removable, kept } = await splitReferenced(env, sources)

  // Saved filters carry global ids: rewritten only for statuses that disappear
  if (removable.length > 0 && h.hasClass(filteredView)) {
    const removeMap = new Map(removable.map((id) => [id, params.target as string]))
    for (const v of await client.findAll(filteredView, {})) {
      const filters = String((v as any).filters ?? '')
      const next = replaceStatusIdsInJson(filters, removeMap)
      if (next !== filters) await client.update(v, { filters: next } as any, false, v.modifiedOn, v.modifiedBy, silent)
    }
  }
  for (const id of removable) {
    const s = statuses.get(id)
    if (s !== undefined) await client.remove(s, undefined, undefined, silent)
  }
  await env.flush()

  return {
    ok: true,
    merged: sources as Array<Ref<Status>>,
    tasksMoved: tasks.length,
    removed: removable as Array<Ref<Status>>,
    kept: kept as Array<Ref<Status>>,
    conflicts: []
  }
}

interface PlannedTransition {
  original: WorkflowTransition
  to: string
  from: string[] | null | undefined
}

// Replays the transition edits one by one on a copy, the way the workflow middleware checks them.
// Transitions of the workflows that `covered` rejects stay as they are.
function planTransitions (
  transitions: WorkflowTransition[],
  map: Map<string, string>,
  covered: (workflowId: string) => boolean
): {
    changed: PlannedTransition[]
    byWorkflow: Map<string, Array<{ from: string[] | null, to: string }>>
    conflicts: Conflict[]
  } {
  const conflicts: Conflict[] = []
  const changed: PlannedTransition[] = []
  const state = new Map<string, WorkflowTransition[]>()
  for (const t of transitions) state.set(t.attachedTo, [...(state.get(t.attachedTo) ?? []), { ...t }])

  const ordered = [...transitions].sort((a, b) => {
    const byRank = String(a.rank).localeCompare(String(b.rank))
    return byRank !== 0 ? byRank : a._id.localeCompare(b._id)
  })
  for (const original of ordered) {
    if (!covered(original.attachedTo)) continue
    const to = mapStatusId(original.to, map)
    const from = Array.isArray(original.from) ? mapStatusIds(original.from, map) : original.from
    const same =
      to === original.to &&
      (!Array.isArray(from) ||
        (from.length === original.from?.length && from.every((id, i) => id === original.from?.[i])))
    if (same) continue
    const updated: WorkflowTransition = { ...original, to: to as Ref<Status>, from: from as any }
    const list = state.get(original.attachedTo) ?? []
    if (hasSelfTransition(updated)) {
      conflicts.push({
        kind: 'self',
        workflow: original.attachedTo,
        transition: original._id,
        names: [original.name],
        message: `transition "${original.name}" would lead from a status to itself`
      })
    } else {
      const conflict = getTransitionConflict(updated, list)
      if (conflict != null) {
        conflicts.push({
          kind: 'conflict',
          workflow: original.attachedTo,
          transition: original._id,
          names: [original.name, conflict.transition.name],
          message: `transition "${original.name}" would clash with "${conflict.transition.name}"`
        })
      }
    }
    state.set(
      original.attachedTo,
      list.map((t) => (t._id === original._id ? updated : t))
    )
    changed.push({ original, to, from })
  }
  const byWorkflow = new Map<string, Array<{ from: string[] | null, to: string }>>()
  for (const [wf, list] of state) byWorkflow.set(wf, list as any)
  return { changed, byWorkflow, conflicts }
}

type Validators = NonNullable<WorkflowTransition['validators']>

const isStatusRule = (rule: unknown): boolean =>
  rule === workflow.validator.SubtaskStatus || rule === workflow.validator.ParentStatus

function ruleStatusIds (t: WorkflowTransition): string[] {
  return (t.validators ?? []).flatMap((v) => {
    const statuses = v.props?.statuses
    return isStatusRule(v.rule) && isObject(statuses) ? Object.values(statuses).flatMap(idsOf) : []
  })
}

// `undefined` when no subtask or parent status rule of `validators` changes
function rewriteValidators (
  validators: Validators,
  rewrite: (ids: string[]) => string[],
  scope?: Set<string>
): Validators | undefined {
  let changed = false
  const next = validators.map((v) => {
    const statuses = v.props?.statuses
    if (!isStatusRule(v.rule) || !isObject(statuses)) return v
    const props = rewriteRuleStatuses(statuses as Record<string, string[] | null>, rewrite, scope)
    if (JSON.stringify(props) === JSON.stringify(statuses)) return v
    changed = true
    return { ...v, props: { ...v.props, statuses: props } } as any
  })
  return changed ? next : undefined
}

interface RulePlan {
  // Target next to the sources, written before the tasks move
  extended?: Validators
  // Sources replaced, written once they are gone from the lists
  replaced?: Validators
}

// Rules of every workflow of the project type: they name statuses of the task types they check.
function planRules (
  transitions: WorkflowTransition[],
  map: Map<string, string>,
  scope?: Set<string>
): Map<string, RulePlan> {
  const plan = new Map<string, RulePlan>()
  for (const t of transitions) {
    const validators = t.validators ?? []
    const extended = rewriteValidators(validators, (ids) => addStatusTarget(ids, map), scope)
    const replaced = rewriteValidators(validators, (ids) => mapStatusIds(ids, map), scope)
    if (extended !== undefined || replaced !== undefined) plan.set(t._id, { extended, replaced })
  }
  return plan
}

// The rule of WorkflowMiddleware.validateTaskUpdate for a status change, on the planned transitions.
function checkTaskMoves (
  h: ReturnType<TxOperations['getHierarchy']>,
  tasks: Doc[],
  projects: Doc[],
  byWorkflow: Map<string, Array<{ from: string[] | null, to: string }>>,
  map: Map<string, string>
): Conflict[] {
  const conflicts: Conflict[] = []
  if (!h.hasClass(projectWorkflowMixin)) return conflicts
  const projectById = new Map(projects.map((p) => [p._id as string, p]))
  const seen = new Set<string>()
  for (const t of tasks) {
    const project = projectById.get(t.space)
    if (project === undefined || !h.hasMixin(project, projectWorkflowMixin as any)) continue
    const workflows = (h.as(project, projectWorkflowMixin as any) as any).workflows as
      | Record<string, string>
      | undefined
    const wfId = workflows?.[(t as any).kind]
    if (wfId === undefined) continue
    const from = (t as any).status as string
    const to = mapStatusId(from, map)
    if (from === to) continue
    const allowed = (byWorkflow.get(wfId) ?? []).filter(
      (tr) => (tr.from == null || tr.from.length === 0 || tr.from.includes(from)) && tr.to === to
    )
    const ok =
      allowed.some((tr) => tr.from?.includes(from) === true) ||
      allowed.some((tr) => tr.from == null || tr.from.length === 0)
    const key = `${wfId}:${from}`
    if (!ok && !seen.has(key)) {
      seen.add(key)
      conflicts.push({
        kind: 'forbiddenTask',
        workflow: wfId as Ref<Doc>,
        task: t._id,
        statuses: [from, to],
        message: `tasks in status ${from} could not move to ${to}: the workflow has no such transition`
      })
    }
  }
  return conflicts
}

// Runs after the lists were rewritten, so whatever still lists or names a source keeps it:
// another project type, a task type outside the scope, a rule.
async function splitReferenced (env: MergeEnv, sources: string[]): Promise<{ removable: string[], kept: string[] }> {
  const { client } = env
  const h = client.getHierarchy()
  const taskTypes = await client.findAll<TaskType>(task.class.TaskType, {})
  const projectTypes = await client.findAll<ProjectType>(task.class.ProjectType, {})
  const transitionRefs = new Set<string>()
  if (h.hasClass(transitionClass)) {
    for (const t of (await client.findAll(transitionClass, {} as any)) as unknown as WorkflowTransition[]) {
      for (const id of [...idsOf(t.to), ...idsOf(t.from), ...ruleStatusIds(t)]) transitionRefs.add(id)
    }
  }
  const removable: string[] = []
  const kept: string[] = []
  for (const src of sources) {
    // Statuses defined by the model have ids like 'tracker:status:Done' and model code may still refer to them.
    const used =
      src.includes(':') ||
      taskTypes.some((tt) => (tt.statuses as string[]).includes(src)) ||
      projectTypes.some((pt) => pt.statuses.some((s) => s._id === src)) ||
      transitionRefs.has(src) ||
      (await client.findOne(task.class.Task, { status: src as Ref<Status> })) !== undefined
    if (used) kept.push(src)
    else removable.push(src)
  }
  return { removable, kept }
}

/**
 * Usage counts; `count` returns the total of a query run as the system account.
 */
export async function countStatusUsage (
  count: (_class: Ref<Class<Doc>>, query: Record<string, unknown>) => Promise<number>,
  projectType: ProjectType,
  { status }: Pick<StatusUsageParams, 'status'>
): Promise<StatusUsageResult> {
  const byKind: Record<string, number> = {}
  for (const kind of projectType.tasks) byKind[kind] = await count(task.class.Task, { status, kind })
  return {
    tasks: await count(task.class.Task, { status }),
    byKind,
    projects: await count(task.class.Project, { type: projectType._id, defaultIssueStatus: status })
  }
}
