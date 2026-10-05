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

import { AccountUuid, Ref, WorkspaceUuid } from '@hcengineering/core'
import { Person } from '@hcengineering/contact'
import { MeetingMinutes } from '@hcengineering/love'
import { claimSession, kickParticipant, liveSessionsOf } from '../sessions'
import { createMockContext, createMockMeeting } from './test-helpers'

const workspace = 'workspace-1' as WorkspaceUuid
const joined = 'meeting-new' as Ref<MeetingMinutes>
const abandoned = 'meeting-old' as Ref<MeetingMinutes>
const person = 'person-1' as Ref<Person>

describe('claimSession', () => {
  let roomClient: { listParticipants: jest.Mock, removeParticipant: jest.Mock }
  let wsClient: { findParticipantInfosByPerson: jest.Mock }

  beforeEach(() => {
    roomClient = {
      listParticipants: jest.fn().mockResolvedValue([{ identity: person }]),
      removeParticipant: jest.fn().mockResolvedValue(undefined)
    }
    wsClient = { findParticipantInfosByPerson: jest.fn().mockResolvedValue([]) }
  })

  async function claim (): Promise<number> {
    return await claimSession(createMockContext(), roomClient as any, wsClient as any, workspace, person, joined)
  }

  it('evicts the seats left in other meetings', async () => {
    wsClient.findParticipantInfosByPerson.mockResolvedValue([{ meeting: abandoned }, { meeting: joined }])

    expect(await claim()).toBe(1)
    expect(roomClient.removeParticipant).toHaveBeenCalledTimes(1)
    expect(roomClient.removeParticipant).toHaveBeenCalledWith(`${workspace}_${abandoned}`, person)
  })

  it('leaves the meeting being joined alone', async () => {
    wsClient.findParticipantInfosByPerson.mockResolvedValue([{ meeting: joined }])

    expect(await claim()).toBe(0)
    expect(roomClient.removeParticipant).not.toHaveBeenCalled()
  })

  // Without this check a forged `_id` would kick anyone out of the meeting they are in.
  it('refuses a claim from someone LiveKit does not report in the room', async () => {
    roomClient.listParticipants.mockResolvedValue([{ identity: 'someone-else' }])
    wsClient.findParticipantInfosByPerson.mockResolvedValue([{ meeting: abandoned }])

    expect(await claim()).toBe(0)
    expect(roomClient.removeParticipant).not.toHaveBeenCalled()
    expect(wsClient.findParticipantInfosByPerson).not.toHaveBeenCalled()
  })

  it('treats an unreachable LiveKit as no claim rather than evicting blindly', async () => {
    roomClient.listParticipants.mockRejectedValue(new Error('boom'))
    wsClient.findParticipantInfosByPerson.mockResolvedValue([{ meeting: abandoned }])

    expect(await claim()).toBe(0)
    expect(roomClient.removeParticipant).not.toHaveBeenCalled()
  })

  it('keeps going when one eviction fails', async () => {
    wsClient.findParticipantInfosByPerson.mockResolvedValue([
      { meeting: 'meeting-a' as Ref<MeetingMinutes> },
      { meeting: 'meeting-b' as Ref<MeetingMinutes> }
    ])
    roomClient.removeParticipant.mockRejectedValueOnce(new Error('room gone'))

    expect(await claim()).toBe(1)
    expect(roomClient.removeParticipant).toHaveBeenCalledTimes(2)
  })
})

describe('liveSessionsOf', () => {
  const roomOf = (m: string): string => `${workspace}_${m}`

  it('keeps only the meetings LiveKit still holds the person in', async () => {
    const roomClient = {
      listParticipants: jest.fn(async (room: string) =>
        room === roomOf(abandoned) ? [{ identity: person }] : [{ identity: 'someone-else' }]
      )
    }

    const live = await liveSessionsOf(createMockContext(), roomClient as any, workspace, person, [abandoned, joined])

    expect(live).toEqual([abandoned])
  })

  // A row outlives a closed tab by `departureTimeout`; the room is gone, so nothing is live.
  it('drops a candidate whose room no longer exists', async () => {
    const roomClient = { listParticipants: jest.fn().mockRejectedValue(new Error('room not found')) }

    expect(await liveSessionsOf(createMockContext(), roomClient as any, workspace, person, [abandoned])).toEqual([])
  })
})

describe('kickParticipant', () => {
  const owner = 'account-owner' as AccountUuid
  const member = 'account-member' as AccountUuid
  const removed = 'account-removed' as AccountUuid
  const meeting = createMockMeeting({ _id: joined, private: true, owners: [owner], members: [owner, member] })

  let ctx: ReturnType<typeof createMockContext>
  let roomClient: { removeParticipant: jest.Mock }
  let wsClient: { findPersonByAccount: jest.Mock }

  beforeEach(() => {
    ctx = createMockContext()
    roomClient = { removeParticipant: jest.fn().mockResolvedValue(undefined) }
    wsClient = { findPersonByAccount: jest.fn().mockResolvedValue(person) }
  })

  async function kick (target: AccountUuid): Promise<number> {
    return await kickParticipant(ctx, roomClient as any, wsClient as any, workspace, meeting, target)
  }

  it('kicks someone already taken out of members', async () => {
    expect(await kick(removed)).toBe(200)
    expect(roomClient.removeParticipant).toHaveBeenCalledWith(`${workspace}_${joined}`, person)
  })

  // A direct call must not drop an owner or a member the client never removed.
  it('refuses to kick an owner or a current member', async () => {
    expect(await kick(owner)).toBe(409)
    expect(await kick(member)).toBe(409)
    expect(roomClient.removeParticipant).not.toHaveBeenCalled()
  })

  it('answers 404 for an account without a person', async () => {
    wsClient.findPersonByAccount.mockResolvedValue(undefined)

    expect(await kick(removed)).toBe(404)
  })

  // Removing an invited member who never joined is the common case, not an error.
  it('treats a participant not in the room as done', async () => {
    roomClient.removeParticipant.mockRejectedValue(new Error('participant not found'))

    expect(await kick(removed)).toBe(200)
    expect(ctx.error).not.toHaveBeenCalled()
  })
})
