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

import activity, { type AppletInstance, type Poll, type VotePollAction } from '@hcengineering/activity'
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
import platform, { ForbiddenKind, PlatformError, type Status } from '@hcengineering/platform'
import type { Middleware } from '@hcengineering/server-core'

import ActivityMiddleware, { hashQuizAnswer } from '../middleware'

const noteClass = 'test:class:Note'
const chatClass = 'test:class:Chat'
const parents: Record<string, string> = {
  [chatClass]: activity.class.ActivityMessage,
  [noteClass]: activity.class.AppletInstance,
  [activity.class.Poll]: activity.class.AppletInstance,
  [activity.class.AppletInstance]: core.class.AttachedDoc,
  [activity.class.ActivityMessage]: core.class.AttachedDoc,
  [activity.class.PollAnswer]: core.class.Doc,
  [activity.class.VotePollAction]: core.class.Doc,
  [activity.class.Applet]: core.class.Doc
}

// A note applet declares its own `text`, the base class the binding and service fields.
const attributes: Record<string, string[]> = {
  [noteClass]: ['text', 'items'],
  [activity.class.AppletInstance]: ['applet', 'attachedTo', 'attachedToClass', 'collection', 'space', 'createdBy']
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
  findAttribute: (_class: string, name: string): any => {
    for (let it: string | undefined = _class; it !== undefined; it = parents[it]) {
      if (attributes[it]?.includes(name)) return { name, attributeOf: it }
    }
  },
  getDomain: (): string => 'activity'
}

const alice = 'alice' as AccountUuid
const aliceSocial = 'alice-social' as PersonId
const aliceSpace = 'alice-space' as Ref<Space>
const channel = 'channel' as Ref<Space>
const workspace = 'ws-1' as WorkspaceUuid

async function refusal (promise: Promise<unknown>): Promise<Status> {
  const err = await promise.then(
    () => undefined,
    (err) => err
  )
  expect(err).toBeInstanceOf(PlatformError)
  return (err as PlatformError<any>).status
}

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
    const lowLevelStorage = {
      rawFindAll: async (_domain: string, query: any) => docs.filter((it) => it._id === query._id)
    }
    middleware = await ActivityMiddleware.create(
      ctxOf(alice),
      { hierarchy, modelDb, lowLevelStorage, workspace: { uuid: workspace } } as any,
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
    // Not stored in the tx log.
    expect(tx.space).toBe(core.space.DerivedTx)
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

  it('takes a null binding of the tx, as the storage does, over the attributes', async () => {
    const tx = createPoll({})
    tx.attachedTo = null as any
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

  it('attaches an applet of any kind to an own message only', async () => {
    const note = (attachedTo: string): TxCreateDoc<AppletInstance> =>
      factory.createTxCreateDoc(noteClass as any, channel, {
        attachedTo,
        attachedToClass: activity.class.ActivityMessage,
        collection: 'applets',
        applet: 'note-applet',
        text: 'Hi'
      } as any)
    docs.push({ _id: 'msg-2', _class: activity.class.ActivityMessage, space: channel, createdBy: 'bob-social' } as any)
    await expect(middleware.tx(ctxOf(alice), [note('msg-2')])).rejects.toThrow()

    // The rest of a kind is up to its plugin.
    const own = note('msg-1')
    const batch = [factory.createTxCreateDoc(activity.class.ActivityMessage, channel, {} as any, 'msg-1' as any), own]
    await middleware.tx(ctxOf(alice), batch)
    expect(passed).toEqual(batch)
    // Without a quiz hash it goes to the tx log: a reconnecting client learns of it by lastTx.
    expect(own.space).toBe(core.space.Tx)
  })

  it('attaches an applet under the class of its message', async () => {
    const poll = (attachedToClass: string): TxCreateDoc<Poll> => {
      const tx = createPoll({})
      tx.attributes.attachedToClass = attachedToClass as any
      return tx
    }
    docs.push({ _id: 'msg-1', _class: chatClass, space: channel, createdBy: aliceSocial } as any)
    await expect(middleware.tx(ctxOf(alice), [poll(activity.class.ActivityMessage)])).rejects.toThrow()
    await middleware.tx(ctxOf(alice), [poll(chatClass)])
    expect(passed).toHaveLength(1)

    docs.length = 0
    const created = factory.createTxCreateDoc(chatClass as any, channel, {} as any, 'msg-1' as any)
    await expect(middleware.tx(ctxOf(alice), [created, poll(activity.class.ActivityMessage)])).rejects.toThrow()
  })

  it('creates a poll as the poll applet only', async () => {
    const poll = createPoll({ applet: 'note-applet' as any })
    await expect(middleware.tx(ctxOf(alice), withMessage(poll))).rejects.toThrow()
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
      _class: noteClass,
      space: channel,
      applet: 'note-applet',
      createdBy: aliceSocial
    } as any)
    const update = (ops: any): Tx =>
      factory.createTxUpdateDoc(activity.class.AppletInstance, channel, 'note-1' as any, ops)

    // Its own fields, by operators and paths too.
    for (const ops of [{ text: 'Updated' }, { $push: { items: 'a' } }, { 'items.0': 'b' }]) {
      await middleware.tx(ctxOf(alice), [update(ops)])
    }
    for (const ops of [
      { applet: activity.applet.Poll },
      { attachedTo: 'msg-2' },
      { space: 'bob-space' },
      { $inc: { x: 1 } },
      { $unset: { attachedTo: true } },
      { $rename: { text: 'attachedTo' } },
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

    expect((await refusal(middleware.tx(bob(), [remove]))).params).toMatchObject({ kind: ForbiddenKind.AuthorOnly })
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

  it('takes the message of a removed applet from storage, not from the tx', async () => {
    docs.push({
      ...createPoll({}).attributes,
      _id: 'poll-1',
      _class: activity.class.Poll,
      createdBy: aliceSocial
    } as any)
    // The counter trigger would decrement the message the tx names.
    const remove = factory.createTxRemoveDoc(activity.class.AppletInstance, channel, 'poll-1' as any)
    Object.assign(remove, { attachedTo: 'msg-of-bob', attachedToClass: chatClass, collection: 'anything' })

    await middleware.tx(ctxOf(alice), [remove])
    expect(remove).toMatchObject({
      attachedTo: 'msg-1',
      attachedToClass: activity.class.ActivityMessage,
      collection: 'applets'
    })
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
      { endAt: 'soon' as any },
      { applet: 'other' as any },
      // Wrong types are refused as a bad request, not by a TypeError.
      { question: 5 as any },
      { options: 'ab' as any },
      { options: [null, { id: 'b', label: 'Sushi' }] as any },
      { options: [5, { id: 'b', label: 'Sushi' }] as any },
      {
        options: [
          { id: 'a', label: 5 },
          { id: 'b', label: 'Sushi' }
        ] as any
      },
      {
        options: [
          { id: 7, label: 'Pizza' },
          { id: 'b', label: 'Sushi' }
        ] as any
      },
      {
        options: [
          { id: 'constructor', label: 'Pizza' },
          { id: 'b', label: 'Sushi' }
        ]
      },
      {
        options: [
          { id: 'a'.repeat(65), label: 'Pizza' },
          { id: 'b', label: 'Sushi' }
        ]
      },
      { anonymous: 'yes' as any },
      { revote: 1 as any }
    ]
    for (const data of invalid) {
      const status = await refusal(middleware.tx(ctxOf(alice), withMessage(createPoll(data))))
      expect(status.code).toBe(platform.status.BadRequest)
    }
    expect(passed).toEqual([])
  })

  it('makes a quiz single-answer and final, as the form sends it', async () => {
    const tx = createPoll({ quiz: true, quizAnswer: 'a', mode: 'multiple', revote: true })
    await middleware.tx(ctxOf(alice), withMessage(tx))

    expect(tx.attributes).toMatchObject({ mode: 'single', revote: false })
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
    expect((await refusal(middleware.tx(ctxOf(alice), [foreign]))).params).toMatchObject({
      kind: ForbiddenKind.ForeignPrivateWrite,
      account: alice
    })
  })

  it('rejects a vote without a poll or options', async () => {
    const malformed: any[] = [
      { attachedTo: 'poll-1', options: 5 },
      { options: ['a'] },
      { attachedTo: '', options: ['a'] },
      // A query in place of the id would reach the service's lookup.
      { attachedTo: { $regex: '(' }, options: ['a'] },
      { attachedTo: 'poll-1', options: [5] },
      { attachedTo: 'poll-1', options: ['a'], retract: 'yes' },
      { attachedTo: 'poll-1', options: [], reveal: 1 }
    ]
    for (const data of malformed) {
      const vote = factory.createTxCreateDoc(activity.class.VotePollAction, aliceSpace as any, data)
      expect((await refusal(middleware.tx(ctxOf(alice), [vote]))).code).toBe(platform.status.BadRequest)
    }
    expect(passed).toEqual([])
  })

  it('lets only the system account create a poll answer', async () => {
    const answer = factory.createTxCreateDoc(activity.class.PollAnswer, aliceSpace as any, {
      attachedTo: 'poll-1' as any,
      options: ['a']
    })
    expect((await refusal(middleware.tx(ctxOf(alice), [answer]))).params).toMatchObject({
      kind: ForbiddenKind.SystemOnly
    })
    await middleware.tx(ctxOf(systemAccountUuid), [answer])
    expect(passed).toEqual([answer])
  })

  it('lets no client change an applet kind of the model', async () => {
    const update = factory.createTxUpdateDoc(activity.class.Applet, core.space.Model, activity.applet.Poll, {
      editable: true
    } as any)
    const create = factory.createTxCreateDoc(activity.class.Applet, core.space.Model, { editable: true } as any)
    const remove = factory.createTxRemoveDoc(activity.class.Applet, core.space.Model, activity.applet.Poll)
    for (const tx of [update, create, remove]) {
      expect((await refusal(middleware.tx(ctxOf(alice), [tx]))).params).toMatchObject({
        kind: ForbiddenKind.SystemOnly
      })
      await expect(middleware.tx(ctxOf(alice, [aliceSocial], AccountRole.Owner), [tx])).rejects.toThrow()
    }
    expect(passed).toEqual([])
    await middleware.tx(ctxOf(systemAccountUuid), [update])
    expect(passed).toEqual([update])
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

  describe('DocPreview', () => {
    const preview = (_class: string): Tx =>
      ({ _id: 'tx-preview', _class, objectClass: core.class.DocPreview, objectId: 'preview-1' }) as any as Tx
    const previewTxes = (): Tx[] => [
      preview(core.class.TxCreateDoc),
      preview(core.class.TxUpdateDoc),
      preview(core.class.TxMixin),
      preview(core.class.TxRemoveDoc)
    ]

    it('lets a trigger and the system write a preview', async () => {
      const txes = previewTxes()
      await middleware.tx({ contextData: { account: { uuid: alice }, isTriggerCtx: true } } as any, txes)
      await middleware.tx(ctxOf(systemAccountUuid), txes)
      expect(passed).toEqual([...txes, ...txes])
    })

    it('refuses every write of a preview by a user', async () => {
      const other = factory.createTxUpdateDoc(core.class.Space, core.space.Space, channel, { name: 'x' } as any)
      for (const tx of previewTxes()) {
        expect((await refusal(middleware.tx(ctxOf(alice), [other, tx]))).params).toMatchObject({
          kind: ForbiddenKind.SystemOnly
        })
      }
      expect(passed).toEqual([])
    })
  })
})
