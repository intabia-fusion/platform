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

import { type Ref, type Tx, type TxRemoveDoc } from '@hcengineering/core'
import { type TriggerControl } from '@hcengineering/server-core'
import type { TaskType, Project } from '@hcengineering/task'
import workflow from '@hcengineering/model-workflow'
import { type ProjectWorkflow, type Workflow } from '@hcengineering/workflow'

export async function OnWorkflowDelete (txes: TxRemoveDoc<Workflow>[], control: TriggerControl): Promise<Tx[]> {
  const result: Tx[] = []
  const removedWorkflowIds = new Set<Ref<Workflow>>(txes.map((it) => it.objectId))

  if (removedWorkflowIds.size === 0) return result

  const projects = await control.findAll(control.ctx, workflow.mixin.ProjectWorkflow, {})

  for (const project of projects) {
    if (project.workflows == null) continue

    const updatedWorkflows: Record<Ref<TaskType>, Ref<Workflow>> = {}
    let modified = false

    for (const [taskType, wfId] of Object.entries(project.workflows)) {
      if (wfId != null && removedWorkflowIds.has(wfId)) {
        modified = true
      } else if (wfId != null) {
        updatedWorkflows[taskType as Ref<TaskType>] = wfId
      }
    }

    if (modified) {
      result.push(
        control.txFactory.createTxMixin<Project, ProjectWorkflow>(
          project._id as Ref<Project>,
          project._class,
          project.space,
          workflow.mixin.ProjectWorkflow,
          { workflows: updatedWorkflows }
        )
      )
    }
  }

  control.ctx?.info?.('[OnWorkflowDelete] Finished processing', { resultCount: result.length })
  return result
}

export async function OnTaskTypeDelete (txes: TxRemoveDoc<TaskType>[], control: TriggerControl): Promise<Tx[]> {
  const result: Tx[] = []
  const removedTaskTypeIds = txes.map((it) => it.objectId)
  if (removedTaskTypeIds.length === 0) return result

  const workflows = await control.findAll(control.ctx, workflow.class.Workflow, {
    taskType: { $in: removedTaskTypeIds }
  })

  for (const wf of workflows) {
    result.push(control.txFactory.createTxRemoveDoc(workflow.class.Workflow, wf.space, wf._id))
  }

  return result
}
