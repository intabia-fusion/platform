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

import { type Tx } from '@hcengineering/core'
import { type TriggerControl } from '@hcengineering/server-core'
import { getResource } from '@hcengineering/platform'
import taskPlugin, { type Task } from '@hcengineering/task'
import workflow from '@hcengineering/model-workflow'
import serverWorkflow, { type PostFunctionImpl } from '@hcengineering/server-workflow'
import {
  type WorkflowPostFunction,
  type WorkflowTransition,
  type WorkflowPostFunctionConfig,
  type SetFieldValueProps,
  type ClearFieldValueProps
} from '@hcengineering/workflow'

export async function executeTransitionPostFunctions (
  control: TriggerControl,
  transition: WorkflowTransition,
  task: Task
): Promise<Tx[]> {
  const postFunctions = transition.postFunctions
  if (postFunctions == null || postFunctions.length === 0) return []

  const resultTxes: Tx[] = []
  for (const pfConfig of postFunctions) {
    const txes = await executePostFunction(control, pfConfig, transition, task)
    if (txes.length > 0) {
      resultTxes.push(...txes)
    }
  }
  return resultTxes
}

async function executePostFunction (
  control: TriggerControl,
  pfConfig: WorkflowPostFunctionConfig,
  transition: WorkflowTransition,
  task: Task
): Promise<Tx[]> {
  const postFunction = (
    await control.findAll(
      control.ctx,
      workflow.class.WorkflowPostFunction,
      { _id: pfConfig.postFunction },
      { limit: 1 }
    )
  )[0]

  if (postFunction == null) return []

  const pfImpl = control.hierarchy.as<WorkflowPostFunction, PostFunctionImpl>(
    postFunction,
    serverWorkflow.mixin.PostFunctionImpl
  )
  const executorFn = await getResource(pfImpl.serverExecutor)
  if (executorFn == null) return []

  return (await executorFn(control, task, transition, pfConfig.props)) ?? []
}

export async function SetFieldValue (
  control: TriggerControl,
  task: Task,
  transition: WorkflowTransition,
  props: SetFieldValueProps
): Promise<Tx[]> {
  const fieldKey = props.fieldKey
  if (fieldKey == null || fieldKey === '') return []

  let value = props.value
  if (value === '$currentUser') {
    value = task.modifiedBy ?? null
  } else if (value === '$now') {
    value = Date.now()
  }

  return [
    control.txFactory.createTxUpdateDoc(task._class ?? taskPlugin.class.Task, task.space, task._id, {
      [fieldKey]: value
    })
  ]
}

export async function ClearFieldValue (
  control: TriggerControl,
  task: Task,
  transition: WorkflowTransition,
  props: ClearFieldValueProps
): Promise<Tx[]> {
  const fields = props.fields
  if (fields == null || fields.length === 0) return []

  const ops: Record<string, any> = {}
  for (const item of fields) {
    const key = typeof item === 'string' ? item : item?.fieldKey
    if (key != null && key !== '') {
      ops[key] = null
    }
  }

  if (Object.keys(ops).length === 0) return []

  return [control.txFactory.createTxUpdateDoc(task._class ?? taskPlugin.class.Task, task.space, task._id, ops)]
}
