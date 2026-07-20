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

import core, {
  type Doc,
  type Tx,
  type TxUpdateDoc,
  type TxCreateDoc,
  type Ref,
  type TxCUD,
  type Status,
  Hierarchy
} from '@hcengineering/core'
import { type TriggerControl } from '@hcengineering/server-core'
import task, { Project, type Task, type TaskType } from '@hcengineering/task'
import workflow from '@hcengineering/model-workflow'
import { type ProjectWorkflow, type Workflow } from '@hcengineering/workflow'

export async function ValidateTransition (txes: TxCUD<Doc>[], control: TriggerControl): Promise<Tx[]> {
  for (const tx of txes) {
    if (!control.hierarchy.isDerived(tx.objectClass, task.class.Task)) {
      continue
    }

    if (tx._class === core.class.TxCreateDoc) {
      await validateCreate(tx as TxCreateDoc<Task>, control)
    } else if (tx._class === core.class.TxUpdateDoc) {
      await validateUpdate(tx as TxUpdateDoc<Task>, control)
    }
  }
  return []
}

async function validateCreate (createTx: TxCreateDoc<Task>, control: TriggerControl): Promise<void> {
  const status = createTx.attributes.status
  if (status == null) return

  const project = (
    await control.findAll(control.ctx, task.class.Project, { _id: createTx.objectSpace as Ref<Project> }, { limit: 1 })
  )[0]
  if (project == null) return

  const workflowRef = findWorkflowForTaskType(control.hierarchy, project, createTx.attributes.kind)
  if (workflowRef !== undefined) {
    const transitions = await control.findAll(control.ctx, workflow.class.WorkflowTransition, {
      attachedTo: workflowRef
    })
    const allowed = transitions.some((t) => getFromStatuses(t.from) === null && t.to === status)
    if (!allowed) {
      throw new Error(`Стартовый статус ${status} не разрешен в воркфлоу для создания новой задачи.`)
    }
  }
}

async function validateUpdate (updateTx: TxUpdateDoc<Task>, control: TriggerControl): Promise<void> {
  const newStatus = updateTx.operations.status
  if (newStatus == null) return

  const oldTask = (await control.findAll(control.ctx, task.class.Task, { _id: updateTx.objectId }, { limit: 1 }))[0]
  if (oldTask == null) return
  const oldStatus = oldTask.status

  if (oldStatus === newStatus) return

  const project = (
    await control.findAll(control.ctx, task.class.Project, { _id: oldTask.space as Ref<Project> }, { limit: 1 })
  )[0]
  if (project == null) return

  const workflowRef = findWorkflowForTaskType(control.hierarchy, project, oldTask.kind)
  if (workflowRef !== undefined) {
    const transitions = await control.findAll(control.ctx, workflow.class.WorkflowTransition, {
      attachedTo: workflowRef
    })
    const allowed = transitions.some((t) => {
      const froms = getFromStatuses(t.from)
      return (froms === null || froms.includes(oldStatus)) && t.to === newStatus
    })
    if (!allowed) {
      throw new Error(`Переход из статуса "${oldStatus}" в "${newStatus}" запрещен правилами воркфлоу.`)
    }
  }
}

function findWorkflowForTaskType (
  h: Hierarchy,
  project: Project,
  taskTypeRef: Ref<TaskType>
): Ref<Workflow> | undefined {
  if (!h.hasMixin(project, workflow.mixin.ProjectWorkflow)) return undefined
  const projectWorkflow = h.as<Project, ProjectWorkflow>(project, workflow.mixin.ProjectWorkflow)
  return projectWorkflow.workflows?.[taskTypeRef]
}

function getFromStatuses (from: any): Ref<Status>[] | null {
  if (from == null) return null
  if (Array.isArray(from)) return from.length === 0 ? null : from
  return [from]
}
