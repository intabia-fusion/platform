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
 * Test helpers and fixtures for love service tests
 */

import { Ref, AccountUuid, WorkspaceUuid, MeasureContext, PersonId, Class, Space } from '@hcengineering/core'
import { MeetingMinutes, MeetingStatus, ParticipantInfo, Room, RoomType, Floor } from '@hcengineering/love'
import { Person } from '@hcengineering/contact'

// Test IDs
export const TEST_IDS = {
  meeting: 'meeting-test-1' as Ref<MeetingMinutes>,
  meeting2: 'meeting-test-2' as Ref<MeetingMinutes>,
  room: 'room-test-1' as Ref<Room>,
  room2: 'room-test-2' as Ref<Room>,
  person1: 'person-test-1' as Ref<Person>,
  person2: 'person-test-2' as Ref<Person>,
  person3: 'person-test-3' as Ref<Person>,
  account1: 'account-test-1' as AccountUuid,
  account2: 'account-test-2' as AccountUuid,
  workspace: 'workspace-test-1' as WorkspaceUuid,
  participant1: 'participant-test-1' as Ref<ParticipantInfo>,
  participant2: 'participant-test-2' as Ref<ParticipantInfo>
}

// Test timestamps
export const TEST_TIMESTAMPS = {
  now: Date.now(),
  past: Date.now() - 3600000, // 1 hour ago
  future: Date.now() + 3600000 // 1 hour from now
}

// Mock context factory
export function createMockContext (): MeasureContext {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    measure: jest.fn(() => ({ end: jest.fn() })),
    newChild: jest.fn(function () {
      return this
    }),
    contextData: {},
    with: jest.fn(),
    withSync: jest.fn(),
    extractMeta: jest.fn(),
    logger: jest.fn()
  } as unknown as MeasureContext
}

// Meeting factories
export function createMockMeeting (overrides?: Partial<MeetingMinutes>): MeetingMinutes {
  return {
    _id: TEST_IDS.meeting,
    _class: 'love.class.MeetingMinutes' as Ref<Class<MeetingMinutes>>,
    space: 'core.space.Workspace' as Ref<Space>,
    name: 'Test Meeting',
    description: '',
    descriptionRef: null,
    summary: null,
    private: false,
    archived: false,
    members: [TEST_IDS.account1],
    owners: [TEST_IDS.account1],
    roomId: TEST_IDS.room,
    status: MeetingStatus.Active,
    transcriptionState: 0,
    recordingState: 0,
    language: 'en',
    startWithRecording: false,
    startWithTranscription: false,
    createdBy: TEST_IDS.account1 as unknown as PersonId,
    createdOn: TEST_TIMESTAMPS.now,
    modifiedBy: TEST_IDS.account1 as unknown as PersonId,
    modifiedOn: TEST_TIMESTAMPS.now,
    ...overrides
  }
}

export function createMockPrivateMeeting (overrides?: Partial<MeetingMinutes>): MeetingMinutes {
  return createMockMeeting({
    private: true,
    members: [TEST_IDS.account1, TEST_IDS.account2],
    ...overrides
  })
}

export function createMockPendingMeeting (overrides?: Partial<MeetingMinutes>): MeetingMinutes {
  return createMockMeeting({
    status: MeetingStatus.Pending,
    ...overrides
  })
}

export function createMockFinishedMeeting (overrides?: Partial<MeetingMinutes>): MeetingMinutes {
  return createMockMeeting({
    status: MeetingStatus.Finished,
    meetingEnd: TEST_TIMESTAMPS.now,
    ...overrides
  })
}

// Participant factories
export function createMockParticipant (overrides?: Partial<ParticipantInfo>): ParticipantInfo {
  return {
    _id: TEST_IDS.participant1,
    _class: 'love.class.ParticipantInfo' as Ref<Class<ParticipantInfo>>,
    space: 'core.space.Workspace' as Ref<Space>,
    person: TEST_IDS.person1,
    name: 'Test Person',
    meeting: TEST_IDS.meeting,
    room: TEST_IDS.room,
    x: 0,
    y: 0,
    kind: 'user',
    sessionId: 'session-1',
    account: TEST_IDS.account1,
    createdBy: TEST_IDS.account1 as unknown as PersonId,
    createdOn: TEST_TIMESTAMPS.now,
    modifiedBy: TEST_IDS.account1 as unknown as PersonId,
    modifiedOn: TEST_TIMESTAMPS.now,
    ...overrides
  }
}

export function createMockAgentParticipant (overrides?: Partial<ParticipantInfo>): ParticipantInfo {
  return createMockParticipant({
    _id: 'participant-agent-1' as Ref<ParticipantInfo>,
    person: 'person-agent-1' as Ref<Person>,
    name: 'AI Agent',
    kind: 'agent',
    sessionId: null,
    ...overrides
  })
}

// Room factories
export function createMockRoom (overrides?: Partial<Room>): Room {
  return {
    _id: TEST_IDS.room,
    _class: 'love.class.Room' as Ref<Class<Room>>,
    space: 'core.space.Workspace' as Ref<Space>,
    name: 'Test Room',
    type: RoomType.Video,
    floor: 'floor-1' as Ref<Floor>,
    width: 4,
    height: 3,
    x: 0,
    y: 0,
    language: 'en',
    startWithRecording: false,
    startWithTranscription: false,
    startPrivate: false,
    description: null,
    createdBy: TEST_IDS.account1 as unknown as PersonId,
    createdOn: TEST_TIMESTAMPS.now,
    modifiedBy: TEST_IDS.account1 as unknown as PersonId,
    modifiedOn: TEST_TIMESTAMPS.now,
    ...overrides
  }
}

export function createMockOffice (overrides?: Partial<Room>): Room {
  return createMockRoom({
    _id: 'office-test-1' as Ref<Room>,
    _class: 'love.class.Office' as Ref<Class<Room>>,
    name: 'Test Office',
    type: RoomType.Audio,
    ...overrides
  })
}

// Mock client factory
export function createMockRestClient (): {
  findOne: jest.Mock
  findAll: jest.Mock
  createDoc: jest.Mock
  remove: jest.Mock
  update: jest.Mock
  addCollection: jest.Mock
  tx: jest.Mock
} {
  return {
    findOne: jest.fn(),
    findAll: jest.fn(),
    createDoc: jest.fn(),
    remove: jest.fn(),
    update: jest.fn(),
    addCollection: jest.fn(),
    tx: jest.fn()
  }
}

// Test scenarios
export const TEST_SCENARIOS = {
  // Single participant joins
  singleParticipantJoins: {
    initialPersons: [],
    participants: [{ person: TEST_IDS.person1 }],
    expectedPersons: [TEST_IDS.person1]
  },

  // Multiple participants join
  multipleParticipantsJoin: {
    initialPersons: [TEST_IDS.person1],
    participants: [{ person: TEST_IDS.person1 }, { person: TEST_IDS.person2 }],
    expectedPersons: [TEST_IDS.person1, TEST_IDS.person2]
  },

  // Participant leaves
  participantLeaves: {
    initialPersons: [TEST_IDS.person1, TEST_IDS.person2],
    participants: [{ person: TEST_IDS.person2 }],
    expectedPersons: [TEST_IDS.person2]
  },

  // All participants leave
  allParticipantsLeave: {
    initialPersons: [TEST_IDS.person1, TEST_IDS.person2],
    participants: [],
    expectedPersons: []
  }
}

// Helper to reset all mocks
export function resetMocks (mockClient: any, mockContext: MeasureContext): void {
  jest.clearAllMocks()
  if (mockClient != null) {
    mockClient.findOne.mockReset()
    mockClient.findAll.mockReset()
    mockClient.createDoc.mockReset()
    mockClient.remove.mockReset()
    mockClient.update.mockReset()
  }
}

// Async helper to wait for promises
export async function flushPromises (): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
}
