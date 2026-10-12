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

import activity, { type Poll, type VotePollAction } from '@hcengineering/activity'
import contact from '@hcengineering/contact'
import core, {
  AccountRole,
  type AccountUuid,
  type Doc,
  type PersonId,
  type Ref,
  type Space,
  systemAccountUuid,
  type Tx,
  type TxCreateDoc,
  TxFactory,
  type WorkspaceUuid
} from '@hcengineering/core'
import type { Middleware } from '@hcengineering/server-core'

import ActivityMiddleware, { hashQuizAnswer } from '../middleware'

const parents: Record<string, string> = {
  [activity.class.Poll]: activity.class.AppletInstance,
  [activity.class.AppletInstance]: core.class.AttachedDoc,
  [activity.class.ActivityMessage]: core.class.AttachedDoc,
  [activity.class.PollAnswer]: core.class.Doc,
  [activity.class.VotePollAction]: core.class.Doc
}

const hierarchy = {
  isDerived: (_class: string, from: string): boolean => {
    for (let it: string | undefined = _class; it !== undefined; it = parents[it]) {
      if (it === from) return true
    }
    return false
  },
  findDomain: (_class: string): string | undefined =>
    hierarchy.isDerived(_class, activity.class.ActivityMessage) ? 'activity' : undefined,
  clone: (doc: any) => structuredClone(doc)
}

const alice = 'alice' as AccountUuid
const aliceSocial = 'alice-social' as PersonId
const aliceSpace = 'alice-space' as Ref<Space>
const channel = 'channel' as Ref<Space>
const workspace = 'ws-1' as WorkspaceUuid

describe('ActivityMiddleware', () => {
  const factory = new TxFactory(aliceSocial)
  let docs: Doc[]
  let passed: Tx[]
  let middleware: Middleware

  function ctxOf (uuid: AccountUuid, socialIds: PersonId[] = [aliceSocial], role = AccountRole.User): any {
    return { contextData: { account: { uuid, socialIds, role } } }
  }

  beforeEach(async () => {
    docs = [{ _id: aliceSpace, _class: contact.class.PersonSpace, account: alice } as unknown as Doc]
    passed = []
    const next = {
      tx: async (_ctx: any, txes: Tx[]) => {
        passed.push(...txes)
        return {}
      },
      findAll: async (_ctx: any, _class: string, query: any) =>
        docs.filter((it) => hierarchy.isDerived(it._class, _class) && it._id === query._id)
    }
    const appletModels = [
      { _id: activity.applet.Poll, editable: false },
      { _id: 'note-applet', editable: true }
    ]
    const modelDb = { findAllSync: (_class: string, query: any) => appletModels.filter((it) => it._id === query._id) }
    middleware = await ActivityMiddleware.create(
      ctxOf(alice),
      { hierarchy, modelDb, workspace: { uuid: workspace } } as any,
      next as any
    )
  })

  function createPoll (data: Partial<Poll>): TxCreateDoc<Poll> {
    return factory.createTxCreateDoc(activity.class.Poll, channel, {
      attachedTo: 'msg-1' as any,
      attachedToClass: activity.class.ActivityMessage,
      collection: 'applets',
      applet: activity.applet.Poll,
      mode: 'single',
      question: 'Lunch?',
      options: [
        { id: 'a', label: 'Pizza' },
        { id: 'b', label: 'Sushi' }
      ],
      totalVotes: 5,
      votes: { a: 5 },
      userVotes: [{ account: alice, options: [] }],
      ...data
    } as any)
  }

  // A poll comes in one apply with its message.
  function withMessage (poll: TxCreateDoc<Poll>): Tx[] {
    return [factory.createTxCreateDoc(activity.class.ActivityMessage, channel, {} as any, 'msg-1' as any), poll]
  }

  it('resets tallies and keeps only the hash of the quiz answer', async () => {
    const tx = createPoll({ quiz: true, quizAnswer: 'b' })
    const batch = withMessage(tx)
    await middleware.tx(ctxOf(alice), batch)

    expect(tx.attributes).toMatchObject({ totalVotes: 0, votes: {}, userVotes: [] })
    expect(tx.attributes.quizAnswer).toBeUndefined()
    expect(tx.attributes.quizAnswerHash).toBe(hashQuizAnswer(workspace, tx.objectId, 'b'))
    expect(passed).toEqual(batch)
    // Not stored in the tx log, the author is the sender.
    expect(tx.space).toBe(core.space.DerivedTx)
    expect(tx.createdBy).toBeUndefined()
  })

  it('refuses a quiz under the id of an existing applet, its hash would tell the answer', async () => {
    docs.push({ ...createPoll({}).attributes, _id: 'poll-1', _class: activity.class.Poll } as any)
    const tx = factory.createTxCreateDoc(
      activity.class.Poll,
      channel,
      createPoll({ quiz: true, quizAnswer: 'a' }).attributes,
      'poll-1' as any
    )
    await expect(middleware.tx(ctxOf(alice), withMessage(tx))).rejects.toThrow()
    expect(tx.attributes.quizAnswerHash).toBeUndefined()
  })

  it('takes the binding of a poll as the storage does', async () => {
    // The tx names the message but not the collection, the attributes name it: the stored poll would have none.
    const tx = createPoll({})
    tx.attachedTo = 'msg-1' as any
    tx.attachedToClass = activity.class.ActivityMessage
    await expect(middleware.tx(ctxOf(alice), withMessage(tx))).rejects.toThrow()
  })

  it('binds the quiz hash to the workspace', () => {
    expect(hashQuizAnswer(workspace, 'poll-1' as any, 'b')).not.toBe(
      hashQuizAnswer('ws-2' as WorkspaceUuid, 'poll-1' as any, 'b')
    )
  })

  it('attaches a poll to an own message only, new in the batch or existing', async () => {
    // No such message at all, including the poll itself under a message id.
    await expect(middleware.tx(ctxOf(alice), [createPoll({})])).rejects.toThrow()
    const self = factory.createTxCreateDoc(activity.class.Poll, channel, createPoll({}).attributes, 'msg-1' as any)
    await expect(middleware.tx(ctxOf(alice), [self])).rejects.toThrow()

    // A new message must come before the poll and in its space.
    const poll = createPoll({})
    const [message] = withMessage(poll)
    await expect(middleware.tx(ctxOf(alice), [poll, message])).rejects.toThrow()
    const elsewhere = factory.createTxCreateDoc(
      activity.class.ActivityMessage,
      'other' as any,
      {} as any,
      'msg-1' as any
    )
    await expect(middleware.tx(ctxOf(alice), [elsewhere, poll])).rejects.toThrow()
    expect(passed).toEqual([])

    // An existing message of someone else, also when the batch pretends to create it.
    docs.push({ _id: 'msg-1', _class: activity.class.ActivityMessage, space: channel, createdBy: 'bob-social' } as any)
    await expect(middleware.tx(ctxOf(alice), [poll])).rejects.toThrow()
    await expect(middleware.tx(ctxOf(alice), withMessage(poll))).rejects.toThrow()
    expect(passed).toEqual([])
  })

  it('adds a poll to an own existing message as a separate transaction', async () => {
    docs.push({ _id: 'msg-1', _class: activity.class.ActivityMessage, space: channel, createdBy: aliceSocial } as any)
    const poll = createPoll({})
    await middleware.tx(ctxOf(alice), [poll])
    expect(passed).toEqual([poll])

    // Not into another space than the message's.
    const elsewhere = factory.createTxCreateDoc(activity.class.Poll, 'other' as any, createPoll({}).attributes)
    await expect(middleware.tx(ctxOf(alice), [elsewhere])).rejects.toThrow()
  })

  it('lets only the system change a sent poll, under any applet class', async () => {
    docs.push({
      ...createPoll({}).attributes,
      _id: 'poll-1',
      _class: activity.class.Poll,
      createdBy: aliceSocial
    } as any)
    const changes: Tx[] = [
      factory.createTxUpdateDoc(activity.class.Poll, channel, 'poll-1' as any, { question: 'Dinner?' }),
      factory.createTxUpdateDoc(activity.class.AppletInstance, channel, 'poll-1' as any, { totalVotes: 10 } as any),
      // A TxMixin writes any top-level field it names.
      factory.createTxMixin('poll-1' as any, activity.class.Poll, channel, 'votes' as any, { a: 1000 } as any)
    ]
    for (const tx of changes) {
      await expect(middleware.tx(ctxOf(alice), [tx])).rejects.toThrow()
    }
    expect(passed).toEqual([])

    // The activity service writes tallies of a poll that may be gone already, it is not looked up.
    docs.length = 0
    await middleware.tx(ctxOf(systemAccountUuid), [changes[1]])
    expect(passed).toEqual([changes[1]])
  })

  it('moves a poll of anyone along with its message only', async () => {
    docs.push({ ...createPoll({}).attributes, _id: 'poll-1', _class: activity.class.Poll, createdBy: 'carol' } as any)
    const movePoll = (ops: any): Tx => factory.createTxUpdateDoc(activity.class.Poll, channel, 'poll-1' as any, ops)
    const moveMessage = (_class: any, space: string): Tx =>
      factory.createTxUpdateDoc(_class, channel, 'msg-1' as any, { space } as any)

    const batches: Tx[][] = [
      [movePoll({ space: 'project-2' })],
      [movePoll({ space: 'project-2' }), moveMessage(activity.class.ActivityMessage, 'project-3')],
      [movePoll({ space: 'project-2', question: 'Dinner?' }), moveMessage(activity.class.ActivityMessage, 'project-2')],
      // The same id in another table is not the message.
      [movePoll({ space: 'project-2' }), moveMessage(activity.class.PollAnswer, 'project-2')]
    ]
    for (const batch of batches) {
      await expect(middleware.tx(ctxOf(alice), batch)).rejects.toThrow()
    }
    expect(passed).toEqual([])

    const batch = [movePoll({ space: 'project-2' }), moveMessage(activity.class.ActivityMessage, 'project-2')]
    await middleware.tx(ctxOf(alice), batch)
    expect(passed).toEqual(batch)
  })

  it('lets the author change the own data of an applet whose model allows it', async () => {
    docs.push({
      _id: 'note-1',
      _class: activity.class.AppletInstance,
      space: channel,
      applet: 'note-applet',
      createdBy: aliceSocial
    } as any)
    const update = (ops: any): Tx =>
      factory.createTxUpdateDoc(activity.class.AppletInstance, channel, 'note-1' as any, ops)

    await middleware.tx(ctxOf(alice), [update({ text: 'Updated' })])
    for (const ops of [
      { applet: activity.applet.Poll },
      { attachedTo: 'msg-2' },
      { $inc: { x: 1 } },
      { '__proto__.x': 1 }
    ]) {
      await expect(middleware.tx(ctxOf(alice), [update(ops)])).rejects.toThrow()
    }
    await expect(
      middleware.tx(ctxOf('bob' as AccountUuid, ['bob-social' as PersonId]), [update({ text: 'Mine' })])
    ).rejects.toThrow()
    expect(({} as any).x).toBeUndefined()
  })

  it('lets the author or a maintainer remove an applet, the cascade of its message anyone', async () => {
    docs.push({
      ...createPoll({}).attributes,
      _id: 'poll-1',
      _class: activity.class.Poll,
      createdBy: aliceSocial
    } as any)
    const remove = factory.createTxRemoveDoc(activity.class.AppletInstance, channel, 'poll-1' as any)
    const bob = (role?: AccountRole): any => ctxOf('bob' as AccountUuid, ['bob-social' as PersonId], role)

    await expect(middleware.tx(bob(), [remove])).rejects.toThrow()
    await expect(middleware.tx(bob(AccountRole.Guest), [remove])).rejects.toThrow()
    expect(passed).toEqual([])

    await middleware.tx(ctxOf(alice), [remove])
    // A bare removeDoc gets its message, so the counter goes down.
    expect(remove).toMatchObject({ attachedTo: 'msg-1', collection: 'applets' })
    await middleware.tx(bob(AccountRole.Maintainer), [remove])
    await middleware.tx(bob(AccountRole.Owner), [remove])
    const cascade = { ...bob(), contextData: { ...bob().contextData, isTriggerCtx: true } }
    await middleware.tx(cascade, [remove])
    expect(passed).toHaveLength(4)
  })

  it('rejects a poll that the client form would not let through', async () => {
    const invalid: Array<Partial<Poll>> = [
      { question: ' ' },
      { options: [{ id: 'a', label: 'Pizza' }] },
      {
        options: [
          { id: 'a', label: 'Pizza' },
          { id: 'a', label: 'Sushi' }
        ]
      },
      {
        options: [
          { id: 'a', label: 'Pizza' },
          { id: 'b', label: ' ' }
        ]
      },
      { mode: 'any' as any },
      { startAt: 2000, endAt: 1000 },
      { quiz: true },
      { quiz: true, quizAnswer: 'x' },
      { quiz: true, quizAnswer: 'a', mode: 'multiple' },
      { quiz: true, quizAnswer: 'a', revote: true },
      { revote: 'yes' as any },
      { endAt: 'soon' as any },
      { applet: 'other' as any }
    ]
    for (const data of invalid) {
      await expect(middleware.tx(ctxOf(alice), withMessage(createPoll(data)))).rejects.toThrow()
    }
    expect(passed).toEqual([])
  })

  it('rejects a poll created under the base applet class', async () => {
    const tx = factory.createTxCreateDoc(activity.class.AppletInstance, channel, {
      applet: activity.applet.Poll
    } as any)
    await expect(middleware.tx(ctxOf(alice), [tx])).rejects.toThrow()
  })

  it('accepts a vote from the own personal space only and stamps the account', async () => {
    const vote = factory.createTxCreateDoc(activity.class.VotePollAction, aliceSpace as any, {
      account: 'someone-else' as AccountUuid,
      attachedTo: 'poll-1' as any,
      options: ['a']
    })
    await middleware.tx(ctxOf(alice), [vote])
    expect((vote as TxCreateDoc<VotePollAction>).attributes.account).toBe(alice)

    const foreign = factory.createTxCreateDoc(activity.class.VotePollAction, channel as any, {
      account: alice,
      attachedTo: 'poll-1' as any,
      options: ['a']
    })
    await expect(middleware.tx(ctxOf(alice), [foreign])).rejects.toThrow()
  })

  it('rejects a malformed vote, which would stall the activity service', async () => {
    const malformed: any[] = [
      { attachedTo: 'poll-1', options: 5 },
      { attachedTo: 'poll-1', options: [1] },
      { attachedTo: { $regex: '(' }, options: ['a'] },
      { options: ['a'] },
      { attachedTo: 'poll-1', options: [], retract: 'yes' }
    ]
    for (const data of malformed) {
      const vote = factory.createTxCreateDoc(activity.class.VotePollAction, aliceSpace as any, data)
      await expect(middleware.tx(ctxOf(alice), [vote])).rejects.toThrow()
    }
    expect(passed).toEqual([])
  })

  it('lets only the system account create a poll answer', async () => {
    const answer = factory.createTxCreateDoc(activity.class.PollAnswer, aliceSpace as any, {
      attachedTo: 'poll-1' as any,
      options: ['a']
    })
    await expect(middleware.tx(ctxOf(alice), [answer])).rejects.toThrow()
    await middleware.tx(ctxOf(systemAccountUuid), [answer])
    expect(passed).toEqual([answer])
  })

  it('keeps the own poll answer out of reach of the voter', async () => {
    const answerId = 'answer-1' as Ref<Doc>
    const remove = factory.createTxRemoveDoc(activity.class.PollAnswer, aliceSpace, answerId)
    const update = factory.createTxUpdateDoc(activity.class.PollAnswer, aliceSpace, answerId, { options: ['b'] } as any)

    // Without its answer an anonymous poll would take the same voter again.
    await expect(middleware.tx(ctxOf(alice), [remove])).rejects.toThrow()
    await expect(middleware.tx(ctxOf(alice), [update])).rejects.toThrow()
    await middleware.tx(ctxOf(systemAccountUuid), [remove])
    expect(passed).toEqual([remove])
  })
})
