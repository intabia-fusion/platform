//
// Copyright © 2026 Intabia Fusion.
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//

// QA data generator: synthetic tracker Issues through the server pipeline.
// number/identifier have no server trigger - the client assigns them, so we replicate that.

import { faker } from '@faker-js/faker'
import core, {
  type Data,
  type AccountUuid,
  buildSocialIdString,
  generateId,
  makeCollabId,
  type MeasureContext,
  type Metrics,
  type PersonId,
  type Ref,
  SocialIdType,
  type Space,
  type Tx,
  TxOperations,
  type WorkspaceIds
} from '@hcengineering/core'
import contact, { AvatarType, combineName, type Person } from '@hcengineering/contact'
import chunter from '@hcengineering/chunter'
import love, { MeetingStatus, RecordingState, TranscriptionState } from '@hcengineering/love'
import { makeRank } from '@hcengineering/rank'
import { jsonToMarkup } from '@hcengineering/text'
import { markdownToMarkup } from '@hcengineering/text-markdown'
import { saveCollabJson } from '@hcengineering/collaboration'
import { type Pipeline, type StorageAdapter, wrapPipeline } from '@hcengineering/server-core'
import { createServerPipeline } from '@hcengineering/server-pipeline'
import { buildStorageFromConfig, storageConfigFromEnv } from '@hcengineering/server-storage'
import task, { type TaskType } from '@hcengineering/task'
import tracker, { type Issue, type IssueParentInfo, type Project } from '@hcengineering/tracker'

const PRIORITIES = [0, 1, 2, 3, 4]

interface BenchUser {
  personId: PersonId
  person: Ref<Person>
  name: string
}

// Find-or-create N bench employees; deterministic email key makes a re-run reuse them.
// SocialIdentity._id is explicit: it becomes modifiedBy so docs resolve to a real Person.
async function ensureBenchUsers (ops: TxOperations, count: number): Promise<BenchUser[]> {
  const users: BenchUser[] = []
  for (let i = 0; i < count; i++) {
    const value = `bench-user-${i}@bench.local`
    const key = buildSocialIdString({ type: SocialIdType.EMAIL, value } as any)
    const existing = await ops.findOne(contact.class.SocialIdentity, { key })
    if (existing !== undefined) {
      const p = await ops.findOne(contact.class.Person, { _id: existing.attachedTo })
      users.push({ personId: existing._id, person: existing.attachedTo, name: p?.name ?? value })
      continue
    }
    const name = combineName(faker.person.firstName(), faker.person.lastName())
    const personRef = await ops.createDoc(contact.class.Person, contact.space.Contacts, {
      name,
      city: '',
      avatarType: AvatarType.COLOR,
      personUuid: generateId() as unknown as AccountUuid
    } as any)
    await ops.createMixin(personRef, contact.class.Person, contact.space.Contacts, contact.mixin.Employee, {
      active: true,
      role: 'USER'
    } as any)
    const sid = `bench-user-${i}` as PersonId
    await ops.addCollection(
      contact.class.SocialIdentity,
      contact.space.Contacts,
      personRef,
      contact.class.Person,
      'socialIds',
      { type: SocialIdType.EMAIL, value, key, verifiedOn: Date.now(), isDeleted: false } as any,
      sid as any
    )
    users.push({ personId: sid, person: personRef, name })
  }
  return users
}

// Build a pipeline-backed TxOperations and run `fn`, closing everything after.
async function withGenOps<T> (
  ctx: MeasureContext,
  dbUrl: string,
  txes: Tx[],
  wsIds: WorkspaceIds,
  fn: (ops: TxOperations, storage: StorageAdapter) => Promise<T>
): Promise<T> {
  const storage = buildStorageFromConfig(storageConfigFromEnv())
  let pipeline: Pipeline | undefined
  try {
    const factory = createServerPipeline(ctx, dbUrl, txes, { externalStorage: storage, usePassedCtx: true })
    pipeline = await factory(ctx, wsIds, { broadcast: () => {}, broadcastSessions: () => {} }, null)
    const client = wrapPipeline(ctx, pipeline, wsIds, false)
    return await fn(new TxOperations(client, core.account.System), storage)
  } finally {
    await pipeline?.close()
    await storage.close()
  }
}

function randInt (min: number, max: number): number {
  return min + Math.floor(faker.number.float({ min: 0, max: 1 }) * (max - min + 1))
}

// ChatMessage.message is Markup (ProseMirror JSON string), not raw HTML.
function mkMsg (text: string): string {
  return jsonToMarkup(markdownToMarkup(text))
}

function makeAttributes (statusId: Ref<any>, kind: Ref<TaskType>, i: number): Data<Issue> {
  return {
    title: `Generated issue ${i}`,
    description: null,
    status: statusId,
    priority: PRIORITIES[i % PRIORITIES.length],
    number: 0, // assigned by trigger
    assignee: null,
    component: null,
    milestone: null,
    subIssues: 0,
    parents: [],
    reportedTime: 0,
    remainingTime: 0,
    estimation: 0,
    reports: 0,
    childInfo: [],
    dueDate: null,
    kind,
    rank: '', // assigned by RankMiddleware
    identifier: '' // assigned by trigger
  } as unknown as Data<Issue>
}

export interface GenResult {
  workspace: string
  count: number
  batchSize: number
  ms: number
  rate: number
}

interface ProjectRefs {
  project: Project
  projectSpace: Ref<Space>
  kind: Ref<TaskType>
  statusId: Ref<any>
  // All statuses of the task type, for random per-issue assignment.
  statuses: Array<Ref<any>>
  // Weighted status picker (mostly Done etc).
  pickStatus: () => Ref<any>
  identifier: string
  // Created in THIS run: not in the pipeline's space-security cache (built at
  // init), so security-filtered count queries on it are unreliable - treat as empty.
  isNew: boolean
  // A real workspace account to own/join generated meetings so they show in UI.
  account?: AccountUuid
}

// Group a task type's statuses into our five category buckets.
async function groupStatusesByBucket (
  ops: TxOperations,
  statusIds: Array<Ref<any>>
): Promise<Map<keyof StatusDist, Array<Ref<any>>>> {
  const byBucket = new Map<keyof StatusDist, Array<Ref<any>>>()
  if (statusIds.length === 0) return byBucket
  const statusDocs = await ops.findAll(core.class.Status, { _id: { $in: statusIds } })
  for (const s of statusDocs) {
    const bucket = categoryBucket(s.category)
    if (bucket === undefined) continue
    const arr = byBucket.get(bucket) ?? []
    arr.push(s._id)
    byBucket.set(bucket, arr)
  }
  return byBucket
}

// Resolve the base project + its task type, then ensure `count` projects total
// (creating extra ones that share the base project's type/task type/statuses).
async function resolveProjects (
  ctx: MeasureContext,
  ops: TxOperations,
  wsUuid: string,
  count: number,
  dist: StatusDist
): Promise<{ projects: ProjectRefs[], account?: AccountUuid }> {
  // Prefer a real (non-bench) project as base, so re-runs pick the same one and
  // don't treat a bench project as base (which would double-fill it).
  const base = ((await ops.findOne(tracker.class.Project, { description: { $ne: 'bench-generated' } as any })) ??
    (await ops.findOne(tracker.class.Project, {}))) as Project | undefined
  if (base == null) {
    throw new Error(`workspace ${wsUuid}: no tracker Project found (create one first)`)
  }
  const taskType =
    (await ops.findOne(task.class.TaskType, { parent: base.type, ofClass: tracker.class.Issue })) ??
    (await ops.findOne(task.class.TaskType, { parent: base.type }))
  const statusId = base.defaultIssueStatus ?? (taskType as TaskType | undefined)?.statuses?.[0]
  if (taskType?._id == null || statusId == null) {
    throw new Error(`workspace ${wsUuid}: project ${base._id} has no usable TaskType/status`)
  }
  const statuses = ((taskType as TaskType).statuses ?? []).filter((s) => s != null)
  const byBucket = await groupStatusesByBucket(ops, statuses)

  // A real account with membership, so generated meetings are visible in UI.
  const spaces = await ops.findAll(core.class.Space, {}, { limit: 200 })
  let account: AccountUuid | undefined
  for (const sp of spaces) {
    const m = (sp.members ?? []).find((x) => x != null)
    if (m != null) {
      account = m
      break
    }
  }
  const members = account != null ? [account] : []

  const mk = (project: Project, isNew: boolean): ProjectRefs => ({
    project,
    projectSpace: project._id as unknown as Ref<Space>,
    kind: taskType._id,
    statusId,
    statuses: statuses.length > 0 ? statuses : [statusId],
    pickStatus: makeStatusPicker(byBucket, dist, statusId),
    identifier: project.identifier,
    isNew,
    account
  })

  const projects: ProjectRefs[] = [mk(base, false)]
  const seen = new Set<Ref<Project>>([base._id])
  // Sort by BN<n> so the project->cohort mapping stays stable across resumes,
  // otherwise a re-run remaps sizes and churns fills.
  const existing = (await ops.findAll(tracker.class.Project, { description: 'bench-generated' })) as Project[]
  const numId = (id: string | undefined): number => {
    const n = parseInt((id ?? '').replace(/\D/g, ''), 10)
    return Number.isNaN(n) ? 0 : n
  }
  existing.sort((a, b) => numId(a.identifier) - numId(b.identifier))
  for (const p of existing) {
    if (projects.length >= count) break
    if (seen.has(p._id)) continue
    seen.add(p._id)
    projects.push(mk(p, false))
  }
  const typeMixin = `${base.type}:type:mixin` as Ref<any>
  let idx = existing.length
  while (projects.length < count) {
    idx++
    const projectId = generateId<Project>()
    const identifier = `BN${idx}`
    await ops.createDoc(
      tracker.class.Project,
      core.space.Space,
      {
        name: `Bench Project ${idx}`,
        description: 'bench-generated',
        private: false,
        members,
        owners: members,
        archived: false,
        autoJoin: false,
        identifier,
        sequence: 0,
        defaultIssueStatus: statusId,
        defaultTimeReportDay: 0,
        type: base.type
      } as any,
      projectId
    )
    await ops.createMixin(projectId, tracker.class.Project, core.space.Space, typeMixin, {})
    const created = (await ops.findOne(tracker.class.Project, { _id: projectId })) as Project
    projects.push(mk(created, true))
    ctx.info('created bench project', { identifier, _id: projectId })
  }
  return { projects: projects.slice(0, count), account }
}

export async function generateIssues (
  ctx: MeasureContext,
  dbUrl: string,
  txes: Tx[],
  wsIds: WorkspaceIds,
  count: number,
  batchSize: number,
  maxDepth: number = 0,
  unassignedPct: number = 30
): Promise<GenResult> {
  return await withGenOps(ctx, dbUrl, txes, wsIds, async (ops) => {
    const pr = (await resolveProjects(ctx, ops, wsIds.uuid, 1, DEFAULT_STATUS_DIST)).projects[0]
    const { projectSpace, kind, statusId, project, identifier: projIdent } = pr
    // Pool of real Persons to assign as assignee; `unassignedPct` stay null (unassigned).
    const persons = (await ops.findAll(contact.class.Person, {}, { limit: 500 })).map((p) => p._id)
    // Mirror CreateIssue.svelte (no server trigger for number/identifier): precompute both
    // from project.sequence, create via apply() so the batch is one op and triggers still fire.
    let seq = project.sequence ?? 0
    // rank='' (RANK_AUTO) makes RankMiddleware run an unindexed ORDER BY per create, which
    // dominates cost on a large project. Hand it a ready rank chain to skip that query.
    let lastRank = ''
    const start = Date.now()
    let created = 0
    const pool: Array<{
      id: Ref<Issue>
      depth: number
      parents: IssueParentInfo[]
      title: string
      identifier: string
    }> = []
    let maxSeenDepth = 0
    ctx.info('using', { project: projectSpace, identifier: projIdent, kind, status: statusId, maxDepth })
    for (let from = 0; from < count; from += batchSize) {
      const part = Math.min(batchSize, count - from)
      const apply = ops.apply(undefined, 'tracker.createIssue')
      const added: Array<{
        id: Ref<Issue>
        depth: number
        parents: IssueParentInfo[]
        title: string
        identifier: string
      }> = []
      for (let j = 0; j < part; j++) {
        const i = from + j
        const id = generateId<Issue>()
        seq += 1
        const number = seq
        const identifier = `${projIdent}-${number}`
        const title = `Generated issue ${i}`
        let attachedTo: Ref<any> = tracker.ids.NoParent
        let parents: IssueParentInfo[] = []
        let depth = 0
        if (maxDepth > 0 && pool.length > 0 && randInt(1, 100) <= 70) {
          const par = pool[randInt(0, pool.length - 1)]
          attachedTo = par.id
          parents = [
            { parentId: par.id, identifier: par.identifier, parentTitle: par.title, space: projectSpace },
            ...par.parents
          ]
          depth = par.depth + 1
        }
        if (depth > maxSeenDepth) maxSeenDepth = depth
        lastRank = makeRank(lastRank, undefined)
        const assignee =
          persons.length > 0 && randInt(1, 100) > unassignedPct ? persons[randInt(0, persons.length - 1)] : null
        const attrs = {
          ...makeAttributes(statusId, kind, i),
          title,
          number,
          identifier,
          parents,
          rank: lastRank,
          assignee
        }
        await apply.addCollection(
          tracker.class.Issue,
          projectSpace,
          attachedTo,
          tracker.class.Issue,
          'subIssues',
          attrs,
          id
        )
        if (depth < maxDepth) added.push({ id, depth, parents, title, identifier })
      }
      await apply.commit()
      for (const a of added) pool.push(a)
      if (pool.length > 20000) pool.splice(0, pool.length - 20000)
      created += part
      if (created % (batchSize * 10) === 0 || created === count) {
        const rate = Math.round(created / ((Date.now() - start) / 1000))
        ctx.info('progress', { created, count, rate: `${rate}/s`, maxDepth: maxSeenDepth })
      }
    }
    // Persist the sequence so re-runs keep unique numbers (we bypass the per-create client $inc).
    await ops.update(project, { $inc: { sequence: count } } as any)
    const ms = Date.now() - start
    const rate = Math.round(created / (ms / 1000))
    ctx.info('done', { wsId: wsIds.uuid, created, ms, rate: `${rate}/s`, maxDepth: maxSeenDepth })
    return { workspace: wsIds.uuid, count: created, batchSize, ms, rate }
  })
}

export interface BigGenOptions {
  // 1% defaults of the 500k/200k/... target.
  tasks: number
  // Spread tasks across this many tracker projects (long-tailed: a few big, many
  // small), so per-space cardinality looks prod-shaped, not one giant project.
  projects: number
  // Explicit size cohorts: `count` projects of `size` issues each; overrides projects/tasks.
  // Emulates a prod mix - many small, some medium, a few huge.
  cohorts?: Array<{ count: number, size: number }>
  commentsPerTaskMax: number
  updatesPerTaskMax: number
  meetings: number
  transcriptMin: number
  transcriptMax: number
  channels: number
  channelMsgMin: number
  channelMsgMax: number
  // Percent of channel messages that spawn a thread; each threaded message gets
  // 1..threadMax ThreadMessage replies.
  threadPct: number
  threadMax: number
  batch: number
  // Number of generated bench employees used as creators/assignees.
  users: number
  // Status category weights for issues (mostly Done for a live project).
  statusDist: StatusDist
}

// Weights per status category. Resolved to real Status refs per project.
export interface StatusDist {
  backlog: number
  todo: number
  inprogress: number
  done: number
  cancelled: number
}

export const DEFAULT_STATUS_DIST: StatusDist = {
  backlog: 3,
  todo: 7,
  inprogress: 15,
  done: 60,
  cancelled: 15
}

export const DEFAULT_BIG_OPTIONS: BigGenOptions = {
  tasks: 5000,
  projects: 1,
  commentsPerTaskMax: 5,
  updatesPerTaskMax: 3,
  meetings: 2000,
  transcriptMin: 5,
  transcriptMax: 25,
  channels: 10,
  channelMsgMin: 10,
  channelMsgMax: 500,
  threadPct: 20,
  threadMax: 8,
  batch: 100,
  users: 15,
  statusDist: DEFAULT_STATUS_DIST
}

// Map a StatusCategory ref to one of our five buckets by keyword.
function categoryBucket (category: string | undefined): keyof StatusDist | undefined {
  if (category == null) return undefined
  const c = category.toLowerCase()
  if (c.includes('backlog')) return 'backlog'
  if (c.includes('unstarted') || c.includes('todo')) return 'todo'
  if (c.includes('lost') || c.includes('cancel')) return 'cancelled'
  if (c.includes('won') || c.includes('completed')) return 'done'
  if (c.includes('active') || c.includes('started')) return 'inprogress'
  return undefined
}

// Build a weighted status picker: group the project's statuses by category
// bucket, then pick a bucket by weight and a random status within it.
function makeStatusPicker (
  statusesByBucket: Map<keyof StatusDist, Array<Ref<any>>>,
  dist: StatusDist,
  fallback: Ref<any>
): () => Ref<any> {
  const buckets: Array<{ key: keyof StatusDist, weight: number, ids: Array<Ref<any>> }> = []
  let total = 0
  for (const key of Object.keys(dist) as Array<keyof StatusDist>) {
    const ids = statusesByBucket.get(key) ?? []
    if (ids.length === 0 || dist[key] <= 0) continue
    buckets.push({ key, weight: dist[key], ids })
    total += dist[key]
  }
  if (buckets.length === 0) return () => fallback
  return () => {
    let roll = faker.number.float({ min: 0, max: 1 }) * total
    for (const b of buckets) {
      roll -= b.weight
      if (roll <= 0) return b.ids[randInt(0, b.ids.length - 1)]
    }
    return buckets[buckets.length - 1].ids[0]
  }
}

export interface SlowRow {
  table: string
  count: number
  maxMs: number
  avgMs: number
  sample: string
}

export interface BigGenResult {
  workspace: string
  tasks: number
  comments: number
  updates: number
  meetings: number
  transcripts: number
  channels: number
  channelMessages: number
  threadReplies: number
  projects: number
  ms: number
  slowSqlFind: SlowRow[]
  slowSqlTx: SlowRow[]
}

// Flatten the heaviest entries of a postgres slow-SQL top-N registry.
function extractSlow (metrics: Metrics | undefined, registry: string): SlowRow[] {
  const reg = metrics?.top?.[registry]
  if (reg === undefined) return []
  const rows: SlowRow[] = []
  for (const [key, e] of Object.entries(reg.entries)) {
    const m =
      /\bFROM\s+"?([A-Za-z0-9_]+)"?/i.exec(key) ??
      /\bINTO\s+"?([A-Za-z0-9_]+)"?/i.exec(key) ??
      /\bUPDATE\s+"?([A-Za-z0-9_]+)"?/i.exec(key)
    rows.push({
      table: m != null ? m[1] : 'unknown',
      count: e.count,
      maxMs: Math.round(e.max * 100) / 100,
      avgMs: e.count > 0 ? Math.round((e.sum / e.count) * 100) / 100 : 0,
      sample: key.length > 200 ? key.slice(0, 200) + '...' : key
    })
  }
  rows.sort((a, b) => b.maxMs - a.maxMs)
  return rows.slice(0, 30)
}

function makeBigIssue (statusId: Ref<any>, kind: Ref<TaskType>, i: number): Data<Issue> {
  const a = makeAttributes(statusId, kind, i)
  ;(a as any).title = faker.lorem.sentence({ min: 3, max: 8 })
  return a
}

export async function generateBig (
  ctx: MeasureContext,
  dbUrl: string,
  txes: Tx[],
  wsIds: WorkspaceIds,
  opts: BigGenOptions
): Promise<BigGenResult> {
  return await withGenOps(ctx, dbUrl, txes, wsIds, async (ops, storage) => {
    const r: BigGenResult = {
      workspace: wsIds.uuid,
      tasks: 0,
      comments: 0,
      updates: 0,
      meetings: 0,
      transcripts: 0,
      channels: 0,
      channelMessages: 0,
      threadReplies: 0,
      projects: 0,
      ms: 0,
      slowSqlFind: [],
      slowSqlTx: []
    }
    // Cohorts (if given) fix the exact project total; otherwise use `projects`.
    const cohortTotal = opts.cohorts != null ? opts.cohorts.reduce((a, c) => a + Math.max(0, c.count), 0) : 0
    const projectCount = cohortTotal > 0 ? cohortTotal : Math.max(1, opts.projects)
    const { projects, account } = await resolveProjects(ctx, ops, wsIds.uuid, projectCount, opts.statusDist)
    const members = account != null ? [account] : []
    const start = Date.now()

    // Bench employees act as creators/assignees so the data looks user-made.
    const users = await ensureBenchUsers(ops, Math.max(1, opts.users))
    const userOps = users.map((u) => new TxOperations(ops.client, u.personId))
    const pickOps = (): TxOperations => userOps[randInt(0, userOps.length - 1)]
    const pickUser = (): BenchUser => users[randInt(0, users.length - 1)]
    ctx.info('bench users', { count: users.length })

    // Idempotent top-up: docs created here carry createdBy of a bench user (or
    // core.account.System from older runs) - dump/user docs never do.
    const genIds: PersonId[] = [core.account.System, ...users.map((u) => u.personId)]

    // Fill one project up to `target` generated issues (idempotent top-up).
    const fillProject = async (pr: ProjectRefs, target: number): Promise<void> => {
      // Freshly-created projects aren't in the pipeline's space-security cache
      // yet, so a security-filtered count on them is unreliable - they're empty.
      const existingTasks = pr.isNew
        ? 0
        : (
            await ops.findAll(
              tracker.class.Issue,
              { space: pr.project._id, createdBy: { $in: genIds } },
              { limit: 1, total: true }
            )
          ).total
      const toCreate = Math.max(0, target - existingTasks)
      ctx.info('project tasks top-up', { project: pr.identifier, existing: existingTasks, create: toCreate })
      let lastRank =
        (await ops.findOne(tracker.class.Issue, { space: pr.project._id }, { sort: { rank: -1 as any } }))?.rank ??
        undefined
      for (let from = 0; from < toCreate; from += opts.batch) {
        const part = Math.min(opts.batch, toCreate - from)
        // Under heavy trigger load the $inc can spuriously reject (racing pipeline state);
        // retry so a multi-hour bulk fill survives transients.
        let inc: any
        for (let attempt = 1; ; attempt++) {
          try {
            inc = (await ops.updateDoc(
              tracker.class.Project,
              core.space.Space,
              pr.project._id,
              { $inc: { sequence: part } },
              true
            )) as any
            break
          } catch (err) {
            if (attempt >= 5) throw err
            ctx.warn('sequence reserve retry', { project: pr.identifier, from, attempt })
            await new Promise((resolve) => setTimeout(resolve, 250 * attempt))
          }
        }
        const baseSeq = (inc.object.sequence as number) - part
        const ranks: string[] = []
        for (let j = 0; j < part; j++) {
          const rk = makeRank(lastRank, undefined)
          ranks.push(rk)
          lastRank = rk
        }
        const promises: Array<Promise<any>> = []
        for (let j = 0; j < part; j++) {
          const i = from + j
          const number = baseSeq + j + 1
          const rank = ranks[j]
          promises.push(
            (async () => {
              const attrs = makeBigIssue(pr.pickStatus(), pr.kind, i)
              ;(attrs as any).number = number
              ;(attrs as any).identifier = `${pr.identifier}-${number}`
              ;(attrs as any).rank = rank
              ;(attrs as any).assignee = pickUser().person
              const issueId = generateId<Issue>()
              const collabId = makeCollabId(tracker.class.Issue, issueId, 'description')
              attrs.description = await saveCollabJson(
                ctx,
                storage,
                wsIds,
                collabId,
                mkMsg(faker.lorem.paragraphs({ min: 1, max: 3 }))
              )
              // Issue create only: batching comments/updates into the same TxApplyIf collides
              // on unique chunter_doc - the notMatch guard can't see in-batch duplicates.
              const creator = pickOps()
              await creator.addCollection(
                tracker.class.Issue,
                pr.projectSpace,
                tracker.ids.NoParent,
                tracker.class.Issue,
                'subIssues',
                attrs,
                issueId
              )
              r.tasks++
              const nComments = randInt(0, opts.commentsPerTaskMax)
              for (let c = nComments; c > 0; c--) {
                await pickOps().addCollection(
                  chunter.class.ChatMessage,
                  pr.projectSpace,
                  issueId,
                  tracker.class.Issue,
                  'comments',
                  { message: mkMsg(faker.lorem.sentences({ min: 1, max: 3 })) } as any
                )
                r.comments++
              }
              const nUpdates = randInt(0, opts.updatesPerTaskMax)
              for (let u = nUpdates; u > 0; u--) {
                await creator.updateDoc(tracker.class.Issue, pr.projectSpace, issueId, {
                  priority: PRIORITIES[randInt(0, PRIORITIES.length - 1)],
                  status: pr.pickStatus(),
                  title: faker.lorem.sentence({ min: 3, max: 8 })
                })
                r.updates++
              }
            })()
          )
        }
        await Promise.all(promises)
        if (from % (opts.batch * 10) === 0) ctx.info('tasks', { project: pr.identifier, done: r.tasks })
      }
    }

    // Per-project targets: explicit cohorts if given, else a long tail
    // (project k weighs 1/(k+1)) - few large, most small, prod-shaped.
    let targets: number[]
    if (opts.cohorts != null && cohortTotal > 0) {
      targets = []
      for (const c of opts.cohorts) {
        for (let i = 0; i < c.count; i++) targets.push(Math.max(1, c.size))
      }
    } else {
      const weights = projects.map((_, k) => 1 / (k + 1))
      const wsum = weights.reduce((a, b) => a + b, 0)
      targets = projects.map((_, k) => Math.max(1, Math.round((opts.tasks * weights[k]) / wsum)))
    }
    for (let k = 0; k < projects.length; k++) {
      try {
        await fillProject(projects[k], targets[k] ?? 1)
      } catch (err: any) {
        // Don't let one project's transient failure abort the whole fill; the
        // top-up is idempotent so a re-run fixes any shortfall.
        ctx.error('project fill failed, continuing', {
          project: projects[k].identifier,
          err: String(err?.message ?? err)
        })
      }
    }
    r.projects = projects.length

    // --- ROOMS: reuse existing rooms (real floors) so meetings show in the
    // floor list; only create our own if the workspace has none. ---
    const roomIds: Array<Ref<any>> = []
    if (opts.meetings > 0) {
      const existingRooms = await ops.findAll(love.class.Room, {}, { limit: 100 })
      for (const rm of existingRooms) roomIds.push(rm._id)
      if (roomIds.length === 0) {
        const floorId = await ops.createDoc(love.class.Floor, core.space.Workspace, { name: 'Big Floor' } as any)
        for (let i = 0; i < 5; i++) {
          const roomId = await ops.createDoc(love.class.Room, core.space.Workspace, {
            name: `Room ${i + 1}`,
            type: 0,
            floor: floorId,
            width: 5,
            height: 5,
            x: i * 6,
            y: 0,
            language: 'en',
            startWithTranscription: false,
            startWithRecording: false,
            startPrivate: false,
            description: null
          } as any)
          roomIds.push(roomId)
        }
      }
      ctx.info('rooms', { count: roomIds.length })
    }

    // --- MEETINGS + transcription messages ---
    const existingMeetings = (
      await ops.findAll(love.class.MeetingMinutes, { createdBy: { $in: genIds } }, { limit: 1, total: true })
    ).total
    const meetingsToCreate = Math.max(0, opts.meetings - existingMeetings)
    ctx.info('meetings top-up', { existing: existingMeetings, create: meetingsToCreate, target: opts.meetings })
    for (let from = 0; from < meetingsToCreate; from += opts.batch) {
      const part = Math.min(opts.batch, meetingsToCreate - from)
      const promises: Array<Promise<any>> = []
      for (let j = 0; j < part; j++) {
        const i = from + j
        const roomId = roomIds[i % roomIds.length]
        // MeetingMinutes IS a Space; its space must be its own _id.
        const meetingId = generateId<any>()
        promises.push(
          (async () => {
            // Meeting + its transcription messages as one TxApplyIf.
            const apply = pickOps().apply()
            await apply.createDoc(
              love.class.MeetingMinutes,
              meetingId as unknown as Ref<Space>,
              {
                name: `Meeting ${faker.company.catchPhrase()} ${i}`,
                description: '',
                private: false,
                members,
                owners: members,
                archived: false,
                roomId,
                // ~0.5% Active, rest Finished - live workspaces have few ongoing calls.
                status: i % 200 === 0 ? MeetingStatus.Active : MeetingStatus.Finished,
                transcriptionState: TranscriptionState.Finished,
                recordingState: RecordingState.NotStarted,
                language: 'en',
                descriptionRef: null,
                summary: null
              } as any,
              meetingId
            )
            const nTranscripts = randInt(opts.transcriptMin, opts.transcriptMax)
            for (let t = nTranscripts; t > 0; t--) {
              await apply.addCollection(
                chunter.class.ChatMessage,
                meetingId as unknown as Ref<Space>,
                meetingId,
                love.class.MeetingMinutes,
                'transcription',
                { message: mkMsg(`${faker.person.firstName()}: ${faker.lorem.sentence()}`) } as any
              )
            }
            const cr = await apply.commit()
            if (cr.result) {
              r.meetings++
              r.transcripts += nTranscripts
            } else {
              ctx.warn('meeting apply failed', { i })
            }
          })()
        )
      }
      await Promise.all(promises)
      if (from % (opts.batch * 10) === 0) ctx.info('meetings', { done: r.meetings, of: meetingsToCreate })
    }

    // --- CHANNELS + messages ---
    // Message target derived from the channel index, not random, so a re-run tops up
    // to the same volume instead of appending more.
    for (let i = 0; i < opts.channels; i++) {
      const existing = await ops.findOne(chunter.class.Channel, { name: `big-channel-${i}` } as any)
      const channelId =
        existing?._id ??
        (await ops.createDoc(chunter.class.Channel, core.space.Space, {
          name: `big-channel-${i}`,
          description: faker.company.buzzPhrase(),
          private: false,
          archived: false,
          members: [],
          topic: faker.company.catchPhrase()
        } as any))
      if (existing === undefined) r.channels++
      const span = Math.max(1, opts.channelMsgMax - opts.channelMsgMin + 1)
      const targetMsgs = opts.channelMsgMin + ((i * 7919) % span)
      const existingMsgs =
        existing !== undefined
          ? (
              await ops.findAll(
                chunter.class.ChatMessage,
                { attachedTo: channelId, collection: 'messages' },
                { limit: 1, total: true }
              )
            ).total
          : 0
      const nMsgs = Math.max(0, targetMsgs - existingMsgs)
      // A message auto-collaborates its author (unique context row per channel+account),
      // so one author's message + replies go as a unit; different authors run concurrently.
      const postMessage = async (author: TxOperations): Promise<void> => {
        const msgId = generateId<any>()
        await author.addCollection(
          chunter.class.ChatMessage,
          channelId as unknown as Ref<Space>,
          channelId,
          chunter.class.Channel,
          'messages',
          { message: mkMsg(faker.lorem.sentences({ min: 1, max: 4 })) } as any,
          msgId
        )
        r.channelMessages++
        if (randInt(1, 100) <= opts.threadPct) {
          const nReplies = randInt(1, Math.max(1, opts.threadMax))
          for (let t = 0; t < nReplies; t++) {
            await pickOps().addCollection(
              chunter.class.ThreadMessage,
              channelId as unknown as Ref<Space>,
              msgId,
              chunter.class.ChatMessage,
              'replies',
              {
                message: mkMsg(faker.lorem.sentences({ min: 1, max: 3 })),
                objectClass: chunter.class.Channel,
                objectId: channelId
              } as any
            )
            r.threadReplies++
          }
        }
      }
      // Warm-up: one message per author sequentially, so every author's channel
      // context exists before we fan out (the notMatch guard then dedups).
      let sent = 0
      for (const author of userOps) {
        if (sent >= nMsgs) break
        try {
          await postMessage(author)
        } catch (err: any) {
          ctx.warn('channel warmup failed', { channel: i, err: err?.message })
        }
        sent++
      }
      // Rest: concurrent, but each author's context already exists.
      for (let from = sent; from < nMsgs; from += opts.batch) {
        const part = Math.min(opts.batch, nMsgs - from)
        const res = await Promise.allSettled(Array.from({ length: part }, () => postMessage(pickOps())))
        const failed = res.filter((x) => x.status === 'rejected').length
        if (failed > 0) ctx.warn('channel msg failures', { channel: i, failed, of: part })
      }
      // Back-fill threads on existing messages: postMessage only threads fresh ones,
      // so a re-run over full channels (nMsgs=0) would never raise coverage.
      if (opts.threadPct > 0 && targetMsgs > 0) {
        const msgs = await ops.findAll(
          chunter.class.ChatMessage,
          { attachedTo: channelId, collection: 'messages' } as any,
          { limit: targetMsgs }
        )
        const threaded = new Set(
          (await ops.findAll(chunter.class.ThreadMessage, { objectId: channelId } as any, {})).map(
            (t) => (t as any).attachedTo
          )
        )
        const toThread = msgs.filter((m) => !threaded.has(m._id) && randInt(1, 100) <= opts.threadPct)
        for (let from = 0; from < toThread.length; from += opts.batch) {
          const part = toThread.slice(from, from + opts.batch)
          await Promise.allSettled(
            part.map(async (m) => {
              const nReplies = randInt(1, Math.max(1, opts.threadMax))
              for (let t = 0; t < nReplies; t++) {
                await pickOps().addCollection(
                  chunter.class.ThreadMessage,
                  channelId as unknown as Ref<Space>,
                  m._id,
                  chunter.class.ChatMessage,
                  'replies',
                  {
                    message: mkMsg(faker.lorem.sentences({ min: 1, max: 3 })),
                    objectClass: chunter.class.Channel,
                    objectId: channelId
                  } as any
                )
                r.threadReplies++
              }
            })
          )
        }
      }
      ctx.info('channel', { done: i + 1, of: opts.channels, msgs: nMsgs })
    }

    r.ms = Date.now() - start
    // recordTop writes into the ROOT metrics node; ctx here is a child, so walk up.
    let rootCtx: MeasureContext = ctx
    while (rootCtx.parent != null) rootCtx = rootCtx.parent
    r.slowSqlFind = extractSlow(rootCtx.metrics, 'slowSqlFind')
    r.slowSqlTx = extractSlow(rootCtx.metrics, 'slowSqlTx')
    return r
  })
}
