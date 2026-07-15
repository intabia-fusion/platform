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

import type { Doc, Ref, Status } from '@hcengineering/core'
import type { Project, TaskType } from '@hcengineering/task'

export interface Workflow extends Doc {
  name: string
}

export interface WorkflowTransition extends Doc {
  workflow: Ref<Workflow>
  name: string
  from: Ref<Status> | null
  to: Ref<Status>
}

export interface WorkflowMapping {
  taskType: Ref<TaskType>
  workflow: Ref<Workflow>
}

export interface ProjectWorkflow extends Project {
  defaultWorkflow?: Ref<Workflow>
  workflows?: WorkflowMapping[]
}
