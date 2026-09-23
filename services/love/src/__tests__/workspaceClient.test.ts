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
  findProperty,
  type Class,
  type Doc,
  type DocumentQuery,
  type MeasureContext,
  type Ref
} from '@hcengineering/core'
import love, { type MeetingMinutes, type ParticipantInfo, type PendingRecording, type Room } from '@hcengineering/love'
import { createMockContext, createMockMeeting, createMockRoom, TEST_IDS } from './test-helpers'
import { RecordingProcessor } from '../recordings'
import { WorkspaceClient } from '../workspaceClient'

// Fake of the client surface `upsertParticipantFromLiveKit` touches. The occupancy read reflects
// rows created so far, like a real database - collisions then depend on the code, not the fake.
function createFakeClient (opts: { meeting: MeetingMinutes, room?: Room, participantsSnapshot?: ParticipantInfo[] }): {
  client: any
  createDocCalls: Array<{ data: any, id: any }>
} {
  const createDocCalls: Array<{ data: any, id: any }> = []
  const participantsSnapshot = opts.participantsSnapshot ?? []

  const client = {
    findOne: jest.fn(async <T extends Doc>(_class: Ref<Class<T>>, query: DocumentQuery<T>) => {
      if (_class === love.class.MeetingMinutes) {
        return (query as any)._id === opts.meeting._id ? opts.meeting : undefined
      }
      if (_class === love.class.Room) {
        return opts.room !== undefined && (query as any)._id === opts.room._id ? opts.room : undefined
      }
      return undefined
    }),
    findAll: jest.fn(async <T extends Doc>(_class: Ref<Class<T>>, query: DocumentQuery<T>) => {
      if (_class === love.class.ParticipantInfo) {
        const q = query as any
        // Existing-record lookup (person+meeting+sessionId): none pre-exist in these tests.
        if (q.sessionId !== undefined) return []
        // Room-occupancy read used for placement: seed plus everything created so far.
        return [...participantsSnapshot, ...createDocCalls.map((c) => c.data)]
      }
      return []
    }),
    createDoc: jest.fn(async (_class: any, _space: any, data: any, id: any) => {
      createDocCalls.push({ data, id })
      return id
    })
  }
  return { client, createDocCalls }
}

function makeWorkspaceClient (ctx: MeasureContext, client: any): WorkspaceClient {
  // Bypass private constructor - upsertParticipantFromLiveKit only reaches ctx/client, never the network plumbing.
  const wc = Object.create(WorkspaceClient.prototype)
  wc.ctx = ctx
  wc.client = client
  return wc as WorkspaceClient
}

describe('WorkspaceClient.upsertParticipantFromLiveKit → new ParticipantInfo shape (defect C)', () => {
  it('sets kind on a newly created ParticipantInfo (defect: kind is never set on create)', async () => {
    const meeting = createMockMeeting({ roomId: undefined })
    const { client, createDocCalls } = createFakeClient({ meeting })
    const wc = makeWorkspaceClient(createMockContext(), client)

    await wc.upsertParticipantFromLiveKit(TEST_IDS.person1, 'Alice', null, meeting._id, 'session-1', {})

    expect(createDocCalls).toHaveLength(1)
    expect(createDocCalls[0].data.kind).toBe('user')
  })
})

// The guard itself runs in the transactor; what this side owns is sending check and insert as one tx.
describe('WorkspaceClient.createPendingRecording → reservation is one conditional write', () => {
  const meeting = createMockMeeting()
  const params = {
    meeting: meeting._id,
    format: 'video' as const,
    roomName: 'ws_meeting',
    name: 'rec.mp4',
    reservedAfter: 1000
  }

  function clientAnswering (success: boolean): any {
    return {
      findOne: jest.fn(async () => meeting),
      getAccount: jest.fn(async () => ({ primarySocialId: 'core:account:System' })),
      tx: jest.fn(async () => ({ success, serverTime: 0 }))
    }
  }

  it('sends the running-recording check and the insert under one per-slot scope', async () => {
    const client = clientAnswering(true)
    const id = await makeWorkspaceClient(createMockContext(), client).createPendingRecording(params)

    const applyIf = client.tx.mock.calls[0][0]
    expect(applyIf._class).toBe(core.class.TxApplyIf)
    expect(applyIf.scope).toBe(`love:recording:${meeting._id}:video`)
    const queries = applyIf.notMatch.map((it: any) => it.query)
    expect(queries).toContainEqual(
      expect.objectContaining({ attachedTo: meeting._id, format: 'video', egressId: { $exists: true } })
    )
    expect(queries).toContainEqual(
      expect.objectContaining({ attachedTo: meeting._id, format: 'video', startedAt: { $gt: 1000 } })
    )
    expect(applyIf.txes).toHaveLength(1)
    expect(id).toBe(applyIf.txes[0].objectId)
  })

  it('reports no reservation when the transactor refuses the write', async () => {
    const client = clientAnswering(false)
    expect(await makeWorkspaceClient(createMockContext(), client).createPendingRecording(params)).toBeUndefined()
  })

  // `undefined` means "somebody else holds the slot" and the caller drops the recording on it. A
  // transactor that never answered must not be reported as that.
  it('throws when the write fails instead of reporting the slot as taken', async () => {
    const client = clientAnswering(true)
    client.tx = jest.fn(async () => {
      throw new Error('transactor unreachable')
    })

    await expect(makeWorkspaceClient(createMockContext(), client).createPendingRecording(params)).rejects.toThrow(
      'transactor unreachable'
    )
  })

  // The reservation is only correct while it says exactly what `findRunningRecording` says: a row
  // it treats as dead must not block the slot, or that meeting can never be recorded again.
  describe('agrees with RecordingProcessor.findRunningRecording', () => {
    const grace = 60_000
    const now = 2_000_000
    const row = (over: Partial<PendingRecording>): PendingRecording =>
      ({
        _id: 'rec-1',
        _class: love.class.PendingRecording,
        space: meeting._id,
        attachedTo: meeting._id,
        attachedToClass: love.class.MeetingMinutes,
        collection: 'recordings',
        modifiedBy: core.account.System,
        modifiedOn: now,
        format: 'video',
        roomName: 'ws_meeting',
        name: 'rec.mp4',
        startedAt: now,
        status: 'active',
        ...over
      }) as unknown as PendingRecording

    // What the processor believes, straight from its own code - not a copy of the predicate.
    async function processorSaysRunning (existing: PendingRecording): Promise<boolean> {
      const processor: any = Object.create(RecordingProcessor.prototype)
      const wsClient = { findPendingRecordingsByMeeting: async () => [existing] }
      return (await processor.findRunningRecording(wsClient, meeting._id, 'video')) !== undefined
    }

    // What the transactor would decide: a TxApplyIf fails when any notMatch query matches.
    async function reservationBlockedBy (existing: PendingRecording): Promise<boolean> {
      const client = clientAnswering(true)
      await makeWorkspaceClient(createMockContext(), client).createPendingRecording({
        ...params,
        reservedAfter: now - grace
      })
      const { notMatch } = client.tx.mock.calls[0][0]
      // Same per-key walk `matchQuery` does; its classifier part is moot, the class is fixed here.
      return notMatch.some((it: any) =>
        Object.entries(it.query).every(([key, value]) => findProperty([existing], key, value).length > 0)
      )
    }

    const cases: Array<[string, Partial<PendingRecording>]> = [
      ['a fresh reservation still waiting for its egress id', { startedAt: now - 1000 }],
      ['a stale reservation that never got an egress id', { startedAt: now - grace - 1000 }],
      ['a running recording with an egress id', { egressId: 'EG_1', startedAt: now - grace - 1000 }],
      ['a completed recording', { status: 'completed', egressId: 'EG_1', startedAt: now - grace - 1000 }],
      ['a cancelled recording', { status: 'cancelled', egressId: 'EG_1', startedAt: now - grace - 1000 }],
      ['a legacy row written before `status` existed', { status: undefined, egressId: 'EG_1' }],
      [
        'a stale legacy row with no egress id',
        { status: undefined, egressId: undefined, startedAt: now - grace - 1000 }
      ]
    ]

    it.each(cases)('%s', async (_name, over) => {
      jest.spyOn(Date, 'now').mockReturnValue(now)
      try {
        const existing = row(over)
        expect(await reservationBlockedBy(existing)).toBe(await processorSaysRunning(existing))
      } finally {
        jest.spyOn(Date, 'now').mockRestore()
      }
    })
  })
})

describe('WorkspaceClient.upsertParticipantFromLiveKit → room-place allocation race (defect D)', () => {
  it('gives two concurrent joiners different seats (defect: unlocked read-then-create allocates the same cell)', async () => {
    const room = createMockRoom({ _id: TEST_IDS.room })
    const meeting = createMockMeeting({ roomId: room._id })
    const { client, createDocCalls } = createFakeClient({ meeting, room, participantsSnapshot: [] })
    const wc = makeWorkspaceClient(createMockContext(), client)

    // Two different people join the same meeting "at the same time".
    await Promise.all([
      wc.upsertParticipantFromLiveKit(TEST_IDS.person1, 'Alice', null, meeting._id, 'session-a', {}),
      wc.upsertParticipantFromLiveKit(TEST_IDS.person2, 'Bob', null, meeting._id, 'session-b', {})
    ])

    expect(createDocCalls).toHaveLength(2)
    const [a, b] = createDocCalls.map((c) => ({ x: c.data.x, y: c.data.y }))
    expect(a).not.toEqual(b)
  })
})
