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

import core, { type Class, type Doc, type Ref, type Status, type TxOperations } from '@hcengineering/core'
import task, {
  checkStatusMerge,
  mapStatusId,
  mapStatusIds,
  mergeProjectStatusEntries,
  replaceStatusIdsInJson,
  rewriteStatusAttributeUpdates,
  statusIdsInAttributeUpdates,
  type MergeStatusesParams,
  type MergeStatusesResult,
  type ProjectType,
  type StatusAttributeUpdates,
  type TaskType
} from '@hcengineering/task'
import { getTransitionConflict, hasSelfTransition, type WorkflowTransition } from '@hcengineering/workflow'

const docUpdateMessage = 'activity:class:DocUpdateMessage' as Ref<Class<Doc>>
const filteredView = 'view:class:FilteredView' as Ref<Class<Doc>>
const workflowClass = 'workflow:class:Workflow' as Ref<Class<Doc>>
const transitionClass = 'workflow:class:WorkflowTransition' as Ref<Class<Doc>>
const projectWorkflowMixin = 'workflow:mixin:ProjectWorkflow' as Ref<Class<Doc>>

// Every tx of the merge carries it: the notification and activity services skip such txes.
const silent = { silent: true }

export interface MergeEnv {
  // Writes may be buffered by the caller; flush makes them visible to the reads that follow.
  client: TxOperations
  flush: () => Promise<void>
}

type Conflict = MergeStatusesResult['conflicts'][number]

const idsOf = (v: any): string[] => (Array.isArray(v) ? (v as string[]) : typeof v === 'string' ? [v] : [])

function refused (conflicts: Conflict[]): MergeStatusesResult {
  return { ok: false, merged: [], tasksMoved: 0, removed: [], kept: [], conflicts }
}

/**
 * Merges statuses of one project type into the target. Everything is checked against the planned state with
 * the workflow rules first; when anything would be rejected nothing is written. Writes carry meta.silent
 * and keep modifiedOn of tasks; the model documents get a fresh modifiedOn on purpose, concurrent status
 * creation compares it.
 */
export async function mergeStatuses (env: MergeEnv, params: MergeStatusesParams): Promise<MergeStatusesResult> {
  const { client } = env
  const h = client.getHierarchy()

  const found = (await client.findAll<ProjectType>(task.class.ProjectType, { _id: params.projectType }))[0]
  if (found === undefined) return refused([{ kind: 'conflict', message: 'project type not found' }])
  // The lookup middleware drops query fields (here _id) from the returned docs, and a tx needs the id.
  const projectType: ProjectType = { ...found, _id: params.projectType }
  const taskTypes = await client.findAll<TaskType>(task.class.TaskType, { _id: { $in: projectType.tasks } })
  const kinds = taskTypes.map((tt) => tt._id)
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

  const allTasks = await client.findAll(task.class.Task, { kind: { $in: kinds } })
  const tasks = allTasks.filter((t) => ids.has((t as any).status))
  const projects = await client.findAll(task.class.Project, { type: projectType._id })
  const workflows = h.hasClass(workflowClass)
    ? await client.findAll(workflowClass, { projectType: projectType._id } as any)
    : []
  const transitions: WorkflowTransition[] =
    h.hasClass(transitionClass) && workflows.length > 0
      ? ((await client.findAll(transitionClass, { attachedTo: { $in: workflows.map((w) => w._id) } } as any)) as any)
      : []

  const planned = planTransitions(transitions, map)
  const conflicts = [...planned.conflicts, ...checkTaskMoves(h, tasks, projects, planned.byWorkflow, map)]
  if (conflicts.length > 0) return refused(conflicts)

  // 1. workflows
  for (const w of workflows) {
    const initial = idsOf((w as any).initialStatuses)
    if (initial.some((id) => ids.has(id))) {
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
  for (const t of planned.changed) {
    await client.update(
      t.original as any,
      { to: t.to, from: t.from } as any,
      false,
      t.original.modifiedOn,
      t.original.modifiedBy,
      silent
    )
  }
  await env.flush()

  // 2. task types and the project type
  for (const tt of taskTypes) {
    if (tt.statuses.some((id) => ids.has(id))) {
      await client.update(tt, { statuses: mapStatusIds(tt.statuses, map) } as any, false, undefined, undefined, silent)
    }
  }
  const order = projectType.statusOrder
  const statusesChanged = projectType.statuses.some((s) => ids.has(s._id))
  const orderChanged = order?.some((id) => ids.has(id)) === true
  if (statusesChanged || orderChanged) {
    await client.update(
      projectType,
      {
        ...(statusesChanged ? { statuses: mergeProjectStatusEntries(projectType.statuses as any, map) } : {}),
        ...(orderChanged && order !== undefined ? { statusOrder: mapStatusIds(order, map) } : {})
      } as any,
      false,
      undefined,
      undefined,
      silent
    )
  }
  await env.flush()

  // 3. tasks, modifiedOn and modifiedBy stay
  let done = 0
  for (const t of tasks) {
    await client.update(
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

  // 4. default status of the projects
  for (const p of projects) {
    const current = (p as any).defaultIssueStatus
    if (typeof current === 'string' && ids.has(current)) {
      await client.update(
        p,
        { defaultIssueStatus: mapStatusId(current, map) } as any,
        false,
        p.modifiedOn,
        p.modifiedBy,
        silent
      )
    }
  }

  // 5. history of the project
  if (h.hasClass(docUpdateMessage)) {
    // The SQL adapter ignores operators on nested arrays, so ids are checked in memory.
    const messages = await client.findAll(docUpdateMessage, {
      action: 'update',
      space: { $in: projects.map((p) => p._id) }
    } as any)
    for (const m of messages) {
      const au = (m as any).attributeUpdates as StatusAttributeUpdates | undefined
      if (au === undefined || !statusIdsInAttributeUpdates(au).some((id) => ids.has(id))) continue
      await client.update(
        m,
        { attributeUpdates: rewriteStatusAttributeUpdates(au, map) } as any,
        false,
        m.modifiedOn,
        m.modifiedBy,
        silent
      )
    }
  }
  await env.flush()

  // 6. sources go only when nothing refers to them any more
  const { removable, kept } = await splitReferenced(env, sources, taskTypes, projectType)

  // 7. saved filters carry global ids: rewritten only for statuses that disappear
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
function planTransitions (
  transitions: WorkflowTransition[],
  map: Map<string, string>
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

async function splitReferenced (
  env: MergeEnv,
  sources: string[],
  taskTypes: TaskType[],
  projectType: ProjectType
): Promise<{ removable: string[], kept: string[] }> {
  const { client } = env
  const h = client.getHierarchy()
  const otherTaskTypes = (await client.findAll<TaskType>(task.class.TaskType, {})).filter(
    (tt) => !taskTypes.some((it) => it._id === tt._id)
  )
  const otherProjectTypes = (await client.findAll<ProjectType>(task.class.ProjectType, {})).filter(
    (pt) => pt._id !== projectType._id
  )
  const transitionRefs = new Set<string>()
  if (h.hasClass(transitionClass)) {
    for (const t of await client.findAll(transitionClass, {} as any)) {
      for (const id of [...idsOf((t as any).to), ...idsOf((t as any).from)]) transitionRefs.add(id)
    }
  }
  const removable: string[] = []
  const kept: string[] = []
  for (const src of sources) {
    // Statuses defined by the model have ids like 'tracker:status:Done' and model code may still refer to them.
    const used =
      src.includes(':') ||
      otherTaskTypes.some((tt) => (tt.statuses as string[]).includes(src)) ||
      otherProjectTypes.some((pt) => pt.statuses.some((s) => s._id === src)) ||
      transitionRefs.has(src) ||
      (await client.findOne(task.class.Task, { status: src as Ref<Status> })) !== undefined
    if (used) kept.push(src)
    else removable.push(src)
  }
  return { removable, kept }
}
