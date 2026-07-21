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

import core from '@hcengineering/core'
import { type Builder } from '@hcengineering/model'
import task from '@hcengineering/task'
import serverCore from '@hcengineering/server-core'
import workflow, { TWorkflowValidator } from '@hcengineering/model-workflow'
import { Mixin } from '@hcengineering/model'
import type { Resource } from '@hcengineering/platform'
import { type ValidatorImpl } from '@hcengineering/server-workflow'
import { type ValidatorFunc } from '@hcengineering/workflow'
import serverWorkflow from '@hcengineering/server-workflow'

export { serverWorkflowId } from '@hcengineering/server-workflow'

@Mixin(serverWorkflow.mixin.ValidatorImpl, workflow.class.WorkflowValidator)
export class TValidatorImpl extends TWorkflowValidator implements ValidatorImpl {
  serverExecutor!: Resource<ValidatorFunc>
}

export function createModel (builder: Builder): void {
  builder.createModel(TValidatorImpl)

  builder.createDoc(serverCore.class.Trigger, core.space.Model, {
    trigger: serverWorkflow.trigger.ValidateTransition,
    isAsync: false,
    txMatch: {
      objectClass: task.class.Task
    }
  })

  builder.mixin(
    workflow.validator.FieldRequired,
    workflow.class.WorkflowValidator,
    serverWorkflow.mixin.ValidatorImpl,
    {
      serverExecutor: serverWorkflow.validatorExecutor.FieldRequired
    }
  )

  builder.mixin(
    workflow.validator.SubtaskStatus,
    workflow.class.WorkflowValidator,
    serverWorkflow.mixin.ValidatorImpl,
    {
      serverExecutor: serverWorkflow.validatorExecutor.SubtaskStatus
    }
  )
}
