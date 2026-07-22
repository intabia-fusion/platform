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

import type { Doc, Ref, Status, AttachedDoc, Client } from '@hcengineering/core'
import type { Project, TaskType, ProjectType, Rank, Task } from '@hcengineering/task'
import type { Asset, IntlString, Resource } from '@hcengineering/platform'
import { AnyComponent } from '@hcengineering/ui'

export interface Workflow extends Doc {
  name: string
  projectType: Ref<ProjectType>
  taskType: Ref<TaskType>
  transitions?: number
}

export type ValidationResult =
  | { ok: true }
  | {
    ok: false
    reason: string
    reasonIntl: IntlString
    intlParams: Record<string, any>
  }

export type ValidatorClient = Pick<Client, 'findAll' | 'findOne' | 'getHierarchy' | 'getModel'>

export type ValidatorFunc = (
  client: ValidatorClient,
  task: Task,
  transition: WorkflowTransition,
  props: Record<string, any>
) => Promise<ValidationResult>

export interface WorkflowRule extends Doc {
  label: IntlString
  description: IntlString
  icon?: Asset
  group?: string
  order: number

  editor: AnyComponent
  presenter?: AnyComponent
}

export interface WorkflowValidator extends WorkflowRule {}

export interface ValidatorImpl extends WorkflowValidator {
  executor: Resource<ValidatorFunc>
}

export interface WorkflowValidatorConfig {
  id: string
  validator: Ref<WorkflowValidator>
  props: Record<string, any>
}

export interface WorkflowTransition extends AttachedDoc<Workflow, 'transitions'> {
  name: string
  from: Ref<Status>[] | null
  to: Ref<Status>
  rank: Rank
  validators?: WorkflowValidatorConfig[]
}

export interface ProjectWorkflow extends Project {
  workflows?: Record<Ref<TaskType>, Ref<Workflow>>
}
