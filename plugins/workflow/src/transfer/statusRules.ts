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

import core, { type Ref, type Status, type StatusCategory, type TxOperations } from '@hcengineering/core'
import { type IntlString, translate } from '@hcengineering/platform'
import task, { type ProjectType, type TaskType } from '@hcengineering/task'

import workflow from '../plugin'
import type { TaskStatusesProps, WorkflowRule, WorkflowTransition } from '../schema'
import { StatusToken, TaskTypeToken } from './resolver'
import type { ImportWarning, StatusConfig, WorkflowConfig } from './types'
import { shortRuleName } from './validation'

// Rule rows point at task types and statuses another project type may lack; categories exist everywhere

export function isStatusRule (rule: Ref<WorkflowRule>): boolean {
  return rule === workflow.validator.SubtaskStatus || rule === workflow.validator.ParentStatus
}

/** Statuses named by subtask and parent status rules: the config keeps them for their categories. */
export function collectRuleStatusIds (transitions: Array<Pick<WorkflowTransition, 'validators'>>): Set<Ref<Status>> {
  const ids = new Set<Ref<Status>>()
  for (const t of transitions) {
    for (const r of t.validators ?? []) {
      if (!isStatusRule(r.rule)) continue
      for (const statuses of Object.values(recordOf(r.props?.statuses))) {
        for (const s of stringsOf(statuses)) ids.add(s as Ref<Status>)
      }
    }
  }
  return ids
}

export interface StatusRuleTarget {
  taskTypes: TaskType[]
  statusesOf: Map<Ref<TaskType>, Status[]>
  /** Source statuses of the config by id and by lower-case name, for the category fallback. */
  sourceById: Map<string, StatusConfig>
  sourceByName: Map<string, StatusConfig>
  isCategory: (ref: string) => boolean
  /** The status mapping of the import wizard, it covers the task type the workflow is imported into. */
  mapping?: { taskType: Ref<TaskType>, statusOf: (sourceId: Ref<Status>) => Ref<Status> | undefined }
}

export async function loadStatusRuleTarget (
  client: TxOperations,
  projectTypeId: Ref<ProjectType>,
  config: WorkflowConfig
): Promise<StatusRuleTarget> {
  const taskTypes = await client.findAll(task.class.TaskType, { parent: projectTypeId })
  const statusIds = taskTypes.flatMap((tt) => tt.statuses ?? [])
  const statuses =
    statusIds.length > 0
      ? await client.findAll(core.class.Status, { _id: { $in: Array.from(new Set(statusIds)) } })
      : []
  const statusById = new Map(statuses.map((s) => [s._id, s]))
  const statusesOf = new Map<Ref<TaskType>, Status[]>()
  for (const tt of taskTypes) {
    statusesOf.set(
      tt._id,
      (tt.statuses ?? []).map((id) => statusById.get(id)).filter((s): s is Status => s !== undefined)
    )
  }

  const sourceById = new Map<string, StatusConfig>()
  const sourceByName = new Map<string, StatusConfig>()
  for (const sc of [...(config.ruleStatuses ?? []), ...(config.statuses ?? [])]) {
    if (!sourceById.has(sc.id)) sourceById.set(sc.id, sc)
    if (!sourceByName.has(normalize(sc.name))) sourceByName.set(normalize(sc.name), sc)
  }

  const hierarchy = client.getHierarchy()
  const isCategory = (ref: string): boolean => {
    const doc = client.getModel().findObject(ref as Ref<StatusCategory>)
    return doc !== undefined && hierarchy.isDerived(doc._class, core.class.StatusCategory)
  }

  return { taskTypes, statusesOf, sourceById, sourceByName, isCategory }
}

/** Rows of the workflow's own task type follow the status mapping, like its transitions do. */
export function withStatusMapping (
  target: StatusRuleTarget,
  config: WorkflowConfig,
  taskType: Ref<TaskType>,
  statusOf: (sourceId: Ref<Status>) => Ref<Status> | undefined
): StatusRuleTarget {
  // The mapping is keyed by the ids of the workflow statuses, a rule names them
  const ids = new Set<string>()
  const idByName = new Map<string, Ref<Status>>()
  for (const sc of config.statuses ?? []) {
    ids.add(sc.id)
    if (!idByName.has(normalize(sc.name))) idByName.set(normalize(sc.name), sc.id)
  }
  const sourceIdOf = (ref: string): Ref<Status> | undefined => {
    if (ref.startsWith(StatusToken)) return idByName.get(normalize(ref.slice(StatusToken.length)))
    return ids.has(ref) ? (ref as Ref<Status>) : undefined
  }
  return {
    ...target,
    mapping: {
      taskType,
      statusOf: (ref) => {
        const sourceId = sourceIdOf(ref)
        return sourceId !== undefined ? statusOf(sourceId) : undefined
      }
    }
  }
}

export type StatusRuleIssue =
  | { kind: 'taskType', taskType: string }
  | { kind: 'category', taskType: string, status: string, category: Ref<StatusCategory> }
  | { kind: 'status', taskType: string, status: string }

export interface RemappedStatusRule {
  /** Absent when nothing of the rule is left. */
  props?: TaskStatusesProps
  issues: StatusRuleIssue[]
}

export function remapStatusRuleProps (props: Record<string, any>, target: StatusRuleTarget): RemappedStatusRule {
  const issues = new Map<string, StatusRuleIssue>()
  const report = (issue: StatusRuleIssue): void => {
    issues.set(JSON.stringify(issue), issue)
  }
  const statuses: TaskStatusesProps['statuses'] = {}
  const categories: Record<Ref<TaskType>, Ref<StatusCategory>[]> = {}
  const addCategories = (taskType: Ref<TaskType>, list: Ref<StatusCategory>[]): void => {
    if (list.length > 0) categories[taskType] = Array.from(new Set([...(categories[taskType] ?? []), ...list]))
  }

  for (const [key, value] of Object.entries(recordOf(props.statuses))) {
    const taskType = findTaskType(key, target)
    if (taskType === undefined) {
      report({ kind: 'taskType', taskType: keyName(key) })
      continue
    }
    if (value === null || statuses[taskType._id] === null) {
      statuses[taskType._id] = null
      continue
    }
    const own = target.statusesOf.get(taskType._id) ?? []
    const resolved: Ref<Status>[] = []
    for (const ref of stringsOf(value)) {
      const mapped = target.mapping?.taskType === taskType._id ? target.mapping.statusOf(ref as Ref<Status>) : undefined
      if (mapped !== undefined) {
        resolved.push(mapped)
        continue
      }
      if (own.some((s) => s._id === ref)) {
        resolved.push(ref as Ref<Status>)
        continue
      }
      const source = ref.startsWith(StatusToken) ? undefined : target.sourceById.get(ref)
      const name = ref.startsWith(StatusToken) ? ref.slice(StatusToken.length) : (source?.name ?? ref)
      const byName = own.find((s) => normalize(s.name) === normalize(name))
      if (byName !== undefined) {
        resolved.push(byName._id)
        continue
      }
      const category = (source ?? target.sourceByName.get(normalize(name)))?.category
      // A category the task type has no status in would block every subtask of this type
      if (category !== undefined && own.some((s) => s.category === category)) {
        addCategories(taskType._id, [category])
        report({ kind: 'category', taskType: taskType.name, status: name, category })
      } else {
        report({ kind: 'status', taskType: taskType.name, status: name })
      }
    }
    if (resolved.length > 0) {
      statuses[taskType._id] = Array.from(new Set([...(statuses[taskType._id] ?? []), ...resolved]))
    }
  }

  for (const [key, value] of Object.entries(recordOf(props.categories))) {
    const taskType = findTaskType(key, target)
    if (taskType === undefined) {
      report({ kind: 'taskType', taskType: keyName(key) })
      continue
    }
    // Categories are the same on every platform, an unknown one can only come from a broken file
    addCategories(taskType._id, stringsOf(value).filter(target.isCategory) as Array<Ref<StatusCategory>>)
  }

  const defaultCategories = stringsOf(props.defaultCategories).filter(target.isCategory) as Array<Ref<StatusCategory>>

  const result: RemappedStatusRule = { issues: Array.from(issues.values()) }
  if (Object.keys(statuses).length > 0 || Object.keys(categories).length > 0 || defaultCategories.length > 0) {
    result.props = {
      statuses,
      ...(Object.keys(categories).length > 0 ? { categories } : {}),
      ...(defaultCategories.length > 0 ? { defaultCategories } : {})
    }
  }
  return result
}

/** Everything a status rule loses or changes on import, for the import wizard. */
export async function getStatusRuleWarnings (
  client: TxOperations,
  config: WorkflowConfig,
  target: StatusRuleTarget
): Promise<ImportWarning[]> {
  const warnings = new Map<string, ImportWarning>()
  for (const wf of config.workflows) {
    for (const t of wf.transitions ?? []) {
      for (const r of t.validators ?? []) {
        if (!isStatusRule(r.rule)) continue
        for (const issue of remapStatusRuleProps(r.props, target).issues) {
          const params: Record<string, string> = {
            rule: shortRuleName(r.rule),
            transition: t.name,
            taskType: issue.taskType
          }
          let message: IntlString = workflow.string.ImportWarningRuleTaskTypeMissing
          if (issue.kind === 'category') {
            message = workflow.string.ImportWarningRuleStatusToCategory
            params.status = issue.status
            params.category = await categoryName(client, issue.category)
          } else if (issue.kind === 'status') {
            message = workflow.string.ImportWarningRuleStatusMissing
            params.status = issue.status
          }
          warnings.set(JSON.stringify([message, params]), { kind: 'rule', message, params })
        }
      }
    }
  }
  return Array.from(warnings.values())
}

async function categoryName (client: TxOperations, category: Ref<StatusCategory>): Promise<string> {
  const label = client.getModel().findObject(category)?.label
  return label !== undefined ? await translate(label, {}) : category
}

function findTaskType (key: string, target: StatusRuleTarget): TaskType | undefined {
  if (!key.startsWith(TaskTypeToken)) return target.taskTypes.find((tt) => tt._id === key)
  const name = normalize(key.slice(TaskTypeToken.length))
  return target.taskTypes.find((tt) => normalize(tt.name) === name)
}

function keyName (key: string): string {
  return key.startsWith(TaskTypeToken) ? key.slice(TaskTypeToken.length) : key
}

function normalize (name: string): string {
  return name.trim().toLowerCase()
}

function recordOf (value: unknown): Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function stringsOf (value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v !== '') : []
}
