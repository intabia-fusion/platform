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

import type { Employee } from '@hcengineering/contact'
import type { AccountUuid, Data, Doc, Ref, RolesAssignment } from '@hcengineering/core'
import type { TaskType } from '@hcengineering/task'
import type { Component, Issue, IssueStatus, IssueTemplate, IssueTemplateData, Milestone } from '@hcengineering/tracker'
import type { Workflow } from '@hcengineering/workflow'

import { mergeOwners } from './projectSettingsLogic'

/** What a new project takes from the base project. */
export interface CopyOptions {
  members: boolean
  privacy: boolean
  defaults: boolean
  workflows: boolean
  components: boolean
  milestones: boolean
  templates: Array<Ref<IssueTemplate>>
}

/** Settings of the base project as the wizard needs them. */
export interface BaseSettings {
  members: AccountUuid[]
  owners: AccountUuid[]
  assignment: RolesAssignment
  isPrivate: boolean
  defaultAssignee: Ref<Employee> | undefined
  defaultStatus: Ref<IssueStatus> | undefined
  workflows: Record<Ref<TaskType>, Ref<Workflow>>
}

/** Settings and templates on, components and milestones off, as the base step opens. */
export function defaultCopyOptions (templates: Array<Ref<IssueTemplate>>): CopyOptions {
  return {
    members: true,
    privacy: true,
    defaults: true,
    workflows: true,
    components: false,
    milestones: false,
    templates
  }
}

/**
 * Wizard settings of the new project: the checked groups from the base, the rest empty.
 * The creator is a member and an owner.
 */
export function settingsFromBase (base: BaseSettings | undefined, options: CopyOptions, me: AccountUuid): BaseSettings {
  const takeMembers = base !== undefined && options.members
  const owners = takeMembers ? mergeOwners([me], base.owners) : [me]
  return {
    members: takeMembers ? mergeOwners(mergeOwners([me], base.members), owners) : [me],
    owners,
    assignment: takeMembers ? base.assignment : {},
    isPrivate: base !== undefined && options.privacy ? base.isPrivate : false,
    defaultAssignee: base !== undefined && options.defaults ? base.defaultAssignee : undefined,
    defaultStatus: base !== undefined && options.defaults ? base.defaultStatus : undefined,
    workflows: base !== undefined && options.workflows ? base.workflows : {}
  }
}

/** The assignee taken from the base stays only while they are a member of the new project. */
export function keepAssignee (
  assignee: Ref<Employee> | undefined,
  memberEmployees: Array<Ref<Employee> | undefined>
): Ref<Employee> | undefined {
  return assignee !== undefined && memberEmployees.includes(assignee) ? assignee : undefined
}

/** Whether all, some or none of the templates are chosen: the group checkbox state. */
export function selectionState (selected: unknown[], all: unknown[]): 'all' | 'some' | 'none' {
  const count = all.filter((it) => selected.includes(it)).length
  if (count === 0) return 'none'
  return count === all.length ? 'all' : 'some'
}

/** A reference to a base component or milestone: its copy, or none when it is not copied. */
export function translateRef<T extends Doc> (
  ref: Ref<T> | null | undefined,
  copies: Map<Ref<T>, Ref<T>>
): Ref<T> | null | undefined {
  if (ref == null) return ref
  return copies.get(ref) ?? null
}

function templateFields (
  data: IssueTemplateData,
  components: Map<Ref<Component>, Ref<Component>>,
  milestones: Map<Ref<Milestone>, Ref<Milestone>>
): IssueTemplateData {
  return {
    title: data.title,
    description: data.description,
    priority: data.priority,
    assignee: data.assignee,
    component: translateRef(data.component, components) ?? null,
    milestone: translateRef(data.milestone, milestones),
    estimation: data.estimation,
    labels: data.labels,
    kind: data.kind
  }
}

/** A template copy: references go to the copied components and milestones or are cleared. */
export function copyTemplate (
  template: IssueTemplate,
  components: Map<Ref<Component>, Ref<Component>>,
  milestones: Map<Ref<Milestone>, Ref<Milestone>>,
  newChildId: () => Ref<Issue>
): Data<IssueTemplate> {
  // dueDate is in the model class, not in the interface
  const { dueDate } = template as IssueTemplate & { dueDate?: number | null }
  return {
    ...templateFields(template, components, milestones),
    children: template.children.map((child) => ({
      ...templateFields(child, components, milestones),
      id: newChildId()
    })),
    comments: 0,
    attachments: 0,
    relations: template.relations ?? [],
    ...(dueDate !== undefined ? { dueDate } : {})
  }
}
