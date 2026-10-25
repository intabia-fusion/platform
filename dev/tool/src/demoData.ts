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

// Populates a workspace with deterministic demo content (tracker, knowledge base, chat, planner)
// for taking stable user-documentation screenshots. Imports `dir` (Unified Format) and fills in
// what the importer cannot express (components, milestones, labels, due dates, chat, planner),
// reusing the account/planner helpers from plannerData.ts. The text/layout for all of that (which
// is the only part that differs between the ru and en demo sets) lives in a sibling `<dir>.data.yaml`
// file, not in this file - see tests/demo-ws.data.yaml / tests/demo-ws-en.data.yaml.
// No faker, no random suffixes: every date is relative to the run day, so a re-run on a fresh
// workspace produces the same data.

import {
  createRestClient,
  createRestTxOperations,
  getWorkspaceToken,
  loadServerConfig,
  type RestClient,
  type WorkspaceToken
} from '@hcengineering/api-client'
import { type RecurringRule } from '@hcengineering/calendar'
import chunter, { postMessage, type Channel, type ChatMessage } from '@hcengineering/chunter'
import { type Employee } from '@hcengineering/contact'
import core, { systemAccountUuid, TxOperations, type AccountUuid, type Ref } from '@hcengineering/core'
import { FrontFileUploader, HulyFormatImporter, type Logger } from '@hcengineering/importer'
import { generateToken } from '@hcengineering/server-token'
import { jsonToMarkup, MarkupNodeType } from '@hcengineering/text'
import tags, { type TagElement } from '@hcengineering/tags'
import tracker, {
  MilestoneStatus,
  type Component,
  type Issue,
  type Milestone,
  type Project
} from '@hcengineering/tracker'
import time, { type ProjectToDo } from '@hcengineering/time'
import { readFileSync } from 'fs'
import * as yaml from 'js-yaml'
import { resolve } from 'path'
import {
  createEventDoc,
  createPersonalTodo,
  createRecurringEventDoc,
  createWorkSlotDoc,
  dayStart,
  eventually,
  setupAccount,
  type PlannerAccount
} from './plannerData'
import { designDirFor, importDesignDemo } from './demoDesign'

class DemoLogger implements Logger {
  log (msg: string, data?: any): void {
    console.log(`[demo-data] ${msg}`, data)
  }

  warn (msg: string, data?: any): void {
    console.warn(`[demo-data] ${msg}`, data)
  }

  error (msg: string, data?: any): void {
    console.error(`[demo-data] ${msg}`, data)
  }
}

export interface GenerateDemoDataOptions {
  workspace: string
  platformUrl: string
  accountEmails: string[]
  password: string
  dir: string
  /** dev/design/demo/<lang> with the statuses, extra issues and boards of the mockups; 'none' skips it, default by `dir` */
  designDir?: string
}

/** The layout/text for a demo set, kept out of the importer's own folder as `<dir>.data.yaml` so the
 * importer (which treats every *.yaml in its folder as a space) never sees it. Account indices in
 * `channels[].messages[].author` are 1-based, matching the 4 accountEmails in order. */
interface DemoDataFile {
  components: Array<{ key: string, label: string }>
  milestones: Array<{ key: string, label: string, offsetDays: number }>
  issueComponents: Record<string, string>
  issueMilestones: Record<string, string>
  tags: Array<{ key: string, title: string, color: number }>
  issueLabels: Record<string, string[]>
  issueDueDates: Record<string, number>
  workSlotIssues: string[]
  channels: Array<{
    name: string
    topic: string
    description: string
    messages: Array<{
      author: number
      text: string
      replies?: Array<{ author: number, text: string }>
    }>
  }>
  personalTodos: string[][]
  events: Array<{
    title: string
    day: number | 'nextMonday'
    hourOffset: number
    durationMinutes: number
    recurring?: RecurringRule
  }>
}

function loadDemoData (resolvedDir: string): DemoDataFile {
  const dataPath = `${resolvedDir.replace(/\/+$/, '')}.data.yaml`
  return yaml.load(readFileSync(dataPath, 'utf8')) as DemoDataFile
}

/** Names match the demo set's accounts exactly: account 1 = lead, 2 = developer, 3 = designer, 4 = tester. */
export async function generateDemoData (opts: GenerateDemoDataOptions): Promise<void> {
  const { workspace, platformUrl, accountEmails, password, dir, designDir } = opts
  if (accountEmails.length !== 4) {
    throw new Error('need exactly 4 accounts: lead, developer, designer, tester')
  }
  console.log(`[demo-data] workspace=${workspace} accounts=${accountEmails.join(',')} dir=${dir}`)

  const resolvedDir = resolve(dir)
  const data = loadDemoData(resolvedDir)

  const config = await loadServerConfig(platformUrl)
  const tokens: WorkspaceToken[] = []
  for (const email of accountEmails) {
    tokens.push(await getWorkspaceToken(platformUrl, { email, password, workspace }, config))
  }
  const systemToken = generateToken(systemAccountUuid, tokens[0].workspaceId, { service: 'tool' })
  const systemRest = createRestClient(tokens[0].endpoint, tokens[0].workspaceId, systemToken)

  const accounts: PlannerAccount[] = []
  for (const token of tokens) {
    accounts.push(await setupAccount(token, config, systemRest))
    console.log(`[demo-data] account ready: ${token.info.account}`)
  }
  const [owner] = accounts
  const now = Date.now()

  console.log(`[demo-data] importing ${dir}`)
  const uploader = new FrontFileUploader(
    platformUrl,
    owner.token.workspaceId,
    owner.token.info.workspaceDataId ?? owner.token.workspaceId,
    owner.token.token
  )
  // Comments are written on behalf of their authors; only the system account may sign txes for others
  // (IdentityMiddleware), while everything else stays attributed to the owner.
  const systemTx = await createRestTxOperations(tokens[0].endpoint, tokens[0].workspaceId, systemToken)
  const importClient = new TxOperations(systemTx.client, owner.primary)
  const importer = new HulyFormatImporter(importClient, uploader, new DemoLogger())
  await importer.importFolder(resolvedDir)
  console.log('[demo-data] import done')

  await enrichTracker(owner.client, now, data)
  if (designDir !== 'none') {
    await importDesignDemo(designDir ?? designDirFor(dir), accounts, new DemoLogger(), uploader)
  }
  await createChat(accounts, data.channels)
  await createPlannerData(systemRest, accounts, data, now)

  console.log('[demo-data] done')
}

async function findProject (client: TxOperations, identifier: string): Promise<Project> {
  const project = await client.findOne(tracker.class.Project, { identifier })
  if (project === undefined) throw new Error(`project not found: ${identifier}`)
  return project
}

async function findIssue (client: TxOperations, identifier: string): Promise<Issue> {
  const issue = await client.findOne(tracker.class.Issue, { identifier })
  if (issue === undefined) throw new Error(`issue not found: ${identifier}`)
  return issue
}

async function createComponent (
  client: TxOperations,
  project: Ref<Project>,
  label: string,
  lead: Ref<Employee> | null
): Promise<Ref<Component>> {
  return await client.createDoc(tracker.class.Component, project, { label, description: '', lead, comments: 0 })
}

async function createMilestone (
  client: TxOperations,
  project: Ref<Project>,
  label: string,
  targetDate: number
): Promise<Ref<Milestone>> {
  return await client.createDoc(tracker.class.Milestone, project, {
    label,
    description: '',
    status: MilestoneStatus.Planned,
    targetDate,
    comments: 0
  })
}

async function createTag (client: TxOperations, title: string, color: number): Promise<Ref<TagElement>> {
  return await client.createDoc(tags.class.TagElement, core.space.Workspace, {
    title,
    description: '',
    targetClass: tracker.class.Issue,
    color,
    category: tags.category.NoCategory
  })
}

/** The importer has no component/milestone/label/dueDate columns, so issues are looked up by identifier afterwards. */
async function enrichTracker (client: TxOperations, now: number, data: DemoDataFile): Promise<void> {
  // The model migration seeds an empty DEFAULT project into every workspace; archived, it stays out of screenshots.
  await client.updateDoc(tracker.class.Project, core.space.Space, tracker.project.DefaultProject, { archived: true })
  const app = await findProject(client, 'APP')

  const componentByKey = new Map<string, Ref<Component>>()
  for (const def of data.components) {
    componentByKey.set(def.key, await createComponent(client, app._id, def.label, null))
  }
  console.log(`[demo-data] components: ${data.components.map((c) => c.label).join(', ')}`)

  const milestoneByKey = new Map<string, Ref<Milestone>>()
  for (const def of data.milestones) {
    milestoneByKey.set(def.key, await createMilestone(client, app._id, def.label, dayStart(now, def.offsetDays)))
  }
  console.log(`[demo-data] milestones: ${data.milestones.map((m) => m.label).join(', ')}`)

  for (const [identifier, key] of Object.entries(data.issueComponents)) {
    const component = componentByKey.get(key)
    if (component === undefined) continue
    const issue = await findIssue(client, identifier)
    await client.updateDoc(tracker.class.Issue, issue.space, issue._id, { component })
  }

  for (const [identifier, key] of Object.entries(data.issueMilestones)) {
    const milestone = milestoneByKey.get(key)
    if (milestone === undefined) continue
    const issue = await findIssue(client, identifier)
    await client.updateDoc(tracker.class.Issue, issue.space, issue._id, { milestone })
  }
  console.log('[demo-data] issues assigned to components/milestones')

  const tagByKey = new Map<string, { id: Ref<TagElement>, title: string, color: number }>()
  for (const def of data.tags) {
    tagByKey.set(def.key, { id: await createTag(client, def.title, def.color), title: def.title, color: def.color })
  }
  for (const [identifier, keys] of Object.entries(data.issueLabels)) {
    const issue = await findIssue(client, identifier)
    for (const key of keys) {
      const tag = tagByKey.get(key)
      if (tag === undefined) continue
      await client.addCollection(tags.class.TagReference, issue.space, issue._id, issue._class, 'labels', {
        tag: tag.id,
        title: tag.title,
        color: tag.color
      })
    }
  }
  console.log(`[demo-data] labels: ${data.tags.map((t) => t.title).join(', ')}`)

  for (const [identifier, offsetDays] of Object.entries(data.issueDueDates)) {
    const issue = await findIssue(client, identifier)
    await client.updateDoc(tracker.class.Issue, issue.space, issue._id, { dueDate: dayStart(now, offsetDays) })
  }
  console.log('[demo-data] due dates set')
}

async function createChannel (
  client: TxOperations,
  name: string,
  topic: string,
  description: string,
  members: AccountUuid[]
): Promise<Channel> {
  const id = await client.createDoc(chunter.class.Channel, core.space.Space, {
    name,
    description,
    topic,
    private: false,
    members,
    archived: false,
    autoJoin: false
  })
  const channel = await client.findOne(chunter.class.Channel, { _id: id })
  if (channel === undefined) throw new Error(`channel not found right after creation: ${name}`)
  return channel
}

// Chat messages are editor markup, as the composer writes them: plain text that happens to start with "{"
// would otherwise render as an empty message (markupToJSON).
function textMarkup (text: string): string {
  return jsonToMarkup({
    type: MarkupNodeType.doc,
    content: [{ type: MarkupNodeType.paragraph, content: [{ type: MarkupNodeType.text, text }] }]
  })
}

async function postReply (
  client: TxOperations,
  channel: Channel,
  parent: Ref<ChatMessage>,
  message: string
): Promise<void> {
  await client.addCollection(chunter.class.ThreadMessage, channel._id, parent, chunter.class.ChatMessage, 'replies', {
    message: textMarkup(message),
    objectId: channel._id,
    objectClass: chunter.class.Channel
  })
}

/** Each message is posted through its author's own client, so the channel shows 4 distinct people. */
async function createChat (accounts: PlannerAccount[], channels: DemoDataFile['channels']): Promise<void> {
  const memberUuids = accounts.map((a) => a.token.info.account)
  for (const def of channels) {
    const channel = await createChannel(accounts[0].client, def.name, def.topic, def.description, memberUuids)
    let replyCount = 0
    for (const msg of def.messages) {
      const id = await postMessage(accounts[msg.author - 1].client, channel, textMarkup(msg.text))
      for (const reply of msg.replies ?? []) {
        await postReply(accounts[reply.author - 1].client, channel, id, reply.text)
        replyCount++
      }
    }
    const thread = replyCount > 0 ? ` + тред из ${replyCount} ответов` : ''
    console.log(`[demo-data] channel "${def.name}": ${def.messages.length} сообщений${thread}`)
  }
}

/** Business-week offsets (today..+4 days), cycled across the in-progress issues below. */
function weekOffset (i: number): number {
  return i % 5
}

async function createProjectWorkSlots (
  systemRest: RestClient,
  accounts: PlannerAccount[],
  workSlotIssues: string[],
  now: number
): Promise<void> {
  const byPerson = new Map(accounts.map((a) => [a.person._id, a]))
  for (let i = 0; i < workSlotIssues.length; i++) {
    const issue = await systemRest.findOne(tracker.class.Issue, { identifier: workSlotIssues[i] })
    if (issue?.assignee == null) continue
    const owner = byPerson.get(issue.assignee)
    if (owner === undefined) continue
    // IssueToDoFactory creates the ProjectToDo asynchronously once the issue is In Progress.
    const todo = await eventually<ProjectToDo>(
      async () => await systemRest.findOne(time.class.ProjectToDo, { attachedTo: issue._id })
    )
    const date = dayStart(now, weekOffset(i))
    await createWorkSlotDoc(owner, todo, date, date + 45 * 60 * 1000, [owner.person._id])
  }
  console.log(`[demo-data] work slots for ${workSlotIssues.length} in-progress issues`)
}

async function createPersonalTodos (accounts: PlannerAccount[], personalTodos: string[][], now: number): Promise<void> {
  for (let i = 0; i < accounts.length; i++) {
    const owner = accounts[i]
    for (let j = 0; j < personalTodos[i].length; j++) {
      const title = personalTodos[i][j]
      const todoId = await createPersonalTodo(owner, title)
      const date = dayStart(now, j)
      await createWorkSlotDoc(
        owner,
        { _id: todoId, _class: time.class.ToDo, attachedSpace: undefined, title, visibility: 'private' },
        date,
        date + 30 * 60 * 1000,
        [owner.person._id]
      )
    }
  }
  console.log('[demo-data] personal todos: 2 per account')
}

/** Day index (0=Sunday) of the next Monday on/after `now`. */
function daysUntilMonday (now: number): number {
  return (8 - new Date(now).getDay()) % 7
}

async function createEvents (accounts: PlannerAccount[], events: DemoDataFile['events'], now: number): Promise<void> {
  const owner = accounts[0]
  const allPersonRefs = accounts.map((a) => a.person._id)

  for (const def of events) {
    const day = def.day === 'nextMonday' ? daysUntilMonday(now) : def.day
    const date = dayStart(now, day) + def.hourOffset * 60 * 60 * 1000
    const dueDate = date + def.durationMinutes * 60 * 1000
    if (def.recurring !== undefined) {
      await createRecurringEventDoc(owner, def.title, date, dueDate, allPersonRefs, [def.recurring])
    } else {
      await createEventDoc(owner, def.title, date, dueDate, allPersonRefs)
    }
  }
  console.log(`[demo-data] events: ${events.map((e) => e.title).join(', ')}`)
}

async function createPlannerData (
  systemRest: RestClient,
  accounts: PlannerAccount[],
  data: DemoDataFile,
  now: number
): Promise<void> {
  await createProjectWorkSlots(systemRest, accounts, data.workSlotIssues, now)
  await createPersonalTodos(accounts, data.personalTodos, now)
  await createEvents(accounts, data.events, now)
}
