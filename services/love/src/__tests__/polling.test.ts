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

import { Ref, WorkspaceUuid } from '@hcengineering/core'
import { MeetingMinutes } from '@hcengineering/love'
import { LiveKitPollingService } from '../polling'
import { WorkspaceClient } from '../workspaceClient'
import { createMockContext } from './test-helpers'

jest.mock('../workspaceClient')

const workspace = 'workspace-1' as WorkspaceUuid
const meetingId = 'meeting-1' as Ref<MeetingMinutes>
const roomName = `${workspace}_${meetingId}`

function createMockRoomClient (): { listRooms: jest.Mock, listParticipants: jest.Mock } {
  return {
    listRooms: jest.fn().mockResolvedValue([]),
    listParticipants: jest.fn().mockResolvedValue([])
  }
}

// Plain object of jest.fn props (not jest.Mocked<WorkspaceClient>) so expect(wsClient.fn) passes unbound-method lint.
function createMockWsClient (): Record<string, jest.Mock> {
  return {
    checkUnfinishedMeetings: jest.fn().mockResolvedValue(undefined),
    finishMeeting: jest.fn().mockResolvedValue(undefined),
    findParticipantInfosByMeeting: jest.fn().mockResolvedValue([]),
    removeParticipantInfoById: jest.fn().mockResolvedValue(undefined),
    findPersonRefById: jest.fn().mockResolvedValue(undefined),
    upsertParticipantFromLiveKit: jest.fn().mockResolvedValue(undefined),
    removeParticipantFromLiveKit: jest.fn().mockResolvedValue(undefined),
    cleanupOrphanedParticipantInfos: jest.fn().mockResolvedValue(undefined),
    cleanupOrphanedPendingRecordings: jest.fn().mockResolvedValue(undefined)
  }
}

describe('LiveKitPollingService.poll', () => {
  let roomClient: ReturnType<typeof createMockRoomClient>
  let wsClient: Record<string, jest.Mock>
  let billingProducer: { send: jest.Mock, close: jest.Mock }
  let service: LiveKitPollingService

  beforeEach(() => {
    jest.clearAllMocks()
    roomClient = createMockRoomClient()
    wsClient = createMockWsClient()
    billingProducer = { send: jest.fn().mockResolvedValue(undefined), close: jest.fn().mockResolvedValue(undefined) }
    ;(WorkspaceClient.create as jest.Mock).mockResolvedValue(wsClient)

    service = new LiveKitPollingService(
      createMockContext(),
      roomClient as any,
      {
        intervalMs: 1000,
        projectKey: 'test-project'
      },
      billingProducer as any
    )
    // isRunning gate blocks poll() unless start()/stop() flips it; set directly to skip the setInterval side effects.
    ;(service as any).isRunning = true
  })

  it('passes current snapshot meetingIds to checkUnfinishedMeetings, respecting the workspace filter', async () => {
    roomClient.listRooms.mockResolvedValue([
      { name: roomName, metadata: JSON.stringify({ projectKey: 'test-project' }) },
      { name: 'other-ws_meeting-2', metadata: JSON.stringify({ projectKey: 'test-project' }) }
    ])
    service.addWorkspaceToCheck(workspace)

    await (service as any).poll()

    expect(wsClient.checkUnfinishedMeetings).toHaveBeenCalledWith([meetingId])
  })

  it('cleanupStaleRoomStates finishes the meeting for a room that disappeared between polls', async () => {
    roomClient.listRooms.mockResolvedValueOnce([
      { name: roomName, metadata: JSON.stringify({ projectKey: 'test-project' }) }
    ])
    await (service as any).poll()
    expect((service as any).roomStates.has(roomName)).toBe(true)

    roomClient.listRooms.mockResolvedValueOnce([])
    await (service as any).poll()

    expect(wsClient.finishMeeting).toHaveBeenCalledWith(meetingId, expect.any(Number))
    expect((service as any).roomStates.has(roomName)).toBe(false)
  })

  describe('LiveKit outage drain', () => {
    it('does not drain on the first failing poll', async () => {
      roomClient.listRooms.mockRejectedValue(new Error('unreachable'))

      await (service as any).poll()

      expect(wsClient.checkUnfinishedMeetings).not.toHaveBeenCalled()
    })

    it('drains once per outage after 15s, and does not re-drain on a later poll within the same outage', async () => {
      roomClient.listRooms.mockRejectedValue(new Error('unreachable'))
      service.addWorkspaceToCheck(workspace)

      const now = Date.now()
      const dateSpy = jest.spyOn(Date, 'now')

      dateSpy.mockReturnValue(now)
      await (service as any).poll() // failure #1, starts outage clock

      dateSpy.mockReturnValue(now + 16_000)
      await (service as any).poll() // failure #2, past 15s -> drains

      expect(wsClient.checkUnfinishedMeetings).toHaveBeenCalledTimes(1)
      expect(wsClient.checkUnfinishedMeetings).toHaveBeenCalledWith([])

      dateSpy.mockReturnValue(now + 20_000)
      await (service as any).poll() // failure #3, still same outage -> no re-drain

      expect(wsClient.checkUnfinishedMeetings).toHaveBeenCalledTimes(1)

      dateSpy.mockRestore()
    })

    it('resets the outage tracker after a successful poll', async () => {
      roomClient.listRooms.mockRejectedValue(new Error('unreachable'))
      service.addWorkspaceToCheck(workspace)

      const now = Date.now()
      const dateSpy = jest.spyOn(Date, 'now')
      dateSpy.mockReturnValue(now)
      await (service as any).poll()
      dateSpy.mockReturnValue(now + 16_000)
      await (service as any).poll()
      expect(wsClient.checkUnfinishedMeetings).toHaveBeenCalledTimes(1)
      dateSpy.mockRestore()

      // Successful poll clears livekitFailureSince/livekitDrainedAt (also drains workspacesToCheck normally -> +1 call).
      roomClient.listRooms.mockResolvedValue([])
      await (service as any).poll()
      expect((service as any).livekitFailureSince).toBeNull()
      expect((service as any).livekitDrainedAt).toBeNull()
      expect(wsClient.checkUnfinishedMeetings).toHaveBeenCalledTimes(2)

      // A fresh outage should be able to drain again after another 15s.
      roomClient.listRooms.mockRejectedValue(new Error('unreachable again'))
      service.addWorkspaceToCheck(workspace)
      const now2 = Date.now()
      const dateSpy2 = jest.spyOn(Date, 'now')
      dateSpy2.mockReturnValue(now2)
      await (service as any).poll()
      dateSpy2.mockReturnValue(now2 + 16_000)
      await (service as any).poll()
      expect(wsClient.checkUnfinishedMeetings).toHaveBeenCalledTimes(3)
      dateSpy2.mockRestore()
    })
  })

  describe('meeting-minutes billing', () => {
    const activeRoom = { name: roomName, metadata: JSON.stringify({ projectKey: 'test-project' }) }

    // LiveKit reports joinedAt in seconds; polling.ts scales anything below 1e12 to ms.
    function participant (sid: string, joinedAtSec: number, agent = false): any {
      return {
        sid,
        identity: `identity-${sid}`,
        joinedAt: joinedAtSec,
        permission: agent ? { agent: true } : undefined
      }
    }

    function usageDeltas (): any[] {
      return billingProducer.send.mock.calls.flatMap((call) => call[2]).filter((m) => m.metric === 'meetingMinutes')
    }

    it('bills only the un-sent delta on each poll', async () => {
      const now = Date.now()
      const joinedAtSec = Math.floor(now / 1000) - 60
      const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(now)
      roomClient.listRooms.mockResolvedValue([activeRoom])
      roomClient.listParticipants.mockResolvedValue([participant('sid-1', joinedAtSec)])

      await (service as any).poll()
      dateSpy.mockReturnValue(now + 30_000)
      await (service as any).poll()

      // 60s elapsed at the first poll, then only the following 30s.
      expect(usageDeltas().map((m) => m.amount)).toEqual([60, 30])
      dateSpy.mockRestore()
    })

    it('uses a distinct idempotency ref per cumulative total', async () => {
      const now = Date.now()
      const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(now)
      roomClient.listRooms.mockResolvedValue([activeRoom])
      roomClient.listParticipants.mockResolvedValue([participant('sid-1', Math.floor(now / 1000) - 10)])

      await (service as any).poll()
      dateSpy.mockReturnValue(now + 30_000)
      await (service as any).poll()

      const refs = usageDeltas().map((m) => m.ref)
      expect(new Set(refs).size).toBe(refs.length)
      expect(refs[0]).toContain('sid-1')
      dateSpy.mockRestore()
    })

    it('does not bill agent participants', async () => {
      const now = Date.now()
      const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(now)
      roomClient.listRooms.mockResolvedValue([activeRoom])
      roomClient.listParticipants.mockResolvedValue([participant('agent-1', Math.floor(now / 1000) - 60, true)])

      await (service as any).poll()

      expect(usageDeltas()).toHaveLength(0)
      dateSpy.mockRestore()
    })

    it('stops billing a participant who left, even when the room lives on', async () => {
      const now = Date.now()
      const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(now)
      roomClient.listRooms.mockResolvedValue([activeRoom])
      roomClient.listParticipants.mockResolvedValueOnce([participant('sid-1', Math.floor(now / 1000) - 60)])

      await (service as any).poll()
      const afterFirst = usageDeltas().length

      // Participant is gone; the room keeps running for another hour.
      roomClient.listParticipants.mockResolvedValue([])
      dateSpy.mockReturnValue(now + 3_600_000)
      await (service as any).poll()

      expect(usageDeltas()).toHaveLength(afterFirst)
      expect((service as any).roomStates.get(roomName).sentByParticipant.size).toBe(0)
      dateSpy.mockRestore()
    })

    it('does not bill a departed participant when the room is later cleaned up', async () => {
      const now = Date.now()
      const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(now)
      roomClient.listRooms.mockResolvedValueOnce([activeRoom])
      roomClient.listParticipants.mockResolvedValueOnce([participant('sid-1', Math.floor(now / 1000) - 60)])
      await (service as any).poll()

      // Left after a minute, room stays up for an hour, then disappears -> final flush must add nothing.
      roomClient.listRooms.mockResolvedValueOnce([activeRoom])
      roomClient.listParticipants.mockResolvedValueOnce([])
      dateSpy.mockReturnValue(now + 3_600_000)
      await (service as any).poll()

      const beforeCleanup = usageDeltas().reduce((sum, m) => sum + m.amount, 0)
      roomClient.listRooms.mockResolvedValueOnce([])
      await (service as any).poll()

      expect(usageDeltas().reduce((sum, m) => sum + m.amount, 0)).toBe(beforeCleanup)
      dateSpy.mockRestore()
    })

    it('flushes the remaining time for a participant still present at cleanup', async () => {
      const now = Date.now()
      const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(now)
      roomClient.listRooms.mockResolvedValueOnce([activeRoom])
      roomClient.listParticipants.mockResolvedValue([participant('sid-1', Math.floor(now / 1000) - 60)])
      await (service as any).poll()

      dateSpy.mockReturnValue(now + 30_000)
      roomClient.listRooms.mockResolvedValueOnce([])
      await (service as any).poll()

      // 60s billed while polling, 30s remainder flushed when the room vanished.
      expect(usageDeltas().reduce((sum, m) => sum + m.amount, 0)).toBe(90)
      dateSpy.mockRestore()
    })
  })

  it('processRoom error for one room does not abort processing of other rooms', async () => {
    const otherMeetingId = 'meeting-2' as Ref<MeetingMinutes>
    const otherRoomName = `${workspace}_${otherMeetingId}`
    roomClient.listRooms.mockResolvedValue([
      { name: roomName, metadata: JSON.stringify({ projectKey: 'test-project' }) },
      { name: otherRoomName, metadata: JSON.stringify({ projectKey: 'test-project' }) }
    ])
    roomClient.listParticipants.mockImplementation(async (name: string) => {
      if (name === roomName) throw new Error('listParticipants failed')
      return []
    })

    await (service as any).poll()

    // First room's listParticipants threw, but the second room's state must still be recorded.
    expect((service as any).roomStates.has(roomName)).toBe(false)
    expect((service as any).roomStates.has(otherRoomName)).toBe(true)
  })
})
