/**
  Copyright © 2026 Intabia Fusion.

  Licensed under the Eclipse Public License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License. You may
  obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.

  See the License for the specific language governing permissions and
  limitations under the License.
*/

import core, {
  type AccountUuid,
  type Class,
  type Data,
  type Doc,
  generateId,
  type MeasureContext,
  type PersonId,
  type Ref,
  toFindResult,
  type Tx,
  TxFactory,
  type TxCreateDoc
} from '@hcengineering/core'
import type { TriggerControl } from '@hcengineering/server-core'
import contact, { type Person, type PersonSpace } from '@hcengineering/contact'
import love, { type MeetingMinutes, type UserMeetingInvite } from '@hcengineering/love'
import { OnUserMeetingInvite } from '../index'

// -- Fixtures --

const senderPersonRef = 'person:sender' as Ref<Person>
const recipientPersonRef = 'person:recipient' as Ref<Person>
const senderAccount = 'account:sender' as AccountUuid
const meetingRef = 'meeting:1' as Ref<MeetingMinutes>
const recipientSpaceRef = 'space:recipient' as Ref<PersonSpace>

function createPerson (id: Ref<Person>, uuid?: AccountUuid): Person {
  return {
    _id: id,
    _class: contact.class.Person,
    space: contact.space.Contacts,
    name: 'Test,Person',
    city: '',
    avatarType: 'COLOR',
    personUuid: uuid,
    modifiedOn: Date.now(),
    modifiedBy: core.account.System
  } as unknown as Person
}

function createPersonSpace (): PersonSpace {
  return {
    _id: recipientSpaceRef,
    _class: contact.class.PersonSpace,
    space: core.space.Space,
    name: 'recipient personal',
    description: '',
    private: true,
    archived: false,
    members: [],
    person: recipientPersonRef,
    modifiedOn: Date.now(),
    modifiedBy: core.account.System
  } as unknown as PersonSpace
}

function createMeeting (opts: { private?: boolean, owners?: AccountUuid[] }): MeetingMinutes {
  return {
    _id: meetingRef,
    _class: love.class.MeetingMinutes,
    space: core.space.Space,
    name: 'Test Meeting',
    description: '',
    private: opts.private ?? false,
    archived: false,
    members: [],
    owners: opts.owners as any,
    modifiedOn: Date.now(),
    modifiedBy: core.account.System
  } as unknown as MeetingMinutes
}

function createInviteTx (): TxCreateDoc<UserMeetingInvite> {
  const attributes: Data<UserMeetingInvite> = {
    kind: 'invite-request',
    from: senderPersonRef,
    to: recipientPersonRef,
    meeting: meetingRef,
    expiresAt: Date.now() + 30_000,
    status: 'pending'
  }
  return {
    _id: generateId(),
    _class: core.class.TxCreateDoc,
    space: core.space.DerivedTx,
    objectId: generateId<UserMeetingInvite>(),
    objectClass: love.class.UserMeetingInvite,
    objectSpace: core.space.Workspace,
    modifiedOn: Date.now(),
    modifiedBy: 'sender' as PersonId,
    createdBy: 'sender' as PersonId,
    attributes
  } satisfies TxCreateDoc<UserMeetingInvite>
}

type FindAllFn = (_class: Ref<Class<Doc>>, query: any) => Doc[]

function createMockControl (findAllImpl: FindAllFn): TriggerControl {
  return {
    ctx: {
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      newChild: jest.fn().mockReturnThis(),
      contextData: { broadcast: { targets: {} } }
    } as unknown as MeasureContext,
    workspace: { url: 'test-ws', uuid: 'test-ws-uuid', dataId: 'test-data', accountsUrl: '' } as any,
    branding: null,
    findAll: jest.fn(async (_ctx: any, _class: Ref<Class<Doc>>, query: any) => {
      return toFindResult(findAllImpl(_class, query))
    }),
    txFactory: new TxFactory(core.account.System, true),
    hierarchy: {
      isDerived: (_class: Ref<Class<Doc>>, base: Ref<Class<Doc>>) => _class === base,
      hasMixin: () => false,
      as: (doc: Doc) => doc
    } as any,
    modelDb: {} as any,
    removedMap: new Map(),
    userStatusMap: new Map(),
    cache: new Map(),
    contextCache: new Map(),
    withScope: async <T>(_scope: string, fn: () => Promise<T>) => await fn(),
    txes: [],
    apply: jest.fn().mockResolvedValue({}),
    queryFind: jest.fn().mockResolvedValue([]),
    storageAdapter: {} as any,
    serviceAdaptersManager: {} as any,
    lowLevel: {} as any,
    domainRequest: jest.fn().mockResolvedValue({})
  } as unknown as TriggerControl
}

// Multiplexer: route findAll by requested class to the right fixture.
function buildFindAll (opts: {
  meeting: MeetingMinutes | undefined
  sender: Person | undefined
  recipientSpace: PersonSpace | undefined
}): FindAllFn {
  return (_class, query) => {
    if (_class === love.class.MeetingMinutes) {
      return opts.meeting !== undefined && (query._id === undefined || query._id === opts.meeting._id)
        ? [opts.meeting]
        : []
    }
    if (_class === contact.class.Person) {
      return opts.sender !== undefined && (query._id === undefined || query._id === opts.sender._id)
        ? [opts.sender]
        : []
    }
    if (_class === contact.class.PersonSpace) {
      return opts.recipientSpace !== undefined ? [opts.recipientSpace] : []
    }
    return []
  }
}

function countInviteResponseCreates (txes: Tx[]): number {
  return txes.filter(
    (tx) =>
      tx._class === core.class.TxCreateDoc &&
      (tx as TxCreateDoc<UserMeetingInvite>).objectClass === love.class.UserMeetingInvite
  ).length
}

// -- Tests --

describe('OnUserMeetingInvite - private meeting owners enforcement', () => {
  it('should create invite-response when meeting is public', async () => {
    const control = createMockControl(
      buildFindAll({
        meeting: createMeeting({ private: false }),
        sender: createPerson(senderPersonRef, senderAccount),
        recipientSpace: createPersonSpace()
      })
    )

    const result = await OnUserMeetingInvite([createInviteTx()], control)
    expect(countInviteResponseCreates(result)).toBeGreaterThanOrEqual(1)
  })

  it('should skip invite when meeting is private and sender is not in owners', async () => {
    const control = createMockControl(
      buildFindAll({
        meeting: createMeeting({ private: true, owners: ['other' as AccountUuid] }),
        sender: createPerson(senderPersonRef, senderAccount),
        recipientSpace: createPersonSpace()
      })
    )

    const result = await OnUserMeetingInvite([createInviteTx()], control)
    expect(countInviteResponseCreates(result)).toBe(0)
  })

  it('should create invite-response when meeting is private and sender is in owners', async () => {
    const control = createMockControl(
      buildFindAll({
        meeting: createMeeting({ private: true, owners: [senderAccount] }),
        sender: createPerson(senderPersonRef, senderAccount),
        recipientSpace: createPersonSpace()
      })
    )

    const result = await OnUserMeetingInvite([createInviteTx()], control)
    expect(countInviteResponseCreates(result)).toBeGreaterThanOrEqual(1)
  })

  // Regression: `owners` missing (undefined) on a private meeting must fail
  // closed. Otherwise a legacy/malformed meeting that never had its owners set
  // would silently accept invites from anyone.
  it('should skip invite when meeting is private and owners is undefined', async () => {
    const control = createMockControl(
      buildFindAll({
        meeting: createMeeting({ private: true, owners: undefined }),
        sender: createPerson(senderPersonRef, senderAccount),
        recipientSpace: createPersonSpace()
      })
    )

    const result = await OnUserMeetingInvite([createInviteTx()], control)
    expect(countInviteResponseCreates(result)).toBe(0)
  })

  // Regression: sender Person has no `personUuid` (unlinked account). There is
  // no way to check ownership, so invite to a private meeting must be rejected.
  it('should skip invite when sender has no personUuid and meeting is private', async () => {
    const control = createMockControl(
      buildFindAll({
        meeting: createMeeting({ private: true, owners: [senderAccount] }),
        sender: createPerson(senderPersonRef, undefined),
        recipientSpace: createPersonSpace()
      })
    )

    const result = await OnUserMeetingInvite([createInviteTx()], control)
    expect(countInviteResponseCreates(result)).toBe(0)
  })
})
