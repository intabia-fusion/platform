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
  AnyAttribute,
  Doc,
  Hierarchy,
  notEmpty,
  Ref,
  RefTo,
  Status
} from '@hcengineering/core'
import task, { type Task, TaskType } from '@hcengineering/task'
import tracker from '@hcengineering/tracker'
import { type IntlString, translate } from '@hcengineering/platform'
import { isEmptyMarkup } from '@hcengineering/text'

import workflow from './plugin'
import {
  FieldRequiredProps,
  type ValidationResult,
  ValidatorClient,
  ValidatorFunc,
  type WorkflowTransition
} from './schema'

export function isEmptyAttribute (h: Hierarchy, attribute: AnyAttribute, value: any): boolean {
  if (value == null) return true

  if (h.isDerived(attribute.type._class, core.class.RefTo)) {
    const type = attribute.type as RefTo<Doc>
    if (h.isDerived(type.to, tracker.class.Issue) && value === tracker.ids.NoParent) {
      return true
    }
  }

  if (h.isDerived(attribute.type._class, core.class.Collection)) {
    const count = Number(value)
    if (!Number.isInteger(count) || count <= 0) {
      return true
    }
  }

  if (h.isDerived(attribute.type._class, core.class.TypeCollaborativeDoc) ||
    h.isDerived(attribute.type._class, core.class.TypeMarkup)) {
    return isEmptyMarkup(value)
  }

  return isEmptyValue(value)
}

function isEmptyValue (value: any): boolean {
  if (value === undefined || value === null) {
    return true
  }
  if (typeof value === 'number') {
    return value === 0 || isNaN(value)
  }
  if (typeof value === 'boolean') {
    return false
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
    if ('value' in value && Object.keys(value).length === 1) {
      return isEmptyValue(value.value)
    }
    return Object.keys(value).length === 0
  }

  return false
}

export const FieldRequired: ValidatorFunc = async (
  client: ValidatorClient,
  taskDoc: Task,
  transition: WorkflowTransition,
  _props: Record<string, any>
): Promise<ValidationResult> => {
  const props = _props as FieldRequiredProps | undefined
  const fields = props?.fields ?? []

  if (fields.length === 0) {
    return { ok: true }
  }

  const h = client.getHierarchy()
  for (const f of fields) {
    const fieldKey = f.fieldKey
    if (fieldKey == null || fieldKey === '') continue

    const attribute = h.findAttribute(f.mixin ?? taskDoc._class, fieldKey)

    const val = f.mixin != null ? (h.as(taskDoc, f.mixin) as any)[f.fieldKey] : (taskDoc as any)[f.fieldKey]
    if (attribute == null) continue

    if (isEmptyAttribute(h, attribute, val)) {
      const flow = await getTransitionFlow(client, transition)
      const fieldName = await translate(attribute.label, {})
      return {
        ok: false,
        reason: `Field "${fieldName}" is required for transition ${flow}.`,
        reasonIntl: workflow.string.FieldRequiredError,
        intlParams: { field: fieldName, transition: flow },
        intlParamsNotLocalized: { field: attribute.label }
      }
    }
  }

  return { ok: true }
}

async function getTransitionFlow (client: ValidatorClient, transition: WorkflowTransition): Promise<string> {
  const fromStr =
    transition.from != null && transition.from.length > 0 ? await getStatusNames(client, transition.from) : 'Any'
  const toStr = await getStatusNames(client, [transition.to])
  return `${fromStr} ➜ ${toStr}`
}

async function getStatusNames (client: ValidatorClient, statusIds: Ref<Status>[]): Promise<string> {
  if (statusIds.length === 0) return ''
  const statusDocs: Pick<Status, '_id' | 'name'>[] = await client.findAll(
    core.class.Status,
    { _id: { $in: statusIds } },
    { projection: { _id: 1, name: 1 } }
  )
  const nameMap = new Map(statusDocs.map((s) => [s._id, s.name]))
  const translatedNames = await Promise.all(
    statusIds.map(async (id) => {
      const name = nameMap.get(id) ?? String(id)
      return await translate(name as IntlString, {})
    })
  )
  return translatedNames.join(', ')
}

function checkTaskTypeStatus (
  statusesProp: Record<Ref<TaskType>, Ref<Status>[] | null> | undefined,
  taskTypeId: Ref<TaskType>,
  taskStatus: Ref<Status>
): { ok: true } | { ok: false, allowedStatuses: Ref<Status>[] } {
  if (statusesProp == null) return { ok: true }

  const allowed = statusesProp?.[taskTypeId]
  if (allowed == null) {
    return { ok: true }
  }

  if (Array.isArray(allowed)) {
    const filterAllowed = allowed.filter(notEmpty)
    if (filterAllowed.length === 0) {
      return { ok: true }
    }
    if (filterAllowed.includes(taskStatus)) {
      return { ok: true }
    }
    return { ok: false, allowedStatuses: filterAllowed }
  }

  return { ok: true }
}

export const SubtaskStatus: ValidatorFunc = async (
  client: ValidatorClient,
  taskDoc: Task,
  transition: WorkflowTransition,
  props: Record<string, any>
): Promise<ValidationResult> => {
  const statusesMap = (props.statuses ?? {}) as Record<Ref<TaskType>, Ref<Status>[] | null>
  if (isEmptyValue(statusesMap)) {
    return { ok: true }
  }

  const subtasks: Pick<Task, 'kind' | 'status'>[] = await client.findAll(
    task.class.Task,
    { attachedTo: taskDoc._id },
    { projection: { kind: 1, status: 1 } }
  )
  if (subtasks.length === 0) {
    return { ok: true }
  }

  for (const subtask of subtasks) {
    const check = checkTaskTypeStatus(statusesMap, subtask.kind, subtask.status)
    if (!check.ok) {
      const flow = await getTransitionFlow(client, transition)
      const statusesStr = await getStatusNames(client, check.allowedStatuses)
      return {
        ok: false,
        reason: `Subtasks must be in allowed statuses (${statusesStr}) for transition ${flow}.`,
        reasonIntl: workflow.string.SubtaskStatusError,
        intlParams: { transition: flow, statuses: statusesStr }
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
  const statusesMap = (props.statuses ?? {}) as Record<Ref<TaskType>, Ref<Status>[] | null>
  if (isEmptyValue(statusesMap)) {
    return { ok: true }
  }

  if (taskDoc.attachedTo == null || taskDoc.attachedTo === tracker.ids.NoParent) {
    return { ok: true }
  }

  const parentTasks: Pick<Task, 'kind' | 'status'>[] = await client.findAll(
    task.class.Task,
    { _id: taskDoc.attachedTo as Ref<Task> },
    { projection: { kind: 1, status: 1 } }
  )
  if (parentTasks.length === 0) {
    return { ok: true }
  }

  const parentTask = parentTasks[0]
  const check = checkTaskTypeStatus(statusesMap, parentTask.kind, parentTask.status)
  if (!check.ok) {
    const flow = await getTransitionFlow(client, transition)
    const statusesStr = await getStatusNames(client, check.allowedStatuses)
    return {
      ok: false,
      reason: `Parent task must be in allowed statuses (${statusesStr}) for transition ${flow}.`,
      reasonIntl: workflow.string.ParentStatusError,
      intlParams: { transition: flow, statuses: statusesStr }
    }
  }

  return { ok: true }
}
