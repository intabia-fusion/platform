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
  type Class,
  type Doc,
  generateId,
  type MeasureContext,
  type Ref,
  toFindResult,
  type Tx,
  TxFactory,
  type TxCreateDoc
} from '@hcengineering/core'
import type { TriggerControl } from '@hcengineering/server-core'
import type { Person } from '@hcengineering/contact'
import love, { type ParticipantInfo, type Room, type RoomInfo } from '@hcengineering/love'
import { OnParticipantInfo } from '../index'

const roomRef = 'room:1' as Ref<Room>
const personA = 'person:a' as Ref<Person>

function createControl (roomInfos: RoomInfo[]): TriggerControl {
  const room = { _id: roomRef, _class: love.class.Room, type: undefined } as unknown as Room
  return {
    ctx: { error: jest.fn(), info: jest.fn() } as unknown as MeasureContext,
    findAll: jest.fn(async (_ctx: any, _class: Ref<Class<Doc>>) =>
      toFindResult(_class === love.class.Room ? [room] : [])
    ),
    queryFind: jest.fn().mockResolvedValue(roomInfos),
    txFactory: new TxFactory(core.account.System, true),
    removedMap: new Map()
  } as unknown as TriggerControl
}

function createJoinTx (): Tx {
  return {
    _id: generateId(),
    _class: core.class.TxCreateDoc,
    space: core.space.DerivedTx,
    objectId: generateId(),
    objectClass: love.class.ParticipantInfo,
    objectSpace: core.space.Workspace,
    modifiedOn: Date.now(),
    modifiedBy: core.account.System,
    attributes: { person: personA, room: roomRef, sessionId: 's1', name: 'A', x: 0, y: 0 }
  } as unknown as TxCreateDoc<ParticipantInfo>
}

describe('OnParticipantInfo room join', () => {
  it('does not create a second RoomInfo when the person is already in it', async () => {
    const existing = {
      _id: 'ri:1',
      _class: love.class.RoomInfo,
      room: roomRef,
      persons: [personA]
    } as unknown as RoomInfo

    const result = await OnParticipantInfo([createJoinTx()], createControl([existing]))

    expect(result.filter((tx) => tx._class === core.class.TxCreateDoc)).toHaveLength(0)
  })
})
