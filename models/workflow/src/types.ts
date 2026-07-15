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

import core, { type Ref, type Status } from '@hcengineering/core'
import { Model, Prop, TypeString, TypeRef, Mixin, ArrOf, TypeRecord } from '@hcengineering/model'
import { TDoc } from '@hcengineering/model-core'
import task from '@hcengineering/task'
import {
  type Workflow,
  type WorkflowTransition,
  type WorkflowMapping,
  type ProjectWorkflow
} from '@hcengineering/workflow'
import workflow from './plugin'
import { TProject } from '@hcengineering/model-task'

@Model(workflow.class.Workflow, core.class.Doc)
export class TWorkflow extends TDoc implements Workflow {
  @Prop(TypeString(), workflow.string.Name)
    name!: string
}

@Model(workflow.class.WorkflowTransition, core.class.Doc)
export class TWorkflowTransition extends TDoc implements WorkflowTransition {
  @Prop(TypeRef(workflow.class.Workflow), workflow.string.Workflow)
    workflow!: Ref<Workflow>

  @Prop(TypeString(), workflow.string.Name)
    name!: string

  @Prop(TypeRef(core.class.Status), workflow.string.From)
    from!: Ref<Status> | null

  @Prop(TypeRef(core.class.Status), workflow.string.To)
    to!: Ref<Status>
}

@Mixin(workflow.mixin.ProjectWorkflow, task.class.Project)
export class TProjectWorkflow extends TProject implements ProjectWorkflow {
  @Prop(TypeRef(workflow.class.Workflow), workflow.string.DefaultWorkflow)
    defaultWorkflow?: Ref<Workflow>

  @Prop(ArrOf(TypeRecord()), workflow.string.WorkflowMapping)
    workflows?: WorkflowMapping[]
}
