//
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//

import {
  type Class,
  type Doc,
  type DocumentQuery,
  type DocumentUpdate,
  type MeasureContext,
  type Ref
} from '@hcengineering/core'
import love, { MeetingStatus, type MeetingMinutes } from '@hcengineering/love'
import { createMockContext, createMockMeeting } from './test-helpers'
import { WorkspaceClient } from '../workspaceClient'

// In-memory fake covering the client surface `checkUnfinishedMeetings` and the
// `finishMeeting` it calls per meeting touch.
function createFakeClient (meetings: MeetingMinutes[]): {
  client: any
  finished: Array<Ref<MeetingMinutes>>
} {
  const store = new Map<Ref<MeetingMinutes>, MeetingMinutes>()
  for (const m of meetings) store.set(m._id, { ...m })

  const finished: Array<Ref<MeetingMinutes>> = []

  const matchStatus = (status: MeetingStatus, cond: any): boolean => {
    if (cond === undefined) return true
    if (cond.$in !== undefined) return (cond.$in as MeetingStatus[]).includes(status)
    if (cond.$ne !== undefined) return status !== cond.$ne
    return status === cond
  }

  const client = {
    findAll: jest.fn(async <T extends Doc>(_class: Ref<Class<T>>, query: DocumentQuery<T>) => {
      if (_class === love.class.MeetingMinutes) {
        const q = query as any
        const exclude = new Set<Ref<MeetingMinutes>>((q._id?.$nin as Ref<MeetingMinutes>[]) ?? [])
        return Array.from(store.values()).filter(
          (m) => !exclude.has(m._id) && matchStatus(m.status, q.status)
        ) as unknown as T[]
      }
      return [] as unknown as T[]
    }),
    findOne: jest.fn(async <T extends Doc>(_class: Ref<Class<T>>, query: DocumentQuery<T>) => {
      if (_class === love.class.MeetingMinutes) {
        return store.get((query as any)._id as Ref<MeetingMinutes>) as T | undefined
      }
      return undefined
    }),
    update: jest.fn(async (doc: Doc, update: DocumentUpdate<Doc>) => {
      if ((update as any).status === MeetingStatus.Finished) {
        finished.push(doc._id as Ref<MeetingMinutes>)
      }
    }),
    remove: jest.fn(async () => {})
  }
  return { client, finished }
}

function makeWorkspaceClient (ctx: MeasureContext, client: any): WorkspaceClient {
  const wc = Object.create(WorkspaceClient.prototype)
  wc.ctx = ctx
  wc.client = client
  return wc as WorkspaceClient
}

describe('WorkspaceClient.checkUnfinishedMeetings', () => {
  it('finishes Active and Pending meetings not in the active room list', async () => {
    const active = createMockMeeting({ _id: 'm:active' as Ref<MeetingMinutes>, status: MeetingStatus.Active })
    const pending = createMockMeeting({ _id: 'm:pending' as Ref<MeetingMinutes>, status: MeetingStatus.Pending })
    const fake = createFakeClient([active, pending])

    const wc = makeWorkspaceClient(createMockContext(), fake.client)
    await wc.checkUnfinishedMeetings([])

    expect(fake.finished).toEqual(expect.arrayContaining([active._id, pending._id]))
  })

  it('does NOT finish a Scheduled meeting (no LiveKit room until someone starts it)', async () => {
    const scheduled = createMockMeeting({ _id: 'm:scheduled' as Ref<MeetingMinutes>, status: MeetingStatus.Scheduled })
    const active = createMockMeeting({ _id: 'm:active' as Ref<MeetingMinutes>, status: MeetingStatus.Active })
    const fake = createFakeClient([scheduled, active])

    const wc = makeWorkspaceClient(createMockContext(), fake.client)
    await wc.checkUnfinishedMeetings([])

    expect(fake.finished).toContain(active._id)
    expect(fake.finished).not.toContain(scheduled._id)
  })

  it('does not finish meetings present in the active room list', async () => {
    const active = createMockMeeting({ _id: 'm:active' as Ref<MeetingMinutes>, status: MeetingStatus.Active })
    const fake = createFakeClient([active])

    const wc = makeWorkspaceClient(createMockContext(), fake.client)
    await wc.checkUnfinishedMeetings([active._id])

    expect(fake.finished).not.toContain(active._id)
  })
})
