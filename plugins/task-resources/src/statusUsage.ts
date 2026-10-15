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

import type { Ref, Status, TxOperations } from '@hcengineering/core'
import { calculateStatuses, type ProjectType, type TaskType } from '@hcengineering/task'
import workflow from '@hcengineering/workflow'

/**
 * @public
 */
export interface StatusWorkflowRef {
  id: string
  name: string
}

/**
 * Workflows of the project type by status: the status is initial, or the source or target of a transition.
 * A workflow is named after its task type.
 * @public
 */
export async function loadWorkflowUsage (
  client: TxOperations,
  typeId: Ref<ProjectType>,
  taskTypes: TaskType[]
): Promise<Map<Ref<Status>, StatusWorkflowRef[]>> {
  const workflows = await client.findAll(workflow.class.Workflow, { projectType: typeId })
  const transitions =
    workflows.length > 0
      ? await client.findAll(
        workflow.class.WorkflowTransition,
        { attachedTo: { $in: workflows.map((it) => it._id) } },
        { projection: { attachedTo: 1, from: 1, to: 1 } }
      )
      : []
  const used = new Map<Ref<Status>, Set<string>>()
  const add = (status: Ref<Status>, wf: string): void => {
    used.set(status, (used.get(status) ?? new Set()).add(wf))
  }
  for (const wf of workflows) {
    for (const it of wf.initialStatuses ?? []) add(it, wf._id)
  }
  for (const t of transitions) {
    add(t.to, t.attachedTo)
    for (const it of t.from ?? []) add(it, t.attachedTo)
  }
  const names = new Map(
    workflows.map((wf) => [wf._id as string, taskTypes.find((tt) => tt._id === wf.taskType)?.name ?? wf.name])
  )
  return new Map([...used].map(([status, ids]) => [status, [...ids].map((id) => ({ id, name: names.get(id) ?? id }))]))
}

/**
 * Takes the status out of the project type and its task types. The Status document goes too, unless the model
 * defines it or another project type, task type or transition still refers to it.
 * @public
 */
export async function removeStatusFromType (
  client: TxOperations,
  type: ProjectType,
  status: Status,
  taskTypes: TaskType[],
  otherTypes: ProjectType[],
  otherTaskTypes: TaskType[]
): Promise<void> {
  const id = status._id
  const remaining = new Map<Ref<TaskType>, TaskType>()
  for (const tt of taskTypes) {
    const left = tt.statuses.includes(id) ? { ...tt, statuses: tt.statuses.filter((it) => it !== id) } : tt
    if (left !== tt) await client.update(tt, { statuses: left.statuses })
    remaining.set(tt._id, left)
  }
  if (type.statuses.some((it) => it._id === id) || type.statusOrder?.includes(id) === true) {
    await client.update(type, {
      statuses: calculateStatuses(
        { statuses: type.statuses.filter((it) => it._id !== id), tasks: type.tasks },
        remaining,
        []
      ),
      ...(type.statusOrder !== undefined ? { statusOrder: type.statusOrder.filter((it) => it !== id) } : {})
    })
  }
  const referenced =
    id.includes(':') ||
    otherTypes.some((it) => it._id !== type._id && it.statuses.some((s) => s._id === id)) ||
    otherTaskTypes.some((it) => it.parent !== type._id && it.statuses.includes(id)) ||
    (await client.findAll(workflow.class.WorkflowTransition, {}, { projection: { from: 1, to: 1 } })).some(
      (it) => it.to === id || (it.from ?? []).includes(id)
    )
  if (!referenced) await client.remove(status)
}
