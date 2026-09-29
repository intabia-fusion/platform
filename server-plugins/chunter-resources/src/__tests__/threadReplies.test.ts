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

import activity, { type ActivityMessage } from '@hcengineering/activity'
import chunter, { type ThreadMessage } from '@hcengineering/chunter'
import contact, { type Person } from '@hcengineering/contact'
import core, {
  type AccountUuid,
  type Doc,
  MeasureMetricsContext,
  type PersonId,
  type Ref,
  type Space,
  toFindResult,
  TxFactory,
  type TxRemoveDoc,
  type TxUpdateDoc
} from '@hcengineering/core'
import type { TriggerControl } from '@hcengineering/server-core'

import { OnThreadMessageDeleted } from '..'

const SPACE = 'space:general' as Ref<Space>
const PARENT = 'msg:parent' as Ref<ActivityMessage>

const ALICE = 'social:alice' as PersonId
const ALICE_EMAIL = 'social:alice-email' as PersonId
const BOB = 'social:bob' as PersonId
const CAROL = 'social:carol' as PersonId

const PERSON_ALICE = 'person:alice' as Ref<Person>
const PERSON_BOB = 'person:bob' as Ref<Person>
const PERSON_CAROL = 'person:carol' as Ref<Person>

const ACC_ALICE = 'acc-alice' as AccountUuid
const ACC_BOB = 'acc-bob' as AccountUuid

function reply (id: string, createdBy: PersonId, createdOn: number): ThreadMessage {
  return {
    _id: id as Ref<ThreadMessage>,
    _class: chunter.class.ThreadMessage,
    space: SPACE,
    attachedTo: PARENT,
    attachedToClass: chunter.class.ChatMessage,
    collection: 'replies',
    createdBy,
    createdOn,
    modifiedBy: createdBy,
    modifiedOn: createdOn
  } as unknown as ThreadMessage
}

function parent (fields: Partial<ActivityMessage>): ActivityMessage {
  return {
    _id: PARENT,
    _class: chunter.class.ChatMessage,
    space: SPACE,
    modifiedBy: ALICE,
    modifiedOn: 0,
    ...fields
  } as unknown as ActivityMessage
}

interface Stand {
  control: TriggerControl
  removeTx: (id: string) => TxRemoveDoc<ThreadMessage>
}

/**
 * Alice's two social ids resolve through the session (current account), Bob's through the known
 * users, Carol's only through her SocialIdentity. The removed reply is still in `replies` to check
 * that the trigger does not count it even when the store still returns it.
 */
function stand (parentDoc: ActivityMessage | undefined, replies: ThreadMessage[]): Stand {
  const persons = [
    { _id: PERSON_ALICE, personUuid: ACC_ALICE },
    { _id: PERSON_BOB, personUuid: ACC_BOB }
  ]
  const identities = [{ _id: CAROL, attachedTo: PERSON_CAROL }]

  const findAll = async (_ctx: unknown, _class: Ref<any>, query: any): Promise<any> => {
    if (_class === activity.class.ActivityMessage) {
      return toFindResult(parentDoc !== undefined && query._id === parentDoc._id ? [parentDoc] : [])
    }
    if (_class === chunter.class.ThreadMessage) {
      const excluded = query._id?.$ne
      return toFindResult(
        replies
          .filter((it) => it.attachedTo === query.attachedTo && it._id !== excluded)
          .sort((a, b) => (a.createdOn ?? 0) - (b.createdOn ?? 0))
      )
    }
    if (_class === contact.class.Person) {
      const uuids: string[] = query.personUuid.$in
      return toFindResult(persons.filter((it) => uuids.includes(it.personUuid)) as any)
    }
    if (_class === contact.class.SocialIdentity) {
      const ids: string[] = query._id.$in
      return toFindResult(identities.filter((it) => ids.includes(it._id)) as any)
    }
    return toFindResult([])
  }

  const ctx = new MeasureMetricsContext('test', {})
  ;(ctx as any).contextData = {
    account: { uuid: ACC_ALICE, socialIds: [ALICE, ALICE_EMAIL] },
    socialStringsToUsers: new Map([[BOB, { accountUuid: ACC_BOB }]])
  }

  const removedMap = new Map<Ref<Doc>, Doc>()
  const control = {
    ctx,
    findAll,
    removedMap,
    txFactory: new TxFactory(core.account.System)
  } as unknown as TriggerControl

  const txFactory = new TxFactory(ALICE)
  return {
    control,
    removeTx: (id) => {
      const removed = replies.find((it) => it._id === id)
      if (removed !== undefined) removedMap.set(removed._id, removed)
      return txFactory.createTxRemoveDoc(chunter.class.ThreadMessage, SPACE, id as Ref<ThreadMessage>)
    }
  }
}

async function run (s: Stand, id: string): Promise<TxUpdateDoc<ActivityMessage>[]> {
  return (await OnThreadMessageDeleted(s.control.ctx, s.removeTx(id), s.control)) as TxUpdateDoc<ActivityMessage>[]
}

describe('OnThreadMessageDeleted', () => {
  it('moves lastReply back to the newest remaining reply', async () => {
    const replies = [reply('r1', ALICE, 100), reply('r2', BOB, 200), reply('r3', BOB, 300)]
    const s = stand(parent({ lastReply: 300, repliedPersons: [PERSON_ALICE, PERSON_BOB] }), replies)

    const txes = await run(s, 'r3')

    expect(txes).toHaveLength(1)
    expect(txes[0].objectId).toBe(PARENT)
    expect(txes[0].operations).toEqual({ lastReply: 200, repliedPersons: [PERSON_ALICE, PERSON_BOB] })
  })

  it('unsets both fields when the only reply is removed', async () => {
    const s = stand(parent({ lastReply: 100, repliedPersons: [PERSON_ALICE] }), [reply('r1', ALICE, 100)])

    const txes = await run(s, 'r1')

    expect(txes).toHaveLength(1)
    expect(txes[0].operations).toEqual({ $unset: { lastReply: true, repliedPersons: true } })
  })

  it('keeps an author who has other replies', async () => {
    const replies = [reply('r1', BOB, 100), reply('r2', ALICE, 200), reply('r3', BOB, 300)]
    const s = stand(parent({ lastReply: 300, repliedPersons: [PERSON_BOB, PERSON_ALICE] }), replies)

    const txes = await run(s, 'r1')

    expect(txes[0].operations).toEqual({ lastReply: 300, repliedPersons: [PERSON_ALICE, PERSON_BOB] })
  })

  it('drops the author of the removed reply and keeps the order of the others', async () => {
    const replies = [reply('r1', CAROL, 100), reply('r2', BOB, 200), reply('r3', ALICE, 300)]
    const s = stand(parent({ lastReply: 300, repliedPersons: [PERSON_CAROL, PERSON_BOB, PERSON_ALICE] }), replies)

    const txes = await run(s, 'r2')

    expect(txes[0].operations).toEqual({ lastReply: 300, repliedPersons: [PERSON_CAROL, PERSON_ALICE] })
  })

  it('counts two social ids of one person once', async () => {
    const replies = [reply('r1', ALICE, 100), reply('r2', ALICE_EMAIL, 200), reply('r3', CAROL, 300)]
    const s = stand(parent({ lastReply: 300, repliedPersons: [PERSON_ALICE, PERSON_CAROL] }), replies)

    const txes = await run(s, 'r3')

    expect(txes[0].operations).toEqual({ lastReply: 200, repliedPersons: [PERSON_ALICE] })
  })

  it('does nothing when the parent is gone', async () => {
    const s = stand(undefined, [reply('r1', ALICE, 100)])

    expect(await run(s, 'r1')).toEqual([])
  })

  it('does nothing when the fields already match', async () => {
    const replies = [reply('r1', ALICE, 100), reply('r2', BOB, 200)]
    const s = stand(parent({ lastReply: 100, repliedPersons: [PERSON_ALICE] }), replies)

    expect(await run(s, 'r2')).toEqual([])
  })
})
