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
  Hierarchy,
  TxProcessor
} from '@hcengineering/core'
import { type TriggerControl } from '@hcengineering/server-core'
import { getResource } from '@hcengineering/platform'
import task, { Project, type Task, type TaskType } from '@hcengineering/task'
import workflow from '@hcengineering/model-workflow'
import serverWorkflow, { type ValidatorImpl } from '@hcengineering/server-workflow'
import {
  type ProjectWorkflow,
  type Workflow,
  type WorkflowValidator,
  type WorkflowTransition,
  type WorkflowValidatorConfig,
  type ValidatorClient
} from '@hcengineering/workflow'
import { executeTransitionPostFunctions } from './ExecutePostFunctions'

export async function ValidateTransitionTrigger (txes: TxCUD<Doc>[], control: TriggerControl): Promise<Tx[]> {
  const result: Tx[] = []
  for (const tx of txes) {
    if (!control.hierarchy.isDerived(tx.objectClass, task.class.Task)) {
      continue
    }

    if (tx._class === core.class.TxCreateDoc) {
      await validateCreate(tx as TxCreateDoc<Task>, control)
    } else if (tx._class === core.class.TxUpdateDoc) {
      const postTxes = await validateUpdate(tx as TxUpdateDoc<Task>, control)
      if (postTxes != null && postTxes.length > 0) {
        result.push(...postTxes)
      }
    }
  }
  return result
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
    const allowed = transitions.some((t) => (t.from == null || t.from.length === 0) && t.to === status)
    if (!allowed) {
      throw new Error(`Initial status "${status}" is not allowed in the workflow for creating a new task.`)
    }
  }
}

async function validateUpdate (updateTx: TxUpdateDoc<Task>, control: TriggerControl): Promise<Tx[]> {
  const toStatus = updateTx.operations.status
  if (toStatus == null) return []

  const oldTask = (await control.findAll(control.ctx, task.class.Task, { _id: updateTx.objectId }, { limit: 1 }))[0]
  if (oldTask == null) return []

  const fromStatus = oldTask.status
  if (fromStatus === toStatus) return []

  const project = (
    await control.findAll(control.ctx, task.class.Project, { _id: oldTask.space as Ref<Project> }, { limit: 1 })
  )[0]
  if (project == null) return []

  const workflowRef = findWorkflowForTaskType(control.hierarchy, project, oldTask.kind)
  if (workflowRef == null) return []

  const transitions = await control.findAll(control.ctx, workflow.class.WorkflowTransition, {
    attachedTo: workflowRef
  })

  const allowedTransitions = transitions.filter((t) => {
    return (t.from == null || t.from.includes(fromStatus)) && t.to === toStatus
  })
  if (allowedTransitions.length === 0) {
    throw new Error(`Transition from status "${fromStatus}" to "${toStatus}" is forbidden by the workflow rules.`)
  }

  // Prioritize specific transition over "Any Status" general transition
  const transition =
    allowedTransitions.find((t) => t.from != null && t.from.includes(fromStatus)) ??
    allowedTransitions.find((t) => t.from == null || t.from.length === 0)

  if (transition === undefined) {
    throw new Error(`Transition from status "${fromStatus}" to "${toStatus}" is forbidden by the workflow rules.`)
  }

  await validateTransitionValidators(control, transition, TxProcessor.updateDoc2Doc(oldTask, updateTx))
  return await executeTransitionPostFunctions(control, transition, oldTask)
}

async function validateTransitionValidators (
  control: TriggerControl,
  transition: WorkflowTransition,
  task: Task
): Promise<void> {
  const validators = transition.validators
  if (validators == null || validators.length === 0) return

  for (const validatorConfig of validators) {
    await executeValidator(control, validatorConfig, transition, task)
  }
}

async function executeValidator (
  control: TriggerControl,
  validatorConfig: WorkflowValidatorConfig,
  transition: WorkflowTransition,
  task: Task
): Promise<void> {
  const validator = (
    await control.findAll(
      control.ctx,
      workflow.class.WorkflowValidator,
      { _id: validatorConfig.validator },
      { limit: 1 }
    )
  )[0] as WorkflowValidator | undefined

  if (validator == null) return

  const validatorImpl = control.hierarchy.as<WorkflowValidator, ValidatorImpl>(
    validator,
    serverWorkflow.mixin.ValidatorImpl
  )
  const executorFn = await getResource(validatorImpl.serverExecutor)
  if (executorFn == null) return

  const res = await executorFn(getValidatorClient(control), task, transition, validatorConfig.props)
  if (!res.ok) {
    throw new Error(res.reason ?? 'Validation failed')
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

function getValidatorClient (control: TriggerControl): ValidatorClient {
  return {
    getHierarchy: () => control.hierarchy,
    getModel: () => control.modelDb,
    findAll: (_class, query, options) => control.findAll(control.ctx, _class, query, options),
    findOne: async (_class, query, options) => (await control.findAll(control.ctx, _class, query, options))[0]
  }
}

export { FieldRequired, SubtaskStatus, ParentStatus } from '@hcengineering/workflow'
