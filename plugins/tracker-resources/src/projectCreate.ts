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
  generateId,
  type Data,
  type Mixin,
  type Ref,
  type RolesAssignment,
  type TxOperations
} from '@hcengineering/core'
import type { Project as TaskProject, ProjectType } from '@hcengineering/task'
import type { Project } from '@hcengineering/tracker'
import workflow from '@hcengineering/workflow'
import type { ProjectWorkflow } from '@hcengineering/workflow'

import tracker from './plugin'

export interface CreateProjectInput {
  projectData: Omit<Data<Project>, 'type'>
  typeId: Ref<ProjectType>
  targetClass: Ref<Mixin<any>>
  rolesAssignment?: RolesAssignment
  workflowsMapping: Record<string, any>
}

export type CreateProjectResult = { ok: true, projectId: Ref<Project> } | { ok: false, reason: 'identifier-taken' }

export async function createProjectWithMixins (
  client: TxOperations,
  input: CreateProjectInput
): Promise<CreateProjectResult> {
  const { projectData, typeId, targetClass, rolesAssignment, workflowsMapping } = input
  const projectId = generateId<Project>()
  const ops = client
    .apply('create-project')
    .notMatch(tracker.class.Project, { identifier: projectData.identifier.toUpperCase() })

  await ops.createDoc(tracker.class.Project, core.space.Space, { ...projectData, type: typeId }, projectId)
  // Mixins go into the same apply: the project is created with its roles and workflows or not at all
  await ops.createMixin(projectId, tracker.class.Project, core.space.Space, targetClass, rolesAssignment ?? {})
  if (Object.keys(workflowsMapping).length > 0) {
    await ops.createMixin<TaskProject, ProjectWorkflow>(
      projectId,
      tracker.class.Project,
      core.space.Space,
      workflow.mixin.ProjectWorkflow,
      { workflows: workflowsMapping }
    )
  }
  const succeeded = await ops.commit()
  if (!succeeded.result) return { ok: false, reason: 'identifier-taken' }
  return { ok: true, projectId }
}
