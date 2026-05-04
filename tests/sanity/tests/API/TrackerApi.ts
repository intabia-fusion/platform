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
import core, { generateId, type Ref, type TxOperations } from '@hcengineering/core'
import { makeRank } from '@hcengineering/rank'
import task, { type TaskType } from '@hcengineering/task'
import tracker, {
  IssuePriority,
  type Component as TrackerComponent,
  type Issue,
  type IssueStatus,
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
    tracker.class.Issue,
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
      identifier
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
