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

import core, { type Class, type Data, type Ref, type Status, type TxOperations } from '@hcengineering/core'
import task, {
  calculateStatuses,
  createStatusAtomic,
  placeStatusAfter,
  type MergeStatusesParams,
  type MergeStatusesResult,
  type ProjectStatus,
  type ProjectType,
  type StatusUsageParams,
  type StatusUsageResult,
  type TaskType
} from '@hcengineering/task'
import { countStatusTasks } from './statusMergeApi'
import { loadWorkflowUsage } from './statusUsage'

/**
 * @public
 */
export interface StatusRename {
  type: Ref<ProjectType>
  // The status that gets replaced
  status: Ref<Status>
  statusClass: Ref<Class<Status>>
  data: Data<Status>
  icon?: ProjectStatus['icon']
  // The task types that take the new status in place of the old one
  taskTypes: Array<Ref<TaskType>>
}

/**
 * @public
 */
export interface StatusRequests {
  merge: (params: MergeStatusesParams) => Promise<MergeStatusesResult>
  usage: (params: StatusUsageParams) => Promise<StatusUsageResult>
}

/**
 * @public
 */
export type StatusRenameResult =
  | { ok: true, id: Ref<Status> }
  | { ok: false, conflicts: MergeStatusesResult['conflicts'] }

/**
 * Renames a status that cannot change in place: the new one goes right after the old one,
 * the server merge moves everything over. A refusal takes the new one out again.
 * @public
 */
export async function renameStatusByMerge (
  client: TxOperations,
  requests: StatusRequests,
  rename: StatusRename
): Promise<StatusRenameResult> {
  const placements = rename.taskTypes.map((taskType) => ({
    taskType,
    place: (list: Array<Ref<Status>>, id: Ref<Status>) => placeStatusAfter(list, rename.status, id)
  }))
  const { id, reused } = await createStatusAtomic(
    client,
    rename.type,
    rename.statusClass,
    rename.data,
    placements,
    rename.icon,
    { exclude: rename.status }
  )
  const res = await requests.merge({
    projectType: rename.type,
    target: id,
    sources: [rename.status],
    taskTypes: rename.taskTypes
  })
  if (res.ok) return { ok: true, id }
  await undoPlacement(client, requests, rename, id, !reused)
  return { ok: false, conflicts: res.conflicts }
}

// Undo only if the merge wrote nothing. After a partial failure the new status is in use or
// the old one is gone from a task type: the placement stays, saving again finishes the merge.
async function undoPlacement (
  client: TxOperations,
  requests: StatusRequests,
  rename: StatusRename,
  id: Ref<Status>,
  created: boolean
): Promise<void> {
  const usage = await requests.usage({ projectType: rename.type, status: id }).catch(() => undefined)
  if (usage === undefined) return
  // A reused status keeps its tasks in other task types, which the merge does not move,
  // and may already be a project default
  if (countStatusTasks(usage, rename.taskTypes) > 0 || (created && usage.projects > 0)) return
  const type = await client.findOne(task.class.ProjectType, { _id: rename.type })
  if (type === undefined) return
  const taskTypes = await client.findAll(task.class.TaskType, { _id: { $in: type.tasks } })
  const targets = taskTypes.filter((it) => rename.taskTypes.includes(it._id))
  if (targets.some((it) => !it.statuses.includes(rename.status))) return
  if ((await loadWorkflowUsage(client, rename.type, taskTypes)).has(id)) return

  const left = new Map<Ref<TaskType>, TaskType>(taskTypes.map((it) => [it._id, it]))
  for (const tt of targets) {
    const statuses = tt.statuses.filter((it) => it !== id)
    await client.update(tt, { statuses })
    left.set(tt._id, { ...tt, statuses })
  }
  const placed = type.statuses.filter(
    (it) => it._id === id && it.taskType !== undefined && rename.taskTypes.includes(it.taskType)
  )
  const entries = type.statuses.filter((it) => !placed.includes(it))
  if (!created && placed.length > 0 && !entries.some((it) => it._id === id)) {
    // A reused status no other task type lists stays in the project type, in no task type
    const { taskType, ...inProjectType } = placed[0]
    entries.push(inProjectType)
  }
  await client.update(type, { statuses: calculateStatuses({ statuses: entries, tasks: type.tasks }, left, []) })
  if (!created) return
  const status = await client.findOne(core.class.Status, { _id: id })
  if (status !== undefined) await client.remove(status)
}
