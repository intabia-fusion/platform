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

import core, { notEmpty, Ref, Status } from '@hcengineering/core'
import task, { type Task } from '@hcengineering/task'
import tracker from '@hcengineering/tracker'

import workflow from './plugin'
import { type ValidationResult, ValidatorClient, ValidatorFunc, type WorkflowTransition } from './types'

export function isEmpty (value: any): boolean {
  if (value === undefined || value === null) {
    return true
  }
  if (typeof value === 'string') {
    return value.trim() === ''
  }
  if (Array.isArray(value)) {
    return value.length === 0
  }
  if (value instanceof Map || value instanceof Set) {
    return value.size === 0
  }
  if (typeof value === 'object') {
    return Object.keys(value).length === 0
  }
  return false
}

export const FieldRequired: ValidatorFunc = async (
  _client: ValidatorClient,
  taskDoc: Task,
  transition: WorkflowTransition,
  props: Record<string, any>
): Promise<ValidationResult> => {
  const fields = ((props.fields ?? []) as string[]).filter(notEmpty)
  if (fields.length === 0) {
    return { ok: true }
  }

  for (const field of fields) {
    const val = (taskDoc as any)[field]
    if (isEmpty(val)) {
      return {
        ok: false,
        reason: `Field "${field}" is required for transition "${transition.name}".`,
        reasonIntl: workflow.string.FieldRequiredError,
        intlParams: { field, transition: transition.name }
      }
    }
  }

  return { ok: true }
}

async function getStatusNames (client: ValidatorClient, statusIds: Ref<Status>[]): Promise<string> {
  if (statusIds.length === 0) return ''
  const statusDocs: Pick<Status, '_id' | 'name'>[] = await client.findAll(
    core.class.Status,
    { _id: { $in: statusIds } },
    { projection: { _id: 1, name: 1 } }
  )
  const nameMap = new Map(statusDocs.map((s) => [s._id, s.name]))
  return statusIds.map((id) => nameMap.get(id) ?? String(id)).join(', ')
}

export const SubtaskStatus: ValidatorFunc = async (
  client: ValidatorClient,
  taskDoc: Task,
  transition: WorkflowTransition,
  props: Record<string, any>
): Promise<ValidationResult> => {
  const allowedStatuses = ((props.statuses ?? []) as Ref<Status>[]).filter(notEmpty)
  if (allowedStatuses.length === 0) {
    return { ok: true }
  }

  const subtasks: Pick<Task, 'status'>[] = await client.findAll(
    task.class.Task,
    { attachedTo: taskDoc._id },
    { projection: { status: 1 } }
  )
  if (subtasks.length === 0) {
    return { ok: true }
  }

  for (const subtask of subtasks) {
    if (!allowedStatuses.includes(subtask.status)) {
      const statuses = await getStatusNames(client, allowedStatuses)
      return {
        ok: false,
        reason: `Subtasks must be in allowed status (${statuses}) for transition "${transition.name}".`,
        reasonIntl: workflow.string.SubtaskStatusError,
        intlParams: { transition: transition.name, statuses }
      }
    }
  }

  return { ok: true }
}

export const ParentStatus: ValidatorFunc = async (
  client: ValidatorClient,
  taskDoc: Task,
  transition: WorkflowTransition,
  props: Record<string, any>
): Promise<ValidationResult> => {
  const allowedStatuses = ((props.statuses ?? []) as Ref<Status>[]).filter(notEmpty)
  if (allowedStatuses.length === 0) {
    return { ok: true }
  }

  if (taskDoc.attachedTo == null || taskDoc.attachedTo === tracker.ids.NoParent) {
    return { ok: true }
  }

  const parentTasks: Pick<Task, 'status'>[] = await client.findAll(
    task.class.Task,
    { _id: taskDoc.attachedTo as Ref<Task> },
    { projection: { status: 1 } }
  )
  if (parentTasks.length === 0) {
    return { ok: true }
  }

  const parentTask = parentTasks[0]
  if (!allowedStatuses.includes(parentTask.status)) {
    const statuses = await getStatusNames(client, allowedStatuses)
    return {
      ok: false,
      reason: `Parent task must be in allowed status (${statuses}) for transition "${transition.name}".`,
      reasonIntl: workflow.string.ParentStatusError,
      intlParams: { transition: transition.name, statuses }
    }
  }

  return { ok: true }
}
