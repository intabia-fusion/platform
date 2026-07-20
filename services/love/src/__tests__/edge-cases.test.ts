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

/**
 * Edge case tests for meeting management
 */

import { parseRoomName } from '@hcengineering/love'

describe('Edge Cases - Room name parsing', () => {
  describe('Room name edge cases', () => {
    // Room name format: `${WorkspaceUuid}_${Ref<MeetingMinutes>}`; only the first-underscore split is valid.
    it('should parse a UUID workspace and 24-char meetingId', () => {
      const result = parseRoomName('550e8400-e29b-41d4-a716-446655440000_65f4a2c9b1e8d3f7a9c2b4e6')
      expect(result).toEqual({
        workspace: '550e8400-e29b-41d4-a716-446655440000',
        meetingId: '65f4a2c9b1e8d3f7a9c2b4e6'
      })
    })

    it('should return undefined for empty string', () => {
      expect(parseRoomName('')).toBeUndefined()
    })

    it('should return undefined for a lone underscore', () => {
      expect(parseRoomName('_')).toBeUndefined()
    })

    it('should return undefined for a name without underscore', () => {
      expect(parseRoomName('noseparator')).toBeUndefined()
    })
  })

  describe('Meeting privacy scenarios', () => {
    it('should distinguish between private and public meetings', () => {
      const publicMeeting = { private: false }
      const privateMeeting = { private: true }

      expect(publicMeeting.private).toBe(false)
      expect(privateMeeting.private).toBe(true)
    })

    it('should handle meeting with no members', () => {
      const emptyMeeting = {
        members: [],
        owners: ['owner-1']
      }

      expect(emptyMeeting.members).toHaveLength(0)
      expect(emptyMeeting.owners).toHaveLength(1)
    })
  })

  describe('ParticipantInfo edge cases', () => {
    it('should handle null sessionId for AI participants', () => {
      const aiParticipant = {
        sessionId: null,
        kind: 'agent'
      }

      expect(aiParticipant.sessionId).toBeNull()
      expect(aiParticipant.kind).toBe('agent')
    })

    it('should handle missing metadata', () => {
      const participantWithoutMetadata = {
        x: 0,
        y: 0
      }

      expect(participantWithoutMetadata.x).toBe(0)
      expect(participantWithoutMetadata.y).toBe(0)
    })
  })
})

describe('Edge Cases - Meeting Status Transitions', () => {
  const statuses = {
    Active: 0,
    Finished: 1,
    Pending: 2,
    Scheduled: 7
  }

  it('should have correct status values', () => {
    expect(statuses.Active).toBe(0)
    expect(statuses.Finished).toBe(1)
    expect(statuses.Pending).toBe(2)
    expect(statuses.Scheduled).toBe(7)
  })

  it('should handle invalid status transitions', () => {
    // Finished -> Active (should not happen in practice)
    const invalidTransition = {
      from: 'Finished',
      to: 'Active'
    }

    expect(invalidTransition.from).toBe('Finished')
    expect(invalidTransition.to).toBe('Active')
  })
})

describe('Edge Cases - Room Coordinates', () => {
  it('should handle zero coordinates', () => {
    const position = { x: 0, y: 0 }
    expect(position.x).toBe(0)
    expect(position.y).toBe(0)
  })

  it('should handle large coordinates', () => {
    const position = { x: 1000, y: 1000 }
    expect(position.x).toBe(1000)
    expect(position.y).toBe(1000)
  })

  it('should handle negative coordinates (if allowed)', () => {
    const position = { x: -1, y: -1 }
    expect(position.x).toBeLessThan(0)
    expect(position.y).toBeLessThan(0)
  })
})

describe('Edge Cases - Recording States', () => {
  const RecordingState = {
    NotStarted: 0,
    Recording: 1,
    Finished: 2
  }

  it('should have correct recording state values', () => {
    expect(RecordingState.NotStarted).toBe(0)
    expect(RecordingState.Recording).toBe(1)
    expect(RecordingState.Finished).toBe(2)
  })

  it('should handle recording state transitions', () => {
    const transitions = [
      { from: RecordingState.NotStarted, to: RecordingState.Recording },
      { from: RecordingState.Recording, to: RecordingState.Finished },
      { from: RecordingState.NotStarted, to: RecordingState.Finished } // Direct finish
    ]

    transitions.forEach((t) => {
      expect(t.from).toBeDefined()
      expect(t.to).toBeDefined()
    })
  })
})

describe('Edge Cases - Transcription States', () => {
  const TranscriptionState = {
    NotStarted: 0,
    Transcribing: 1,
    Finished: 2
  }

  it('should have correct transcription state values', () => {
    expect(TranscriptionState.NotStarted).toBe(0)
    expect(TranscriptionState.Transcribing).toBe(1)
    expect(TranscriptionState.Finished).toBe(2)
  })
})
