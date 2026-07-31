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
import { type Task } from '@hcengineering/task'
import workflow from '@hcengineering/model-workflow'
import serverWorkflow, { type PostFunctionImpl } from '@hcengineering/server-workflow'
import {
  type WorkflowPostFunction,
  type WorkflowTransition,
  type WorkflowPostFunctionConfig
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
    try {
      const txes = await executePostFunction(control, pfConfig, transition, task)
      if (txes.length > 0) {
        resultTxes.push(...txes)
      }
    } catch (err) {
      console.error(
        `[WorkflowPostFunctions] Error executing post-function ${pfConfig.id ?? (pfConfig.postFunction as string)}:`,
        err
      )
    }
  }
  console.log(resultTxes)
  return resultTxes
}

async function executePostFunction (
  control: TriggerControl,
  pfConfig: WorkflowPostFunctionConfig,
  transition: WorkflowTransition,
  task: Task
): Promise<Tx[]> {
  if (pfConfig?.postFunction == null) return []

  const postFunction = (
    await control.findAll(
      control.ctx,
      workflow.class.WorkflowPostFunction,
      { _id: pfConfig.postFunction },
      { limit: 1 }
    )
  )[0]

  if (postFunction == null) return []

  if (!control.hierarchy.hasMixin(postFunction, serverWorkflow.mixin.PostFunctionImpl)) {
    return []
  }

  const pfImpl = control.hierarchy.as<WorkflowPostFunction, PostFunctionImpl>(
    postFunction,
    serverWorkflow.mixin.PostFunctionImpl
  )
  if (pfImpl.serverExecutor == null) return []

  const executorFn = await getResource(pfImpl.serverExecutor)
  if (executorFn == null) return []

  return (await executorFn(control, task, transition, pfConfig.props)) ?? []
}
