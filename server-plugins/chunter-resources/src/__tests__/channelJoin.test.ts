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

import { type ActivityMessage } from '@hcengineering/activity'
import chunter, { type Channel } from '@hcengineering/chunter'
import core, {
  type AccountUuid,
  MeasureMetricsContext,
  type Ref,
  toFindResult,
  type TxCreateDoc,
  TxFactory,
  type TxUpdateDoc
} from '@hcengineering/core'
import notification, { type ReadState } from '@hcengineering/notification'
import type { TriggerControl } from '@hcengineering/server-core'

import { OnChannelJoin } from '..'

const CHANNEL = 'space:channel' as Ref<Channel>
const STATE = 'state:channel' as Ref<ReadState>
const LATEST = 'msg:latest' as Ref<ActivityMessage>

const ALICE = 'acc-alice' as AccountUuid
const BOB = 'acc-bob' as AccountUuid

const JOINED_AT = 1000

function readState (fields: Record<string, any> = {}): ReadState {
  return {
    _id: STATE,
    _class: notification.class.ReadState,
    space: CHANNEL,
    attachedTo: CHANNEL,
    attachedToClass: chunter.class.Channel,
    collection: 'readStates',
    ...fields
  } as unknown as ReadState
}

function makeControl (state: ReadState | undefined): TriggerControl {
  return {
    ctx: new MeasureMetricsContext('test', {}),
    txFactory: new TxFactory(core.account.System, true),
    findAll: async (_ctx: any, _class: any) => {
      if (_class === notification.class.ReadState) return toFindResult(state !== undefined ? [state] : [])
      return toFindResult([])
    }
  } as unknown as TriggerControl
}

function membersTx (operations: Record<string, any>): TxUpdateDoc<Channel> {
  const tx = new TxFactory(core.account.System, true).createTxUpdateDoc(
    chunter.class.Channel,
    core.space.Space,
    CHANNEL,
    operations
  )
  tx.modifiedOn = JOINED_AT
  return tx
}

describe('OnChannelJoin', () => {
  it('puts the read position of a joined member at the join', async () => {
    const control = makeControl(readState({ latestMessageId: LATEST }))

    const res = (await OnChannelJoin([membersTx({ $push: { members: ALICE } })], control)) as TxUpdateDoc<ReadState>[]

    expect(res).toHaveLength(1)
    expect(res[0].objectId).toBe(STATE)
    expect(res[0].operations).toEqual({
      [ALICE]: { messageId: expect.any(String), timestamp: JOINED_AT - 1 }
    })
  })

  it('covers every member added at once', async () => {
    const control = makeControl(readState({ latestMessageId: LATEST }))

    const tx = membersTx({ $push: { members: { $each: [ALICE, BOB], $position: 0 } } })
    const res = (await OnChannelJoin([tx], control)) as TxUpdateDoc<ReadState>[]

    expect(Object.keys(res[0].operations).sort()).toEqual([ALICE, BOB])
  })

  it('ignores updates that add nobody', async () => {
    const control = makeControl(readState({ latestMessageId: LATEST }))

    expect(await OnChannelJoin([membersTx({ $pull: { members: ALICE } })], control)).toEqual([])
    expect(await OnChannelJoin([membersTx({ name: 'renamed' })], control)).toEqual([])
  })

  it('creates the read state of a channel that has none', async () => {
    const control = makeControl(undefined)

    const res = (await OnChannelJoin([membersTx({ $push: { members: ALICE } })], control)) as TxCreateDoc<ReadState>[]

    expect(res).toHaveLength(1)
    expect(res[0]._class).toBe(core.class.TxCreateDoc)
    expect(res[0].objectClass).toBe(notification.class.ReadState)
    expect(res[0].objectSpace).toBe(CHANNEL)
    expect(res[0].attributes).toEqual({
      attachedTo: CHANNEL,
      attachedToClass: chunter.class.Channel,
      collection: 'readStates',
      [ALICE]: { messageId: expect.any(String), timestamp: JOINED_AT - 1 }
    })
  })

  it('keeps a position that is already newer', async () => {
    const control = makeControl(
      readState({ latestMessageId: LATEST, [ALICE]: { messageId: LATEST, timestamp: JOINED_AT + 5 } })
    )

    expect(await OnChannelJoin([membersTx({ $push: { members: ALICE } })], control)).toEqual([])
  })
})
