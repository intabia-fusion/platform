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

import core, { type Ref, type Status, type Domain, type Class } from '@hcengineering/core'
import { Model, Prop, TypeString, TypeRef, Mixin, TypeRecord, Collection, ArrOf } from '@hcengineering/model'
import { TDoc, TAttachedDoc } from '@hcengineering/model-core'
import task, { type TaskType, type ProjectType, type Rank } from '@hcengineering/task'
import { type Workflow, type WorkflowTransition, type ProjectWorkflow } from '@hcengineering/workflow'
import workflow from './plugin'
import { TProject } from '@hcengineering/model-task'

export const DOMAIN_WORKFLOW = 'workflow' as Domain

@Model(workflow.class.Workflow, core.class.Doc, DOMAIN_WORKFLOW)
export class TWorkflow extends TDoc implements Workflow {
  @Prop(TypeRef(task.class.ProjectType), task.string.ProjectType)
    projectType!: Ref<ProjectType>

  @Prop(TypeRef(task.class.TaskType), task.string.TaskType)
    taskType!: Ref<TaskType>

  @Prop(TypeString(), workflow.string.Name)
    name!: string

  @Prop(Collection(workflow.class.WorkflowTransition), workflow.string.WorkflowTransition)
    transitions!: number
}

@Model(workflow.class.WorkflowTransition, core.class.AttachedDoc, DOMAIN_WORKFLOW)
export class TWorkflowTransition extends TAttachedDoc implements WorkflowTransition {
  declare attachedTo: Ref<Workflow>
  declare attachedToClass: Ref<Class<Workflow>>
  declare collection: 'transitions'

  @Prop(TypeString(), workflow.string.Name)
    name!: string

  @Prop(ArrOf(TypeRef(core.class.Status)), workflow.string.From)
    from!: Ref<Status>[] | null

  @Prop(TypeRef(core.class.Status), workflow.string.To)
    to!: Ref<Status>

  @Prop(TypeString(), task.string.Rank)
    rank!: Rank
}

@Mixin(workflow.mixin.ProjectWorkflow, task.class.Project)
export class TProjectWorkflow extends TProject implements ProjectWorkflow {
  @Prop(TypeRecord(), workflow.string.WorkflowMapping)
    workflows?: Record<Ref<TaskType>, Ref<Workflow>>
}
