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

import {
  hasMessageNotification,
  hasReactionNotificationByMessage,
  hasMentionNotificationByMessage,
  hasReactionNotification,
  hasUnreadReactionByMessage,
  hasUnreadReaction,
  hasUnreadMentionByMessage,
  hasUnreadMessage,
  getNotificationsByMessage,
  getMentionNotification,
  getLastNotify,
  getMode,
  isMuted,
  getCreateContextTx,
  isNotificationRecorded,
  setUnreadMessagesCounts
} from '../context'
import { emptyResult } from '../result'
import notification, {
  DocNotifyContext,
  DocNotificationSetting,
  ContextNotification,
  UnreadMessage
} from '@hcengineering/notification'
import { ActivityMessage, Reaction } from '@hcengineering/activity'
import core, {
  Ref,
  AccountUuid,
  TxFactory,
  Doc,
  Class,
  Space,
  Timestamp,
  TxCreateDoc,
  TxUpdateDoc,
  DocumentUpdate
} from '@hcengineering/core'
import { ObjectDisplayData, Client } from '../../types'
import { Receiver } from '@hcengineering/server-notification'
import type Cache from '../../cache'

describe('context utils', () => {
  describe('notification presence checks', () => {
    let mockContext: DocNotifyContext

    beforeEach(() => {
      mockContext = {
        latestNotifications: [
          { type: 'message', messageId: 'msg-1' as Ref<ActivityMessage> },
          { type: 'reaction', messageId: 'msg-2' as Ref<ActivityMessage>, id: 'react-1' as Ref<Reaction> },
          { type: 'mention', messageId: 'msg-3' as Ref<ActivityMessage> },
          { type: 'common' }
        ]
      } as unknown as DocNotifyContext
    })

    it('hasMessageNotification returns true if message type with messageId matches', () => {
      expect(hasMessageNotification(mockContext, 'msg-1' as Ref<ActivityMessage>)).toBe(true)
      expect(hasMessageNotification(mockContext, 'msg-999' as Ref<ActivityMessage>)).toBe(false)
    })

    it('hasReactionNotificationByMessage returns true if reaction type with messageId matches', () => {
      expect(hasReactionNotificationByMessage(mockContext, 'msg-2' as Ref<ActivityMessage>)).toBe(true)
      expect(hasReactionNotificationByMessage(mockContext, 'msg-1' as Ref<ActivityMessage>)).toBe(false)
    })

    it('hasMentionNotificationByMessage returns true if mention type with messageId matches', () => {
      expect(hasMentionNotificationByMessage(mockContext, 'msg-3' as Ref<ActivityMessage>)).toBe(true)
      expect(hasMentionNotificationByMessage(mockContext, 'msg-1' as Ref<ActivityMessage>)).toBe(false)
    })

    it('hasReactionNotification returns true if reaction type with id matches', () => {
      expect(hasReactionNotification(mockContext, 'react-1' as Ref<Reaction>)).toBe(true)
      expect(hasReactionNotification(mockContext, 'react-999' as Ref<Reaction>)).toBe(false)
    })
  })

  describe('unread state checks', () => {
    let mockContext: DocNotifyContext

    beforeEach(() => {
      mockContext = {
        unreadReactions: [
          { attachedTo: 'msg-1' as Ref<ActivityMessage>, id: 'react-1' as Ref<Reaction> },
          { attachedTo: 'msg-2' as Ref<ActivityMessage>, id: 'react-2' as Ref<Reaction> }
        ],
        unreadMentions: [],
        unreadMessages: [
          { id: 'msg-3' as Ref<ActivityMessage>, createdOn: 50, mentioned: true, notified: true },
          { id: 'msg-4' as Ref<ActivityMessage>, createdOn: 100 },
          { id: 'msg-5' as Ref<ActivityMessage>, createdOn: 200 }
        ]
      } as unknown as DocNotifyContext
    })

    it('hasUnreadReactionByMessage returns true if unread reaction attachedTo matches', () => {
      expect(hasUnreadReactionByMessage(mockContext, 'msg-1' as Ref<ActivityMessage>)).toBe(true)
      expect(hasUnreadReactionByMessage(mockContext, 'msg-999' as Ref<ActivityMessage>)).toBe(false)
    })

    it('hasUnreadReaction returns true if unread reaction id matches', () => {
      expect(hasUnreadReaction(mockContext, 'react-1' as Ref<Reaction>)).toBe(true)
      expect(hasUnreadReaction(mockContext, 'react-999' as Ref<Reaction>)).toBe(false)
    })

    it('hasUnreadMentionByMessage returns true if unread mention messageId matches', () => {
      expect(hasUnreadMentionByMessage(mockContext, 'msg-3' as Ref<ActivityMessage>)).toBe(true)
      expect(hasUnreadMentionByMessage(mockContext, 'msg-999' as Ref<ActivityMessage>)).toBe(false)
    })

    it('hasUnreadMessage returns true if unread message id matches and is an unread message id', () => {
      expect(hasUnreadMessage(mockContext, 'msg-4' as Ref<ActivityMessage>)).toBe(true)
      expect(hasUnreadMessage(mockContext, 'msg-999' as Ref<ActivityMessage>)).toBe(false)
    })

    it('hasUnreadReactionByMessage returns false when context.unreadReactions is undefined', () => {
      const context = {} as unknown as DocNotifyContext
      expect(hasUnreadReactionByMessage(context, 'msg-1' as Ref<ActivityMessage>)).toBe(false)
    })

    it('hasUnreadReaction returns false when context.unreadReactions is undefined', () => {
      const context = {} as unknown as DocNotifyContext
      expect(hasUnreadReaction(context, 'react-1' as Ref<Reaction>)).toBe(false)
    })

    it('hasUnreadReactionByMessage returns false when context.unreadMessages is undefined', () => {
      const context = {} as unknown as DocNotifyContext
      expect(hasUnreadMentionByMessage(context, 'msg-1' as Ref<ActivityMessage>)).toBe(false)
    })

    it('hasUnreadMessage returns false when context.unreadMessages is undefined', () => {
      const context = {} as unknown as DocNotifyContext
      expect(hasUnreadMessage(context, 'msg-1' as Ref<ActivityMessage>)).toBe(false)
    })
  })

  describe('isNotificationRecorded', () => {
    it('returns true when found by latestNotifications[].id', () => {
      const context = {
        latestNotifications: [{ id: 'notify-1', type: 'common' }]
      } as unknown as DocNotifyContext

      expect(
        isNotificationRecorded(context, {
          notification: { id: 'notify-1', type: 'common' } as unknown as ContextNotification
        })
      ).toBe(true)
    })

    it('returns true when a mention is found by messageId via latestNotifications', () => {
      const context = {
        latestNotifications: [{ id: 'other-id', type: 'mention', messageId: 'msg-1' as Ref<ActivityMessage> }]
      } as unknown as DocNotifyContext

      expect(
        isNotificationRecorded(context, {
          notification: {
            id: 'notify-2',
            type: 'mention',
            messageId: 'msg-1' as Ref<ActivityMessage>
          } as unknown as ContextNotification
        })
      ).toBe(true)
    })

    it('returns true when found in unreadMessages by id (ignoring chunk entries)', () => {
      const context = {
        latestNotifications: [],
        unreadMessages: [
          { from: 10 as Timestamp, to: 20 as Timestamp, count: 3 },
          { id: 'msg-1' as Ref<ActivityMessage>, createdOn: 100 }
        ]
      } as unknown as DocNotifyContext

      expect(
        isNotificationRecorded(context, {
          notification: { id: 'notify-3', type: 'message' } as unknown as ContextNotification,
          unreadMessage: { id: 'msg-1' as Ref<ActivityMessage>, createdOn: 1 }
        })
      ).toBe(true)
    })

    it('does not match unreadMessages chunk entries ({from,to,count})', () => {
      const context = {
        latestNotifications: [],
        unreadMessages: [{ from: 10 as Timestamp, to: 20 as Timestamp, count: 3 }]
      } as unknown as DocNotifyContext

      expect(
        isNotificationRecorded(context, {
          notification: { id: 'notify-3', type: 'message' } as unknown as ContextNotification,
          unreadMessage: { id: 'msg-1' as Ref<ActivityMessage>, createdOn: 1 }
        })
      ).toBe(false)
    })

    it('returns true when found in unreadReactions by id', () => {
      const context = {
        latestNotifications: [],
        unreadReactions: [{ id: 'react-1' as Ref<Reaction>, attachedTo: 'msg-1' as Ref<ActivityMessage> }]
      } as unknown as DocNotifyContext

      expect(
        isNotificationRecorded(context, {
          notification: { id: 'notify-4', type: 'reaction' } as unknown as ContextNotification,
          unreadReaction: { id: 'react-1' as Ref<Reaction>, attachedTo: 'msg-1' as Ref<ActivityMessage> }
        })
      ).toBe(true)
    })

    it('returns true when found in unreadMentions by id', () => {
      const context = {
        latestNotifications: [],
        unreadMentions: [{ id: 'mention-1' }]
      } as unknown as DocNotifyContext

      expect(
        isNotificationRecorded(context, {
          notification: { id: 'notify-5', type: 'mention' } as unknown as ContextNotification,
          unreadMention: { id: 'mention-1' }
        })
      ).toBe(true)
    })

    it('returns true when found in unreadCommons by id', () => {
      const context = {
        latestNotifications: [],
        unreadCommons: [{ id: 'common-1' }]
      } as unknown as DocNotifyContext

      expect(
        isNotificationRecorded(context, {
          notification: { id: 'notify-6', type: 'common' } as unknown as ContextNotification,
          unreadCommon: { id: 'common-1', type: 'common', createdBy: 'acc' as any, createdOn: 1 }
        })
      ).toBe(true)
    })

    it('returns false for an unknown id', () => {
      const context = {
        latestNotifications: [{ id: 'notify-1', type: 'common' }],
        unreadMessages: [{ id: 'msg-1' as Ref<ActivityMessage>, createdOn: 100 }],
        unreadReactions: [{ id: 'react-1' as Ref<Reaction>, attachedTo: 'msg-1' as Ref<ActivityMessage> }],
        unreadMentions: [{ id: 'mention-1' }],
        unreadCommons: [{ id: 'common-1' }]
      } as unknown as DocNotifyContext

      expect(
        isNotificationRecorded(context, {
          notification: { id: 'notify-unknown', type: 'message' } as unknown as ContextNotification,
          unreadMessage: { id: 'msg-unknown' as Ref<ActivityMessage>, createdOn: 1 },
          unreadReaction: { id: 'react-unknown' as Ref<Reaction>, attachedTo: 'msg-unknown' as Ref<ActivityMessage> },
          unreadMention: { id: 'mention-unknown' },
          unreadCommon: { id: 'common-unknown', type: 'common', createdBy: 'acc' as any, createdOn: 1 }
        })
      ).toBe(false)
    })

    it('tolerates a context whose unread arrays are undefined', () => {
      const context = {} as unknown as DocNotifyContext

      expect(
        isNotificationRecorded(context, {
          notification: { id: 'notify-1', type: 'message' } as unknown as ContextNotification,
          unreadMessage: { id: 'msg-1' as Ref<ActivityMessage>, createdOn: 1 },
          unreadReaction: { id: 'react-1' as Ref<Reaction>, attachedTo: 'msg-1' as Ref<ActivityMessage> },
          unreadMention: { id: 'mention-1' },
          unreadCommon: { id: 'common-1', type: 'common', createdBy: 'acc' as any, createdOn: 1 }
        })
      ).toBe(false)
    })
  })

  describe('notification queries', () => {
    it('getNotificationsByMessage returns non-common notifications with messageId', () => {
      const mockContext = {
        latestNotifications: [
          { type: 'message', messageId: 'msg-1' as Ref<ActivityMessage> },
          { type: 'reaction', messageId: 'msg-1' as Ref<ActivityMessage> },
          { type: 'common', messageId: 'msg-1' as Ref<ActivityMessage> },
          { type: 'message', messageId: 'msg-2' as Ref<ActivityMessage> }
        ]
      } as unknown as DocNotifyContext

      const result = getNotificationsByMessage(mockContext, 'msg-1' as Ref<ActivityMessage>)
      expect(result).toEqual([
        { type: 'message', messageId: 'msg-1' },
        { type: 'reaction', messageId: 'msg-1' }
      ])
    })

    it('getMentionNotification returns mention notification matching messageId', () => {
      const mockContext = {
        latestNotifications: [
          { type: 'message', messageId: 'msg-1' as Ref<ActivityMessage> },
          { type: 'mention', messageId: 'msg-1' as Ref<ActivityMessage> },
          { type: 'mention', messageId: null }
        ]
      } as unknown as DocNotifyContext

      expect(getMentionNotification(mockContext, 'msg-1' as Ref<ActivityMessage>)).toEqual({
        type: 'mention',
        messageId: 'msg-1'
      })
      expect(getMentionNotification(mockContext, null)).toEqual({ type: 'mention', messageId: null })
      expect(getMentionNotification(mockContext, 'msg-999' as Ref<ActivityMessage>)).toBeUndefined()
    })
  })

  describe('context state helpers', () => {
    it('getLastNotify returns max createdOn or 0', () => {
      const context1 = {
        latestNotifications: [{ createdOn: 10 }, { createdOn: 25 }, { createdOn: 5 }]
      } as unknown as DocNotifyContext
      expect(getLastNotify(context1)).toBe(25)

      const context2 = { latestNotifications: [] } as unknown as DocNotifyContext
      expect(getLastNotify(context2)).toBe(0)
    })

    it('getMode returns correct mode or default value', () => {
      const docSettings = [
        { account: 'user-1' as AccountUuid, mode: 'mentions' },
        { account: 'user-2' as AccountUuid, mode: 'mute' }
      ] as unknown as DocNotificationSetting[]

      expect(getMode(docSettings, 'user-1' as AccountUuid)).toBe('mentions')
      expect(getMode(docSettings, 'user-2' as AccountUuid)).toBe('mute')
      expect(getMode(docSettings, 'user-3' as AccountUuid)).toBe('all')
    })

    it('isMuted checks if mode is mute', () => {
      expect(isMuted('mute')).toBe(true)
      expect(isMuted('all')).toBe(false)
      expect(isMuted('mentions')).toBe(false)
    })
  })

  describe('context transaction builders', () => {
    let mockFactory: {
      createTxUpdateDoc: jest.Mock
      createTxCreateDoc: jest.Mock
    }

    beforeEach(() => {
      mockFactory = {
        createTxUpdateDoc: jest.fn().mockImplementation((cls, spc, id, payload) => ({
          _id: 'tx-update-1',
          cls,
          spc,
          objectId: id,
          payload
        })),
        createTxCreateDoc: jest.fn().mockImplementation((cls, spc, payload, id) => ({
          _id: 'tx-create-1',
          cls,
          spc,
          payload,
          objectId: id
        }))
      }
    })

    describe('getCreateContextTx', () => {
      it('creates a create transaction and registers it', () => {
        const result = emptyResult()
        const receiver = {
          account: 'receiver-acc' as AccountUuid,
          space: 'receiver-space' as Ref<Space>
        } as unknown as Receiver
        const display = {
          objectTitle: 'Title',
          objectIdentifier: 'ID-1',
          objectIcon: 'icon-ref',
          objectLabel: 'label-ref'
        } as unknown as ObjectDisplayData

        const tx = getCreateContextTx(
          'new-ctx-id' as Ref<DocNotifyContext>,
          'doc-1' as Ref<Doc>,
          'DocClass' as Ref<Class<Doc>>,
          'doc-space' as Ref<Space>,
          receiver,
          result,
          mockFactory as unknown as TxFactory,
          display
        )

        expect(mockFactory.createTxCreateDoc).toHaveBeenCalledWith(
          expect.anything(), // DocNotifyContext class ref
          'receiver-space',
          {
            ...display,
            user: 'receiver-acc' as AccountUuid,
            objectId: 'doc-1',
            objectClass: 'DocClass',
            objectSpace: 'doc-space',
            latestNotifications: [],
            unreadReactions: [],
            unreadMentions: [],
            unreadCommons: [],
            unreadMessages: [],
            unreadCount: 0,
            unreadMessagesCount: 0,
            notifiedMessagesCount: 0,
            lastNotify: 0
          },
          'new-ctx-id'
        )

        expect(result.createContextTx).toEqual([tx])
      })
    })
  })

  describe('setUnreadMessagesCounts', () => {
    const factory = new TxFactory(core.account.System)
    const contextClass = notification.class.DocNotifyContext
    const contextSpace = 'ctx-space' as Ref<Space>
    const contextId = 'ctx-1' as Ref<DocNotifyContext>

    function createContextTx (
      attributes: Partial<DocNotifyContext>,
      id: Ref<DocNotifyContext>
    ): TxCreateDoc<DocNotifyContext> {
      return factory.createTxCreateDoc<DocNotifyContext>(contextClass, contextSpace, attributes as DocNotifyContext, id)
    }

    function updateContextTx (
      operations: DocumentUpdate<DocNotifyContext>,
      id: Ref<DocNotifyContext> = contextId
    ): TxUpdateDoc<DocNotifyContext> {
      return factory.createTxUpdateDoc<DocNotifyContext>(contextClass, contextSpace, id, operations)
    }

    function makeUnreadContext (id: Ref<DocNotifyContext>, unreadMessages: UnreadMessage[]): DocNotifyContext {
      const value = { _id: id, unreadMessages }
      return value as unknown as DocNotifyContext
    }

    function makeCache (cached: Record<string, DocNotifyContext | undefined>): Pick<Cache, 'getCachedContext'> {
      return {
        getCachedContext: (id: Ref<DocNotifyContext>) => cached[id as unknown as string]
      }
    }

    function makeClient (findOneResult: DocNotifyContext | undefined): { findOne: jest.Mock, ctx: { warn: jest.Mock } } {
      return {
        ctx: { warn: jest.fn() },
        findOne: jest.fn(async () => findOneResult)
      }
    }

    it('sets unreadMessagesCount on a create tx from attributes.unreadMessages', async () => {
      const result = emptyResult()
      const tx = createContextTx(
        {
          unreadMessages: [
            { id: 'msg-1' as Ref<ActivityMessage>, createdOn: 10 },
            { from: 1, to: 2, count: 5 }
          ]
        },
        contextId
      )
      result.createContextTx.push(tx)

      await setUnreadMessagesCounts(
        result,
        makeCache({}) as unknown as Cache,
        makeClient(undefined) as unknown as Client
      )

      expect(tx.attributes.unreadMessagesCount).toBe(6)
    })

    it('sets notifiedMessagesCount from the notified entries and chunks, on create and on update', async () => {
      const result = emptyResult()
      const createTx = createContextTx(
        {
          unreadMessages: [
            { from: 1, to: 2, count: 5, notifiedCount: 2 },
            { id: 'msg-1' as Ref<ActivityMessage>, createdOn: 10 },
            { id: 'msg-2' as Ref<ActivityMessage>, createdOn: 11, notified: true }
          ]
        },
        'ctx-created' as Ref<DocNotifyContext>
      )
      result.createContextTx.push(createTx)

      // A mentions-only channel: two unread messages without a notification, one more arrives with it.
      const cachedContext = makeUnreadContext(contextId, [
        { id: 'a' as Ref<ActivityMessage>, createdOn: 10 },
        { id: 'b' as Ref<ActivityMessage>, createdOn: 20 }
      ])
      const pushTx = updateContextTx({
        $push: { unreadMessages: { id: 'c' as Ref<ActivityMessage>, createdOn: 30, notified: true } }
      })
      const pullTx = updateContextTx({ $pull: { unreadMessages: { id: { $in: ['c' as Ref<ActivityMessage>] } } } })
      result.updateContextTx.push(pushTx, pullTx)

      await setUnreadMessagesCounts(
        result,
        makeCache({ [contextId]: cachedContext }) as unknown as Cache,
        makeClient(undefined) as unknown as Client
      )

      expect(createTx.attributes.notifiedMessagesCount).toBe(3)
      expect(pushTx.operations).toMatchObject({ unreadMessagesCount: 3, notifiedMessagesCount: 1 })
      expect(pullTx.operations).toMatchObject({ unreadMessagesCount: 2, notifiedMessagesCount: 0 })
    })

    it('sets unreadMessagesCount to 0 on a create tx with an empty/undefined unreadMessages array', async () => {
      const result = emptyResult()
      const txEmpty = createContextTx({ unreadMessages: [] }, 'ctx-empty' as Ref<DocNotifyContext>)
      const txUndefined = createContextTx({}, 'ctx-undefined' as Ref<DocNotifyContext>)
      result.createContextTx.push(txEmpty, txUndefined)

      await setUnreadMessagesCounts(
        result,
        makeCache({}) as unknown as Cache,
        makeClient(undefined) as unknown as Client
      )

      expect(txEmpty.attributes.unreadMessagesCount).toBe(0)
      expect(txUndefined.attributes.unreadMessagesCount).toBe(0)
    })

    it('sets operations.unreadMessagesCount on a $push update tx using the cached context, without mutating the cached object', async () => {
      const cachedContext = makeUnreadContext(contextId, [
        { id: 'msg-1' as Ref<ActivityMessage>, createdOn: 10 },
        { id: 'msg-2' as Ref<ActivityMessage>, createdOn: 20 }
      ])
      const cachedSnapshot = JSON.parse(JSON.stringify(cachedContext))

      const result = emptyResult()
      const tx = updateContextTx({
        $push: { unreadMessages: { id: 'msg-3' as Ref<ActivityMessage>, createdOn: 30 } }
      })
      result.updateContextTx.push(tx)

      await setUnreadMessagesCounts(
        result,
        makeCache({ [contextId]: cachedContext }) as unknown as Cache,
        makeClient(undefined) as unknown as Client
      )

      expect(tx.operations.unreadMessagesCount).toBe(3)
      expect(cachedContext).toEqual(cachedSnapshot)
    })

    it('leaves every array of the cached context untouched, latestNotifications included', async () => {
      const cachedContext = {
        _id: contextId,
        unreadMessages: [{ id: 'msg-1' as Ref<ActivityMessage>, createdOn: 10 }],
        latestNotifications: [{ id: 'n-1', type: 'message', messageId: 'msg-1', createdOn: 10 }],
        unreadReactions: [] as unknown[]
      } as unknown as DocNotifyContext
      const cachedSnapshot = JSON.parse(JSON.stringify(cachedContext))

      const result = emptyResult()
      const tx = updateContextTx({
        $push: {
          unreadMessages: { id: 'msg-2' as Ref<ActivityMessage>, createdOn: 20 },
          latestNotifications: {
            $each: [{ id: 'n-2', type: 'message', messageId: 'msg-2', createdOn: 20 } as any],
            $position: 0,
            $slice: 5
          }
        } as any
      })
      result.updateContextTx.push(tx)

      await setUnreadMessagesCounts(
        result,
        makeCache({ [contextId]: cachedContext }) as unknown as Cache,
        makeClient(undefined) as unknown as Client
      )

      expect(tx.operations.unreadMessagesCount).toBe(2)
      // applyResult replays the same operations on the cache: a shared array would get them twice.
      expect(cachedContext).toEqual(cachedSnapshot)
    })

    it('replaces a decrement that would take unreadCount below zero with an absolute 0', async () => {
      const cachedContext = { _id: contextId, unreadCount: 1, unreadMessages: [] } as unknown as DocNotifyContext
      const result = emptyResult()
      const tx = updateContextTx({ $inc: { unreadCount: -2 }, $pull: { unreadReactions: { id: 'r1' } } } as any)
      result.updateContextTx.push(tx)
      const client = makeClient(undefined)

      await setUnreadMessagesCounts(
        result,
        makeCache({ [contextId]: cachedContext }) as unknown as Cache,
        client as unknown as Client
      )

      // The column has a CHECK (>= 0): the raw decrement would fail the whole batch.
      expect(tx.operations.$inc).toBeUndefined()
      expect(tx.operations.unreadCount).toBe(0)
      expect(client.ctx.warn).toHaveBeenCalled()
      expect(cachedContext.unreadCount).toBe(1)
    })

    it('decreases unreadMessagesCount on a $pull update tx with $in', async () => {
      const cachedContext = makeUnreadContext(contextId, [
        { id: 'a' as Ref<ActivityMessage>, createdOn: 10 },
        { id: 'b' as Ref<ActivityMessage>, createdOn: 20 },
        { id: 'c' as Ref<ActivityMessage>, createdOn: 30 }
      ])

      const result = emptyResult()
      const tx = updateContextTx({
        $pull: { unreadMessages: { id: { $in: ['a' as Ref<ActivityMessage>] } } }
      })
      result.updateContextTx.push(tx)

      await setUnreadMessagesCounts(
        result,
        makeCache({ [contextId]: cachedContext }) as unknown as Cache,
        makeClient(undefined) as unknown as Client
      )

      // NOTE: this asserts against TxProcessor.updateDoc2Doc's actual $pull handling for the
      // `{ field: { $in: [...] } }` shape (core's $pull operator matches per-field $in when the
      // top-level key isn't itself `$in`). If core changes that semantic, this count will drift.
      expect(tx.operations.unreadMessagesCount).toBe(2)
    })

    it('sets unreadMessagesCount to the total of the new array on a wholesale (collapse) update', async () => {
      const cachedContext = makeUnreadContext(
        contextId,
        Array.from({ length: 150 }, (_, i) => ({ id: `msg-${i}` as Ref<ActivityMessage>, createdOn: i }))
      )

      const collapsed: UnreadMessage[] = [
        { from: 0, to: 129, count: 130 },
        { id: 'msg-149' as Ref<ActivityMessage>, createdOn: 149 }
      ]

      const result = emptyResult()
      const tx = updateContextTx({ unreadMessages: collapsed })
      result.updateContextTx.push(tx)

      await setUnreadMessagesCounts(
        result,
        makeCache({ [contextId]: cachedContext }) as unknown as Cache,
        makeClient(undefined) as unknown as Client
      )

      expect(tx.operations.unreadMessagesCount).toBe(131)
    })

    it("applies two update txes for the same context sequentially, second sees the first one's effect", async () => {
      const cachedContext = makeUnreadContext(contextId, [{ id: 'msg-1' as Ref<ActivityMessage>, createdOn: 10 }])

      const result = emptyResult()
      const tx1 = updateContextTx({
        $push: { unreadMessages: { id: 'msg-2' as Ref<ActivityMessage>, createdOn: 20 } }
      })
      const tx2 = updateContextTx({
        $push: { unreadMessages: { id: 'msg-3' as Ref<ActivityMessage>, createdOn: 30 } }
      })
      result.updateContextTx.push(tx1, tx2)

      await setUnreadMessagesCounts(
        result,
        makeCache({ [contextId]: cachedContext }) as unknown as Cache,
        makeClient(undefined) as unknown as Client
      )

      expect(tx1.operations.unreadMessagesCount).toBe(2)
      expect(tx2.operations.unreadMessagesCount).toBe(3)
    })

    it('falls back to client.findOne when the context is missing from the cache', async () => {
      const foundContext = makeUnreadContext(contextId, [
        { id: 'msg-1' as Ref<ActivityMessage>, createdOn: 10 },
        { id: 'msg-2' as Ref<ActivityMessage>, createdOn: 20 }
      ])

      const result = emptyResult()
      const tx = updateContextTx({
        $push: { unreadMessages: { id: 'msg-3' as Ref<ActivityMessage>, createdOn: 30 } }
      })
      result.updateContextTx.push(tx)

      const client = makeClient(foundContext)
      await setUnreadMessagesCounts(result, makeCache({}) as unknown as Cache, client as unknown as Client)

      expect(client.findOne).toHaveBeenCalledWith(notification.class.DocNotifyContext, { _id: contextId })
      expect(tx.operations.unreadMessagesCount).toBe(3)
    })

    it('leaves the tx untouched when the context is missing from both cache and client.findOne', async () => {
      const result = emptyResult()
      const tx = updateContextTx({
        $push: { unreadMessages: { id: 'msg-3' as Ref<ActivityMessage>, createdOn: 30 } }
      })
      result.updateContextTx.push(tx)

      await setUnreadMessagesCounts(
        result,
        makeCache({}) as unknown as Cache,
        makeClient(undefined) as unknown as Client
      )

      expect(tx.operations.unreadMessagesCount).toBeUndefined()
    })

    it('leaves an update tx that does not touch unreadMessages untouched', async () => {
      const cachedContext = makeUnreadContext(contextId, [{ id: 'msg-1' as Ref<ActivityMessage>, createdOn: 10 }])

      const result = emptyResult()
      const tx = updateContextTx({ $inc: { unreadCount: 1 } })
      result.updateContextTx.push(tx)

      await setUnreadMessagesCounts(
        result,
        makeCache({ [contextId]: cachedContext }) as unknown as Cache,
        makeClient(undefined) as unknown as Client
      )

      expect(tx.operations.unreadMessagesCount).toBeUndefined()
    })
  })
})
