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

import core, { DocumentUpdate, type Ref, SortingOrder, type Status, type TxOperations } from '@hcengineering/core'
import { Project, TaskType, ProjectType, makeRank } from '@hcengineering/task'
import workflow from './plugin'
import type { Workflow, WorkflowTransition } from './types'

export async function createWorkflow (
  client: TxOperations,
  projectTypeId: Ref<ProjectType>,
  taskTypeId: Ref<TaskType>,
  name: string
): Promise<Ref<Workflow>> {
  return await client.createDoc(workflow.class.Workflow, core.space.Workspace, {
    name,
    projectType: projectTypeId,
    taskType: taskTypeId
  })
}

export async function removeWorkflow (client: TxOperations, workflowId: Ref<Workflow>): Promise<void> {
  await client.removeDoc(workflow.class.Workflow, core.space.Workspace, workflowId)
}

export async function addTransition (
  client: TxOperations,
  workflowId: Ref<Workflow>,
  name: string,
  from: Ref<Status>[] | null,
  to: Ref<Status>
): Promise<Ref<WorkflowTransition>> {
  const last = await client.findOne(
    workflow.class.WorkflowTransition,
    { attachedTo: workflowId },
    { sort: { rank: SortingOrder.Descending } }
  )
  const rank = makeRank(last?.rank, undefined)
  return await client.addCollection(
    workflow.class.WorkflowTransition,
    core.space.Workspace,
    workflowId,
    workflow.class.Workflow,
    'transitions',
    {
      name,
      from,
      to,
      rank
    }
  )
}

export async function removeTransition (
  client: TxOperations,
  workflowId: Ref<Workflow>,
  transitionId: Ref<WorkflowTransition>
): Promise<void> {
  await client.removeCollection(
    workflow.class.WorkflowTransition,
    core.space.Workspace,
    transitionId,
    workflowId,
    workflow.class.Workflow,
    'transitions'
  )
}

export async function updateTransition (
  client: TxOperations,
  workflowId: Ref<Workflow>,
  transitionId: Ref<WorkflowTransition>,
  data: DocumentUpdate<WorkflowTransition>
): Promise<void> {
  await client.updateCollection(
    workflow.class.WorkflowTransition,
    core.space.Workspace,
    transitionId,
    workflowId,
    workflow.class.Workflow,
    'transitions',
    data
  )
}

export async function setWorkflow (
  client: TxOperations,
  project: Project,
  taskTypeId: Ref<TaskType>,
  workflowId: Ref<Workflow> | null
): Promise<void> {
  const hierarchy = client.getHierarchy()
  const projectWorkflow = hierarchy.as(project, workflow.mixin.ProjectWorkflow)
  const currentMappings = projectWorkflow.workflows
  const newMappings: Record<Ref<TaskType>, Ref<Workflow>> = { ...currentMappings }
  if (workflowId == null) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete newMappings[taskTypeId]
  } else {
    newMappings[taskTypeId] = workflowId
  }

  if (!hierarchy.hasMixin(project, workflow.mixin.ProjectWorkflow)) {
    await client.createMixin(project._id, project._class, project.space, workflow.mixin.ProjectWorkflow, {
      workflows: newMappings
    })
  } else {
    await client.updateMixin(project._id, project._class, project.space, workflow.mixin.ProjectWorkflow, {
      workflows: newMappings
    })
  }
}

export function findTransitionConflict (
  t1: Pick<WorkflowTransition, 'from' | 'to'>,
  t2: Pick<WorkflowTransition, 'from' | 'to'>
): Ref<Status> | null {
  if (t1.to !== t2.to) return null

  const t1From = t1.from == null || t1.from.length === 0 ? null : t1.from
  const t2From = t2.from == null || t2.from.length === 0 ? null : t2.from

  if (t1From === null && t2From === null) {
    return 'null' as any
  }

  if (t1From !== null && t2From !== null) {
    const intersect = t1From.find((s) => t2From.includes(s))
    return intersect ?? null
  }

  return null
}

export function checkConflict (
  t1: Pick<WorkflowTransition, 'from' | 'to'>,
  t2: Pick<WorkflowTransition, 'from' | 'to'>
): boolean {
  return findTransitionConflict(t1, t2) !== null
}

export interface ConflictInfo {
  transition: WorkflowTransition
  status: Ref<Status>
}

export function getTransitionConflict (
  newTransition: Pick<WorkflowTransition, 'from' | 'to'> & { _id?: Ref<WorkflowTransition> },
  existingTransitions: WorkflowTransition[]
): ConflictInfo | null {
  for (const t of existingTransitions) {
    if (newTransition._id !== undefined && t._id === newTransition._id) continue
    const conflictStatus = findTransitionConflict(newTransition, t)
    if (conflictStatus !== null) {
      return {
        transition: t,
        status: conflictStatus
      }
    }
  }
  return null
}

export function hasTransitionConflict (
  newTransition: Pick<WorkflowTransition, 'from' | 'to'> & { _id?: Ref<WorkflowTransition> },
  existingTransitions: WorkflowTransition[]
): boolean {
  return getTransitionConflict(newTransition, existingTransitions) !== null
}

export function hasSelfTransition (transition: Pick<WorkflowTransition, 'from' | 'to'>): boolean {
  if (transition.to == null || transition.from == null || !Array.isArray(transition.from)) {
    return false
  }
  return transition.from.includes(transition.to)
}
