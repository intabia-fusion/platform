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

import activity from '@hcengineering/activity'
import aiBot from '@hcengineering/ai-bot'
import chunter from '@hcengineering/chunter'
import core, {
  AccountRole,
  type AccountUuid,
  type Doc,
  type PersonId,
  type Ref,
  systemAccountUuid,
  type Tx,
  TxFactory
} from '@hcengineering/core'
import { ForbiddenKind } from '@hcengineering/platform'
import { type Middleware } from '@hcengineering/server-core'

import { ChunterMiddleware } from '../middleware'

const issueClass = 'test:class:Issue'
const channelClass = 'test:class:Channel'
const parents: Record<string, string> = {
  [aiBot.class.AITaskProposalMessage]: chunter.class.ThreadMessage,
  [activity.class.DocUpdateMessage]: activity.class.ActivityMessage,
  [chunter.class.ThreadMessage]: chunter.class.ChatMessage,
  [chunter.class.ChatMessage]: activity.class.ActivityMessage,
  [activity.class.ActivityMessage]: core.class.AttachedDoc,
  [channelClass]: core.class.Space
}
const isDerived = (_class: string, from: string): boolean => {
  for (let it: string | undefined = _class; it !== undefined; it = parents[it]) {
    if (it === from) return true
  }
  return false
}
const hierarchy = {
  isDerived,
  isMixin: (_class: string): boolean => _class === 'real-mixin',
  findDomain: (_class: string): string | undefined =>
    ({ [activity.class.ActivityMessage]: 'activity', [issueClass]: 'tracker', [core.class.Space]: 'space' })[
      [activity.class.ActivityMessage, issueClass, core.class.Space].find((it) => isDerived(_class, it)) ?? ''
    ],
  getDomain: (): string => 'activity'
}

const alice = 'alice' as AccountUuid
const aliceSocial = 'alice-social' as PersonId
const bobSocial = 'bob-social' as PersonId
const channel = 'channel' as Ref<any>
const messageId = 'msg-1' as Ref<Doc>

function ctxOf (uuid: AccountUuid, socialIds: PersonId[], role = AccountRole.User, trigger = false): any {
  return { contextData: { account: { uuid, socialIds, role }, isTriggerCtx: trigger } }
}
const bob = (role?: AccountRole): any => ctxOf('bob' as AccountUuid, [bobSocial], role)

describe('ChunterMiddleware message rights', () => {
  const factory = new TxFactory(bobSocial)
  let passed: Tx[]
  let middleware: Middleware

  beforeEach(async () => {
    passed = []
    const message = {
      _id: messageId,
      _class: chunter.class.ChatMessage,
      space: 'project-1',
      attachedTo: 'issue-1',
      attachedToClass: issueClass,
      createdBy: aliceSocial
    }
    const channelMessage = {
      _id: 'channel-msg',
      _class: chunter.class.ChatMessage,
      space: channel,
      attachedTo: channel,
      attachedToClass: channelClass,
      createdBy: aliceSocial
    }
    const proposal = {
      _id: 'proposal-1',
      _class: aiBot.class.AITaskProposalMessage,
      space: channel,
      attachedTo: messageId,
      attachedToClass: chunter.class.ChatMessage,
      createdBy: 'ai-bot-social'
    }
    const docUpdate = {
      _id: 'doc-update-1',
      _class: activity.class.DocUpdateMessage,
      space: channel,
      attachedTo: 'issue-1',
      attachedToClass: issueClass,
      createdBy: aliceSocial
    }
    const next = {
      tx: async (_ctx: any, txes: Tx[]) => {
        passed.push(...txes)
        return {}
      },
      // The session's view: the message sits in a space Bob cannot read.
      findAll: async () => []
    }
    const lowLevelStorage = {
      rawFindAll: async (_domain: string, query: any) =>
        [message, channelMessage, proposal, docUpdate].filter((it) => it._id === query._id)
    }
    middleware = await ChunterMiddleware.create(bob(), { hierarchy, lowLevelStorage } as any, next as any)
  })

  const update = (ops: any, _class = chunter.class.ChatMessage): Tx =>
    factory.createTxUpdateDoc(_class, channel, messageId, ops)
  const remove = (_class = chunter.class.ChatMessage): Tx => factory.createTxRemoveDoc(_class, channel, messageId)

  it('lets only the author change what a message says, under any message class', async () => {
    const changes = [
      update({ message: 'forged' }),
      update({ message: 'forged' }, chunter.class.ThreadMessage),
      update({ attachments: 0, editedOn: 1 }),
      update({ attachedTo: 'other' }),
      update({ $unset: { message: true } }),
      update({ $rename: { note: 'message' } }),
      update({ 'forwardContent.message': 'x' }),
      // Moving it away removes it from the channel, a zero counter hides its polls.
      update({ space: 'bob-space' }),
      update({ applets: 0 }),
      // Under the base class the storage writes the same row.
      update({ message: 'forged' }, activity.class.ActivityMessage)
    ]
    for (const tx of changes) {
      await expect(middleware.tx(bob(), [tx])).rejects.toThrow()
    }
    expect(passed).toEqual([])

    await middleware.tx(ctxOf(alice, [aliceSocial]), [changes[0]])
    expect(passed).toEqual([changes[0]])
  })

  it('moves the messages of others only along with what they are attached to', async () => {
    const move = (_id: string, ops: any): Tx =>
      factory.createTxUpdateDoc(chunter.class.ChatMessage, channel, _id as any, ops)
    const moveIssue = factory.createTxUpdateDoc(
      issueClass as any,
      'project-1' as any,
      'issue-1' as any,
      {
        space: 'project-2'
      } as any
    )
    await middleware.tx(bob(), [move(messageId, { space: 'project-2' }), moveIssue])
    expect(passed).toHaveLength(2)

    const batches: Tx[][] = [
      [move(messageId, { space: 'project-3' }), moveIssue],
      [move(messageId, { space: 'project-2', message: 'forged' }), moveIssue],
      // An update of the same id in another table moves nothing.
      [
        move(messageId, { space: 'project-2' }),
        factory.createTxUpdateDoc(
          'test:class:Other' as any,
          'project-1' as any,
          'issue-1' as any,
          {
            space: 'project-2'
          } as any
        )
      ],
      // A channel does not move, and its messages stay in it.
      [
        move('channel-msg', { space: 'bob-space' }),
        factory.createTxUpdateDoc(channelClass as any, core.space.Space, channel, { space: 'bob-space' } as any)
      ]
    ]
    for (const batch of batches) {
      await expect(middleware.tx(bob(), batch)).rejects.toThrow()
    }
  })

  it('leaves pinning and resolving open to members, nothing else', async () => {
    const pin = update({ isPinned: true })
    const resolve = update({ resolved: true })
    await middleware.tx(bob(), [pin, resolve])
    expect(passed).toEqual([pin, resolve])

    // A field nobody listed stays the author's.
    await expect(middleware.tx(bob(), [update({ provider: 'forged' })])).rejects.toThrow()
  })

  it('lets members work with a proposal card of the AI bot', async () => {
    const edit = factory.createTxUpdateDoc(aiBot.class.AITaskProposalMessage, channel, 'proposal-1' as any, {
      message: 'With links to the created issues',
      project: 'project-1'
    } as any)
    await middleware.tx(bob(), [edit])
    expect(passed).toEqual([edit])

    const author = factory.createTxUpdateDoc(aiBot.class.AITaskProposalMessage, channel, 'proposal-1' as any, {
      createdBy: bobSocial
    } as any)
    await expect(middleware.tx(bob(), [author])).rejects.toThrow()

    const remove = factory.createTxRemoveDoc(aiBot.class.AITaskProposalMessage, channel, 'proposal-1' as any)
    await expect(middleware.tx(bob(), [remove])).rejects.toThrow()
  })

  it('lets a maintainer change any message', async () => {
    // As merging persons does with messages attached to the merged one.
    const repoint = update({ attachedTo: 'person-2', $push: { repliedPersons: 'person-2' } })
    const edit = update({ message: 'moderated' })
    await expect(middleware.tx(bob(), [repoint])).rejects.toThrow()
    await middleware.tx(bob(AccountRole.Maintainer), [repoint])
    await middleware.tx(bob(AccountRole.Owner), [edit])
    expect(passed).toEqual([repoint, edit])
  })

  it('lets neither the author nor a member rewrite who wrote a message', async () => {
    await expect(middleware.tx(ctxOf(alice, [aliceSocial]), [update({ createdBy: bobSocial })])).rejects.toMatchObject({
      status: { params: { kind: ForbiddenKind.SystemOnly } }
    })
    await expect(middleware.tx(bob(), [update({ createdBy: bobSocial, isPinned: true })])).rejects.toThrow()
  })

  it('leaves new messages and other activity messages to other rules', async () => {
    const create = factory.createTxCreateDoc(chunter.class.ChatMessage, channel, { message: 'Hi' } as any)
    const docUpdate = factory.createTxUpdateDoc(activity.class.DocUpdateMessage, channel, 'doc-update-1' as any, {
      action: 'update'
    } as any)
    await middleware.tx(bob(), [create, docUpdate])
    expect(passed).toEqual([create, docUpdate])
  })

  it('refuses a mixin that is a field name, takes a real one', async () => {
    const fake = factory.createTxMixin(messageId, chunter.class.ChatMessage, channel, 'message' as any, {} as any)
    await expect(middleware.tx(bob(), [fake])).rejects.toThrow()

    const real = factory.createTxMixin(messageId, chunter.class.ChatMessage, channel, 'real-mixin' as any, {} as any)
    await middleware.tx(bob(), [real])
    expect(passed).toEqual([real])
  })

  it('lets the author or a maintainer remove a message', async () => {
    await expect(middleware.tx(bob(), [remove()])).rejects.toMatchObject({
      status: { params: { kind: ForbiddenKind.AuthorOnly } }
    })
    await expect(middleware.tx(bob(), [remove(chunter.class.ThreadMessage)])).rejects.toThrow()
    await expect(middleware.tx(bob(), [remove(activity.class.ActivityMessage)])).rejects.toThrow()
    expect(passed).toEqual([])

    await middleware.tx(ctxOf(alice, [aliceSocial]), [remove()])
    await middleware.tx(bob(AccountRole.Maintainer), [remove()])
    await middleware.tx(bob(AccountRole.Owner), [remove()])
    expect(passed).toHaveLength(3)
  })

  it('does not check a cascade from triggers or the system account', async () => {
    await middleware.tx(ctxOf('bob' as AccountUuid, [bobSocial], AccountRole.User, true), [remove()])
    await middleware.tx(ctxOf(systemAccountUuid, [core.account.System]), [update({ message: 'imported' })])
    expect(passed).toHaveLength(2)
  })
})
