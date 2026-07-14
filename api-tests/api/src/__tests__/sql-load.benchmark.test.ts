//
// Copyright © 2026 Intabia Fusion.
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//

// SQL load benchmark — simulates average real-user load across 5 domains
// (contact, chunter, love, tracker, notification/inbox) to generate realistic
// SQL on the transactor for slow-SQL top-N registry inspection.
//
// The axis is NUMBER OF WORKSPACES (BENCH_WORKSPACES env var).
//
// Skipped by default. Set BENCH_SQL_LOAD=1 to run.

import { connect } from '@hcengineering/api-client'
import core, { generateId, SortingOrder, type Ref, type Space } from '@hcengineering/core'
import contact from '@hcengineering/contact'
import chunter from '@hcengineering/chunter'
import love, { MeetingStatus, TranscriptionState, RecordingState } from '@hcengineering/love'
import tracker from '@hcengineering/tracker'
import task from '@hcengineering/task'
import notification from '@hcengineering/notification'
import * as fs from 'fs'
import * as path from 'path'

const URL = process.env.BENCH_URL ?? 'http://localhost:8083'
const WORKSPACES = (process.env.BENCH_WORKSPACES ?? 'sanity-ws')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const PERSONS = parseInt(process.env.BENCH_PERSONS ?? '50')
const CHANNELS = parseInt(process.env.BENCH_CHANNELS ?? '10')
const MSGS_PER_CHANNEL = parseInt(process.env.BENCH_MSGS_PER_CHANNEL ?? '20')
const ISSUES = parseInt(process.env.BENCH_ISSUES ?? '50')
const MEETINGS = parseInt(process.env.BENCH_MEETINGS ?? '10')
const QUERY_ITERS = parseInt(process.env.BENCH_QUERY_ITERS ?? '20')
const LABEL = process.env.BENCH_LABEL ?? 'sql-load'
const STATS_DIR = process.env.BENCH_STATS_DIR ?? '/tmp/bench-stats'
const ENABLED = process.env.BENCH_SQL_LOAD === '1'

const dtest = ENABLED ? describe : describe.skip

interface WorkspaceResult {
  workspace: string
  persons: number
  channels: number
  messages: number
  issues: number
  meetings: number
  queryIters: number
  createMs: number
  queryMs: number
  totalMs: number
  errors: string[]
}

dtest('sql load benchmark', () => {
  jest.setTimeout(15 * 60 * 1000)

  it(`mixed load across ${WORKSPACES.length} workspace(s)`, async () => {
    const wsResults: WorkspaceResult[] = []

    for (const ws of WORKSPACES) {
      const wsStart = Date.now()
      const errors: string[] = []
      let persons = 0
      let channels = 0
      let messages = 0
      let issues = 0
      let meetings = 0
      let createMs = 0
      let queryMs = 0

      const client = await connect(URL, { email: 'user1', password: '1234', workspace: ws })

      try {
        const myAcc = (await client.getAccount()).uuid

        // --- CONTACT ---
        try {
          const personIds: Array<Ref<any>> = []
          const createStart = Date.now()

          for (let i = 0; i < PERSONS; i++) {
            const id = generateId()
            await client.createDoc(
              contact.class.Person,
              contact.space.Contacts,
              {
                name: `Bench,P${i}`,
                city: 'BenchCity',
                avatarType: 'color' as any
              } as any,
              id
            )
            personIds.push(id)
            persons++

            if (i % 2 === 0) {
              await client.addCollection(
                contact.class.Channel,
                contact.space.Contacts,
                id,
                contact.class.Person,
                'channels',
                { provider: contact.channelProvider.Email, value: `p${i}@bench.local` } as any
              )
            }
          }
          createMs += Date.now() - createStart

          const qStart = Date.now()
          const somePersonId = personIds[0]
          for (let q = 0; q < QUERY_ITERS; q++) {
            await client.findAll(contact.class.Person, { name: { $like: '%Bench%' } }, { limit: 200 })
            await client.findAll(contact.mixin.Employee, { active: true } as any, { limit: 200 })
            await client.findAll(contact.class.Channel, { attachedTo: somePersonId } as any)
          }
          queryMs += Date.now() - qStart
        } catch (err: any) {
          errors.push(`contact: ${err?.message ?? String(err)}`)
        }

        // --- CHUNTER ---
        try {
          const channelIds: Array<Ref<any>> = []
          const createStart = Date.now()

          for (let i = 0; i < CHANNELS; i++) {
            const chId = generateId()
            await client.createDoc(
              chunter.class.Channel,
              core.space.Space,
              {
                name: `bench-ch-${i}`,
                description: '',
                private: false,
                archived: false,
                members: [myAcc],
                topic: ''
              } as any,
              chId
            )
            channelIds.push(chId)
            channels++

            for (let j = 0; j < MSGS_PER_CHANNEL; j++) {
              await client.addCollection(
                chunter.class.ChatMessage,
                chId as unknown as Ref<Space>,
                chId,
                chunter.class.Channel,
                'messages',
                { message: `<p>bench message ${j}</p>` } as any
              )
              messages++
            }
          }
          createMs += Date.now() - createStart

          const qStart = Date.now()
          for (let q = 0; q < QUERY_ITERS; q++) {
            await client.findAll(chunter.class.Channel, { archived: false })
            if (channelIds.length > 0) {
              const chId = channelIds[q % channelIds.length]
              await client.findAll(
                chunter.class.ChatMessage,
                { attachedTo: chId, space: chId as any },
                { sort: { createdOn: SortingOrder.Descending }, limit: 50 }
              )
            }
          }
          queryMs += Date.now() - qStart
        } catch (err: any) {
          errors.push(`chunter: ${err?.message ?? String(err)}`)
        }

        // --- LOVE ---
        try {
          const createStart = Date.now()

          await client.createDoc(love.class.Floor, core.space.Space, { name: 'Bench Floor' } as any)

          for (let i = 0; i < MEETINGS; i++) {
            await client.createDoc(love.class.MeetingMinutes, core.space.Space, {
              name: `Bench Meeting ${i}`,
              description: '',
              private: false,
              members: [],
              archived: false,
              status: MeetingStatus.Pending,
              transcriptionState: TranscriptionState.NotStarted,
              recordingState: RecordingState.NotStarted,
              language: 'en',
              descriptionRef: null,
              summary: null,
              owners: [myAcc]
            } as any)
            meetings++
          }
          createMs += Date.now() - createStart

          const qStart = Date.now()
          for (let q = 0; q < QUERY_ITERS; q++) {
            await client.findAll(love.class.MeetingMinutes, {
              status: { $in: [MeetingStatus.Active, MeetingStatus.Pending] as any }
            })
            await client.findAll(love.class.MeetingMinutes, { name: { $like: '%Bench%' } }, { limit: 200 })
          }
          queryMs += Date.now() - qStart
        } catch (err: any) {
          errors.push(`love: ${err?.message ?? String(err)}`)
        }

        // --- TRACKER ---
        try {
          const project = await client.findOne(tracker.class.Project, { _id: tracker.project.DefaultProject })
          const taskType = await client.findOne(task.class.TaskType, { _id: tracker.taskTypes.Issue })
          const statusId = (taskType as any)?.statuses?.[0]

          if (project == null || taskType == null || statusId == null) {
            errors.push('tracker: defaults missing (project/taskType/statusId), skipping create')
          } else {
            const createStart = Date.now()
            let firstError: string | null = null

            for (let i = 0; i < ISSUES; i++) {
              try {
                // Issue is an AttachedDoc; created via addCollection on the parent
                // (NoParent for root issues) exactly as the UI does. number/identifier
                // are auto-assigned by server triggers, so they stay empty here.
                await client.addCollection(
                  tracker.class.Issue,
                  tracker.project.DefaultProject as unknown as Ref<Space>,
                  tracker.ids.NoParent,
                  tracker.class.Issue,
                  'subIssues',
                  {
                    title: `Bench Issue ${i}`,
                    description: null,
                    status: statusId,
                    priority: 0,
                    number: 0,
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
                    kind: taskType._id,
                    rank: `bench${i}`,
                    identifier: ''
                  } as any
                )
                issues++
              } catch (err: any) {
                if (firstError == null) {
                  firstError = err?.message ?? String(err)
                  errors.push(`tracker create: ${firstError}`)
                }
              }
            }
            createMs += Date.now() - createStart
          }

          const qStart = Date.now()
          for (let q = 0; q < QUERY_ITERS; q++) {
            await client.findAll(
              tracker.class.Issue,
              { space: tracker.project.DefaultProject as any },
              { sort: { modifiedOn: SortingOrder.Descending }, limit: 200 }
            )
            await client.findAll(tracker.class.Issue, {
              space: tracker.project.DefaultProject as any,
              priority: 0 as any
            })
            if (statusId != null) {
              await client.findAll(tracker.class.Issue, {
                space: tracker.project.DefaultProject as any,
                status: statusId
              })
            }
          }
          queryMs += Date.now() - qStart
        } catch (err: any) {
          errors.push(`tracker: ${err?.message ?? String(err)}`)
        }

        // --- NOTIFICATION / INBOX (read-only) ---
        try {
          const qStart = Date.now()
          for (let q = 0; q < QUERY_ITERS; q++) {
            await client.findAll(notification.class.DocNotifyContext, { user: myAcc } as any)
            await client.findAll(notification.class.CommonInboxNotification, { archived: false, user: myAcc } as any)
            await client.findAll(
              notification.class.InboxNotification,
              { user: myAcc, isViewed: false, archived: false } as any,
              { projection: { _id: 1, _class: 1, space: 1 } as any }
            )
          }
          queryMs += Date.now() - qStart
        } catch (err: any) {
          errors.push(`notification: ${err?.message ?? String(err)}`)
        }
      } finally {
        await client.close?.()
      }

      const totalMs = Date.now() - wsStart
      wsResults.push({
        workspace: ws,
        persons,
        channels,
        messages,
        issues,
        meetings,
        queryIters: QUERY_ITERS,
        createMs,
        queryMs,
        totalMs,
        errors
      })
    }

    const summary = {
      label: LABEL,
      url: URL,
      workspaces: wsResults,
      generatedAt: Date.now()
    }

    // eslint-disable-next-line no-console
    console.log(JSON.stringify(summary, null, 2))

    try {
      fs.mkdirSync(STATS_DIR, { recursive: true })
      fs.writeFileSync(path.join(STATS_DIR, `sqlload-${LABEL}.json`), JSON.stringify(summary, null, 2))
    } catch {}

    expect(summary.workspaces.length).toBeGreaterThan(0)
  })
})
