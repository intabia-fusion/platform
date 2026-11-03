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
  type Doc,
  generateId,
  type MeasureContext,
  type PersonId,
  type Ref,
  type Space,
  toFindResult,
  type Tx,
  TxFactory,
  type TxUpdateDoc
} from '@hcengineering/core'
import type { TriggerControl } from '@hcengineering/server-core'
import love, { type PermanentMeeting } from '@hcengineering/love'
import { OnPermanentMeetingUpdate } from '../index'

// -- Fixtures --

const meetingId = 'permanent:1' as Ref<PermanentMeeting>
const spaceId = 'permanent:space' as Ref<Space>
const ownerA = 'account:a' as AccountUuid
const ownerB = 'account:b' as AccountUuid
const memberC = 'account:c' as AccountUuid

function createPermanentMeeting (opts?: { owners?: AccountUuid[], members?: AccountUuid[] }): PermanentMeeting {
  const owners = opts?.owners ?? [ownerA]
  return {
    _id: meetingId,
    _class: love.class.PermanentMeeting,
    space: spaceId,
    name: 'Daily standup',
    description: '',
    private: true,
    archived: false,
    members: opts?.members ?? [ownerA, memberC],
    owners,
    descriptionRef: null,
    type: 0,
    language: 'en',
    modifiedOn: Date.now(),
    modifiedBy: core.account.System
  } as unknown as PermanentMeeting
}

function createUpdateTx (
  ops: Record<string, any>,
  objectClass: Ref<Class<Doc>> = love.class.PermanentMeeting,
  txClass: Ref<Class<Doc>> = core.class.TxUpdateDoc
): Tx {
  return {
    _id: generateId(),
    _class: txClass,
    space: core.space.DerivedTx,
    objectId: meetingId,
    objectClass: objectClass as Ref<Class<PermanentMeeting>>,
    objectSpace: spaceId,
    modifiedOn: Date.now(),
    modifiedBy: 'creator' as PersonId,
    operations: ops
  } satisfies TxUpdateDoc<PermanentMeeting> as unknown as Tx
}

function createMockControl (meeting: PermanentMeeting | undefined): TriggerControl {
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
      const matched = _class === love.class.PermanentMeeting && meeting !== undefined && query._id === meeting._id
      return toFindResult(matched ? [meeting] : [])
    }),
    txFactory: new TxFactory(core.account.System, true),
    hierarchy: {} as any,
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

function getPushedMembers (txes: Tx[]): AccountUuid[] | undefined {
  const update = txes.find((tx) => tx._class === core.class.TxUpdateDoc) as TxUpdateDoc<PermanentMeeting> | undefined
  // `$push.members` is either a bare ref or an `$each` position: this trigger only ever writes the position.
  const ops = update?.operations as { $push?: { members?: { $each: AccountUuid[] } } } | undefined
  return ops?.$push?.members?.$each
}

// -- Tests --

describe('OnPermanentMeetingUpdate', () => {
  it('pushes an owner back when the members list drops them', async () => {
    const control = createMockControl(createPermanentMeeting())

    const result = await OnPermanentMeetingUpdate([createUpdateTx({ members: [memberC] })], control)

    expect(getPushedMembers(result)).toEqual([ownerA])
  })

  it('pushes back every owner the list lost', async () => {
    const control = createMockControl(createPermanentMeeting({ owners: [ownerA, ownerB] }))

    const result = await OnPermanentMeetingUpdate([createUpdateTx({ members: [memberC] })], control)

    expect(getPushedMembers(result)).toEqual([ownerA, ownerB])
  })

  it('leaves a members update alone when an owner stays', async () => {
    const control = createMockControl(createPermanentMeeting())

    const result = await OnPermanentMeetingUpdate([createUpdateTx({ members: [ownerA] })], control)

    expect(result).toHaveLength(0)
  })

  it('pushes an owner back when SpaceMembers pulls them out', async () => {
    const control = createMockControl(createPermanentMeeting())

    const result = await OnPermanentMeetingUpdate([createUpdateTx({ $pull: { members: ownerA } })], control)

    expect(getPushedMembers(result)).toEqual([ownerA])
  })

  it('pushes owners back when they are pulled with $in', async () => {
    const control = createMockControl(createPermanentMeeting({ owners: [ownerA, ownerB] }))

    const result = await OnPermanentMeetingUpdate(
      [createUpdateTx({ $pull: { members: { $in: [ownerA, memberC] } } })],
      control
    )

    expect(getPushedMembers(result)).toEqual([ownerA])
  })

  it('leaves a pull alone when it does not touch an owner', async () => {
    const control = createMockControl(createPermanentMeeting())

    const result = await OnPermanentMeetingUpdate([createUpdateTx({ $pull: { members: memberC } })], control)

    expect(result).toHaveLength(0)
  })

  it('ignores transactions that do not rewrite the members array', async () => {
    const control = createMockControl(createPermanentMeeting())

    const result = await OnPermanentMeetingUpdate([createUpdateTx({ name: 'Renamed' })], control)

    expect(result).toHaveLength(0)
  })

  it('ignores other classes and non-update transactions', async () => {
    const control = createMockControl(createPermanentMeeting())

    const result = await OnPermanentMeetingUpdate(
      [
        createUpdateTx({ members: [memberC] }, love.class.MeetingMinutes as unknown as Ref<Class<Doc>>),
        createUpdateTx({ members: [memberC] }, love.class.PermanentMeeting, core.class.TxCreateDoc)
      ],
      control
    )

    expect(result).toHaveLength(0)
  })

  it('does nothing when the meeting is already gone', async () => {
    const control = createMockControl(undefined)

    const result = await OnPermanentMeetingUpdate([createUpdateTx({ members: [memberC] })], control)

    expect(result).toHaveLength(0)
  })
})
