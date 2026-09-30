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

import {
  createRestTxOperations,
  getWorkspaceToken,
  loadServerConfig,
  type WorkspaceToken
} from '@hcengineering/api-client'
import contact, { type Person } from '@hcengineering/contact'
import core, {
  type AnyAttribute,
  type Class,
  generateId,
  type Mixin,
  type Ref,
  type Timestamp,
  type TxOperations
} from '@hcengineering/core'
import { makeRank } from '@hcengineering/rank'
import task, { type TaskType, type TimeManaged } from '@hcengineering/task'
import tracker, {
  IssuePriority,
  MilestoneStatus,
  type Component as TrackerComponent,
  type Issue,
  type IssueStatus,
  type Milestone,
  type Project
} from '@hcengineering/tracker'
import { PlatformURI, PlatformUser, PlatformWs } from '../utils'

export type StatusName = 'Backlog' | 'Todo' | 'In Progress' | 'Done' | 'Cancelled'

export interface ProjectContext {
  project: Project
  taskType: Ref<TaskType>
  statuses: Map<StatusName, Ref<IssueStatus>>
}

export interface CreateIssueOptions {
  title: string
  status: StatusName | Ref<IssueStatus>
  priority?: IssuePriority
  assignee?: Issue['assignee']
  parent?: Ref<Issue>
  rank?: string
  estimation?: number
  dueDate?: number | null
  space?: Ref<Project>
  component?: Ref<TrackerComponent> | null
  // The task type target class, as CreateIssue does; its custom fields are set via `attributes`
  _class?: Ref<Class<Issue>>
  attributes?: Record<string, unknown>
}

export async function connectTracker (
  workspace: string = PlatformWs,
  user: string = PlatformUser,
  password: string = '1234'
): Promise<{ client: TxOperations, workspaceToken: WorkspaceToken }> {
  const baseUrl = (PlatformURI ?? 'http://localhost:8083').replace(/\/$/, '')
  const config = await loadServerConfig(baseUrl)
  const workspaceToken = await getWorkspaceToken(baseUrl, { email: user, password, workspace }, config)
  const client = await createRestTxOperations(workspaceToken.endpoint, workspaceToken.workspaceId, workspaceToken.token)
  return { client, workspaceToken }
}

export async function findProjectByName (client: TxOperations, name: string): Promise<Project | undefined> {
  return await client.findOne(tracker.class.Project, { name })
}

export async function getProjectContext (
  client: TxOperations,
  projectRef: Ref<Project> = tracker.project.DefaultProject
): Promise<ProjectContext> {
  const project = await client.findOne(tracker.class.Project, { _id: projectRef })
  if (project === undefined) {
    throw new Error(`Project ${projectRef} not found`)
  }
  const taskTypes = await client.findAll(task.class.TaskType, { parent: project.type })
  const taskType = taskTypes[0]
  if (taskType === undefined) {
    throw new Error(`No TaskType found for project type ${project.type}`)
  }
  const allStatuses = await client.findAll(tracker.class.IssueStatus, { _id: { $in: taskType.statuses } })
  const byName = new Map<StatusName, Ref<IssueStatus>>()
  for (const s of allStatuses) {
    byName.set(s.name as StatusName, s._id)
  }
  if (!byName.has('Cancelled')) {
    const alt = allStatuses.find((s) => s.name === 'Canceled')
    if (alt !== undefined) byName.set('Cancelled', alt._id)
  }
  return { project, taskType: taskType._id, statuses: byName }
}

export async function createIssue (
  client: TxOperations,
  ctx: ProjectContext,
  opts: CreateIssueOptions
): Promise<Ref<Issue>> {
  const _id: Ref<Issue> = generateId()
  const status: Ref<IssueStatus> | undefined =
    typeof opts.status === 'string' && ctx.statuses.has(opts.status as StatusName)
      ? ctx.statuses.get(opts.status as StatusName)
      : (opts.status as Ref<IssueStatus>)
  if (status === undefined) {
    throw new Error(`Unknown status: ${String(opts.status)}`)
  }

  const space = opts.space ?? ctx.project._id
  const projectForId =
    space === ctx.project._id ? ctx.project : await client.findOne(tracker.class.Project, { _id: space })
  if (projectForId === undefined) {
    throw new Error(`Project ${space} not found`)
  }
  const incResult = await client.updateDoc(
    tracker.class.Project,
    core.space.Space,
    space,
    { $inc: { sequence: 1 } },
    true
  )
  const number = (incResult as any).object.sequence as number
  const identifier = `${projectForId.identifier}-${number}`

  let parents: Issue['parents'] = []
  if (opts.parent !== undefined) {
    const parent = await client.findOne(tracker.class.Issue, { _id: opts.parent })
    if (parent !== undefined) {
      parents = [
        { parentId: parent._id, parentTitle: parent.title, space: parent.space, identifier: parent.identifier },
        ...parent.parents
      ]
    }
  }

  await client.addCollection(
    opts._class ?? tracker.class.Issue,
    space,
    opts.parent ?? tracker.ids.NoParent,
    tracker.class.Issue,
    'subIssues',
    {
      title: opts.title,
      description: null,
      assignee: opts.assignee ?? null,
      component: opts.component ?? null,
      milestone: null,
      number,
      status,
      priority: opts.priority ?? IssuePriority.NoPriority,
      rank: opts.rank ?? makeRank(undefined, undefined),
      comments: 0,
      subIssues: 0,
      dueDate: opts.dueDate ?? null,
      parents,
      reportedTime: 0,
      remainingTime: 0,
      estimation: opts.estimation ?? 0,
      reports: 0,
      relations: [],
      childInfo: [],
      kind: ctx.taskType,
      identifier,
      ...opts.attributes
    },
    _id
  )

  return _id
}

export async function createComponent (
  client: TxOperations,
  space: Ref<Project>,
  label: string
): Promise<Ref<TrackerComponent>> {
  const _id: Ref<TrackerComponent> = generateId()
  await client.createDoc(
    tracker.class.Component,
    space,
    {
      label,
      description: null as any,
      lead: null,
      comments: 0,
      attachments: 0
    },
    _id
  )
  return _id
}

export async function deleteIssuesByTitlePrefix (client: TxOperations, prefix: string): Promise<number> {
  const issues = await client.findAll(tracker.class.Issue, { title: { $like: `${prefix}%` } })
  for (const issue of issues) {
    await client.removeCollection(
      issue._class,
      issue.space,
      issue._id,
      issue.attachedTo,
      issue.attachedToClass,
      issue.collection
    )
  }
  return issues.length
}

// Whether a comment counter that disagrees with the UI drifted on the server or only in the
// browser copy - the popup already says how many messages really exist.
export async function readStoredCommentCount (issueTitle: string): Promise<number | undefined> {
  const { client } = await connectTracker()
  try {
    return (await client.findOne(tracker.class.Issue, { title: issueTitle }))?.comments
  } finally {
    await client.close()
  }
}

/** Whether a component edit reached the server - the panel can render an unsaved value. */
export async function readComponentDescription (label: string): Promise<string | undefined> {
  const { client } = await connectTracker()
  try {
    return (await client.findOne(tracker.class.Component, { label }))?.description
  } finally {
    await client.close()
  }
}

/** A custom string field, as the class settings create one; `name` is the stored key. */
export async function createCustomStringAttribute (
  client: TxOperations,
  attributeOf: Ref<Class<Issue>>,
  label: string
): Promise<{ _id: Ref<AnyAttribute>, name: string }> {
  const name = `custom${generateId()}`
  const _id = await client.createDoc(core.class.Attribute, core.space.Model, {
    attributeOf,
    name,
    label: `embedded:embedded:${label}` as AnyAttribute['label'],
    type: { _class: core.class.TypeString, label: core.string.String, icon: core.icon.TypeString },
    isCustom: true
  })
  return { _id, name }
}

export async function removeAttribute (client: TxOperations, _id: Ref<AnyAttribute>): Promise<void> {
  await client.removeDoc(core.class.Attribute, core.space.Model, _id)
}

export async function createMilestone (
  client: TxOperations,
  space: Ref<Project>,
  opts: { label: string, startDate?: Timestamp, targetDate: Timestamp }
): Promise<Ref<Milestone>> {
  return await client.createDoc(tracker.class.Milestone, space, {
    label: opts.label,
    description: '',
    status: MilestoneStatus.Planned,
    comments: 0,
    attachments: 0,
    startDate: opts.startDate,
    targetDate: opts.targetDate
  })
}

const timeManaged = task.mixin.TimeManaged as unknown as Ref<Mixin<Issue & TimeManaged>>

/** Puts the issue on timelines: writes the TimeManaged mixin dates the server trigger would otherwise set. */
export async function setIssueDates (
  client: TxOperations,
  issueId: Ref<Issue>,
  dates: { startDate?: Timestamp, endDate?: Timestamp }
): Promise<void> {
  const issue = await client.findOne(tracker.class.Issue, { _id: issueId })
  if (issue === undefined) throw new Error(`Issue ${issueId} not found`)
  await client.createMixin(issue._id, issue._class, issue.space, timeManaged, dates)
}

export interface IssueDates {
  startDate?: Timestamp
  endDate?: Timestamp
  dueDate: Timestamp | null | undefined
}

/** Server-side dates of an issue, for polling after a UI action or a drag. */
export async function readIssueDates (client: TxOperations, issueId: Ref<Issue>): Promise<IssueDates | undefined> {
  const issue = await client.findOne(tracker.class.Issue, { _id: issueId })
  if (issue === undefined) return undefined
  const hierarchy = client.getHierarchy()
  const mixin = hierarchy.hasMixin(issue, timeManaged) ? hierarchy.as(issue, timeManaged) : undefined
  return { startDate: mixin?.startDate ?? undefined, endDate: mixin?.endDate ?? undefined, dueDate: issue.dueDate }
}

/** A seeded person by last name ('Appleseed' is the test user, 'Chen' the second member). */
export async function findPersonByLastName (client: TxOperations, lastName: string): Promise<Ref<Person>> {
  const person = await client.findOne(contact.class.Person, { name: { $like: `${lastName}%` } })
  if (person === undefined) throw new Error(`Person ${lastName} not found`)
  return person._id
}

export async function deleteMilestonesByLabelPrefix (client: TxOperations, prefix: string): Promise<number> {
  const milestones = await client.findAll(tracker.class.Milestone, { label: { $like: `${prefix}%` } })
  for (const milestone of milestones) {
    await client.remove(milestone)
  }
  return milestones.length
}
