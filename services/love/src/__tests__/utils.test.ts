//
// Copyright © 2026 Intabia Fusion.
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

import { parseRoomName } from '@hcengineering/love'
import { parseParticipantMetadata, updateMetadata } from '../utils'
import { createMockContext } from './test-helpers'

describe('Utils - parseRoomName', () => {
  // Real format: `${workspaceUuid}_${Ref<MeetingMinutes>}`, neither part contains `_`.
  const realWorkspace = '550e8400-e29b-41d4-a716-446655440000'
  const realMeetingId = '65f4a2c9b1e8d3f7a9c2b4e6'

  it('should parse a valid LiveKit room name', () => {
    const result = parseRoomName(`${realWorkspace}_${realMeetingId}`)
    expect(result).toEqual({
      workspace: realWorkspace,
      meetingId: realMeetingId
    })
  })

  it('should return undefined when there is no separator', () => {
    expect(parseRoomName('invalidroomname')).toBeUndefined()
  })

  it('should return undefined for empty workspace', () => {
    expect(parseRoomName(`_${realMeetingId}`)).toBeUndefined()
  })

  it('should return undefined for empty meetingId', () => {
    expect(parseRoomName(`${realWorkspace}_`)).toBeUndefined()
  })

  it('should return undefined for empty string', () => {
    expect(parseRoomName('')).toBeUndefined()
  })
})

describe('Utils - parseParticipantMetadata', () => {
  it('should parse valid metadata', () => {
    const metadata = JSON.stringify({ x: 10, y: 20, isGuest: false })
    const result = parseParticipantMetadata(metadata)
    expect(result).toEqual({ x: 10, y: 20, isGuest: false })
  })

  it('should handle empty metadata', () => {
    const result = parseParticipantMetadata('')
    expect(result).toEqual({})
  })

  it('should handle null metadata', () => {
    const result = parseParticipantMetadata(null)
    expect(result).toEqual({})
  })

  it('should handle invalid JSON', () => {
    const result = parseParticipantMetadata('invalid-json')
    expect(result).toEqual({})
  })

  it('should handle undefined metadata', () => {
    const result = parseParticipantMetadata(undefined)
    expect(result).toEqual({})
  })

  it('should parse metadata with only x,y coordinates', () => {
    const metadata = JSON.stringify({ x: 5, y: 3 })
    const result = parseParticipantMetadata(metadata)
    expect(result).toEqual({ x: 5, y: 3 })
  })
})

describe('Utils - Room Name Scenarios', () => {
  describe('Room name scenarios for meetings', () => {
    it('should parse room name for private meeting', () => {
      const result = parseRoomName('ws-1_private-meeting-123')
      expect(result?.meetingId).toBe('private-meeting-123')
    })

    it('should parse room name for scheduled meeting', () => {
      const result = parseRoomName('ws-1_sched-meeting-456')
      expect(result?.meetingId).toBe('sched-meeting-456')
    })

    it('should handle UUID-style meeting IDs', () => {
      const result = parseRoomName('ws-1_550e8400-e29b-41d4-a716-446655440000')
      expect(result?.meetingId).toBe('550e8400-e29b-41d4-a716-446655440000')
    })
  })
})

// The queue consumer retries a throwing message forever, so a room LiveKit answers
// "no response from servers" for used to block every later webhook of the topic.
describe('Utils - updateMetadata', () => {
  it('swallows a LiveKit failure instead of failing the caller', async () => {
    const ctx = createMockContext()
    const roomClient = {
      listRooms: jest.fn().mockResolvedValue([{ name: 'ws_meeting', metadata: '{}' }]),
      updateRoomMetadata: jest.fn().mockRejectedValue(new Error('twirp error unknown: no response from servers'))
    }

    await expect(updateMetadata(ctx, roomClient as any, 'ws_meeting', { recording: true })).resolves.toBeUndefined()
    expect(ctx.warn).toHaveBeenCalled()
  })

  // Swallowing keeps the queue moving, but a one-off blip must not silently drop `recording`.
  it('retries a transient failure instead of dropping the update', async () => {
    const roomClient = {
      listRooms: jest.fn().mockResolvedValue([{ name: 'ws_meeting', metadata: '{}' }]),
      updateRoomMetadata: jest.fn().mockRejectedValueOnce(new Error('connection reset')).mockResolvedValue(undefined)
    }

    await updateMetadata(createMockContext(), roomClient as any, 'ws_meeting', { recording: true })

    expect(roomClient.updateRoomMetadata).toHaveBeenCalledTimes(2)
  })

  it('merges into the metadata the room carries right now', async () => {
    const roomClient = {
      listRooms: jest
        .fn()
        .mockResolvedValue([{ name: 'ws_meeting', metadata: '{"projectKey":"p","recording":false}' }]),
      updateRoomMetadata: jest.fn().mockResolvedValue(undefined)
    }

    await updateMetadata(createMockContext(), roomClient as any, 'ws_meeting', { recording: true })

    expect(JSON.parse(roomClient.updateRoomMetadata.mock.calls[0][1])).toEqual({ projectKey: 'p', recording: true })
  })
})
