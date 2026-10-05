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

import core, { AccountUuid, readOnlyGuestAccountUuid, Ref, TxCUD, TxCreateDoc, Space } from '@hcengineering/core'
import notification, {
  ClearAllNotificationAction,
  CreateNotificationAction,
  DocNotifyContext,
  ReadAllNotificationAction,
  ReadNotificationAction
} from '@hcengineering/notification'
import activity from '@hcengineering/activity'

import { Client, Result, TxCache } from '../../types'
import Cache from '../../cache'
import {
  handleClearAllNotificationAction,
  handleCreateNotificationAction,
  handleReadAllNotificationAction,
  handleReadNotificationAction
} from '../action'
import { emptyResult } from '../../utils/result'
import { pushNotification } from '../notification'
import { getBaseDisplayParams, getEmptyTxCache, getObjectDisplayData } from '../../utils/utils'

jest.mock('../../config', () => ({
  __esModule: true,
  default: {
    LatestNotificationsSliceSize: 5
  },
  LatestNotificationsSliceSize: 5
}))

jest.mock('../../utils/utils', () => {
  return {
    getAllowedProviders: jest.fn(),
    getBaseDisplayParams: jest.fn(),
    getEmptyTxCache: jest.fn(),
    getObjectDisplayData: jest.fn()
  }
})

jest.mock('../notification', () => ({
  pushNotification: jest.fn()
}))

describe('handleReadNotificationAction', () => {
  let mockClient: {
    ctx: { warn: jest.Mock }
    findAll: jest.Mock
    txFactory: {
      createTxUpdateDoc: jest.Mock
    }
    pendingPush: { cancelByObject: jest.Mock, cancel: jest.Mock }
  }
  let mockCache: {
    getContext: jest.Mock
    getAccountBySocialId: jest.Mock
    getPushSubscriptions: jest.Mock
  }
  let result: Result

  beforeEach(() => {
    mockClient = {
      ctx: { warn: jest.fn() },
      findAll: jest.fn(),
      pendingPush: { cancelByObject: jest.fn(), cancel: jest.fn() },
      txFactory: {
        createTxUpdateDoc: jest.fn().mockImplementation((cls: string, space: string, id: string, payload: unknown) => ({
          _class: core.class.TxUpdateDoc,
          objectId: id,
          operations: payload
        }))
      }
    }

    mockCache = {
      getContext: jest.fn(),
      getAccountBySocialId: jest.fn(),
      getPushSubscriptions: jest.fn().mockResolvedValue([])
    }

    result = emptyResult()
    jest.clearAllMocks()
    // The author of every action in these tests is the account the action names.
    mockCache.getAccountBySocialId.mockResolvedValue('user-1')
  })

  it('ignores an action that names an account other than its author', async () => {
    const tx = {
      _class: core.class.TxCreateDoc,
      objectId: 'action-foreign',
      modifiedBy: 'social-2',
      attributes: { attachedTo: 'doc-1', account: 'user-1' as AccountUuid, commonIds: ['common-1'] }
    } as unknown as TxCUD<ReadNotificationAction>
    mockCache.getAccountBySocialId.mockResolvedValue('user-2')

    await handleReadNotificationAction(mockClient as unknown as Client, mockCache as unknown as Cache, result, tx)

    expect(mockCache.getContext).not.toHaveBeenCalled()
    expect(result.updateContextTx).toHaveLength(0)
  })

  it('does nothing if class is not TxCreateDoc', async () => {
    const tx = {
      _class: 'TxUpdateDoc'
    } as unknown as TxCUD<ReadNotificationAction>

    await handleReadNotificationAction(mockClient as unknown as Client, mockCache as unknown as Cache, result, tx)

    expect(mockCache.getContext).not.toHaveBeenCalled()
  })

  it('pulls direct reactions, commons, and direct mentions and decrements unreadCount', async () => {
    const tx = {
      _class: core.class.TxCreateDoc,
      objectId: 'action-1',
      attributes: {
        attachedTo: 'doc-1',
        account: 'user-1' as AccountUuid,
        reactionIds: ['reaction-1'],
        commonIds: ['common-1'],
        mentionIds: ['mention-1']
      }
    } as unknown as TxCUD<ReadNotificationAction>

    const context = {
      _id: 'ctx-1',
      _class: 'DocNotifyContext',
      space: 'space-1' as Ref<Space>,
      user: 'user-1' as AccountUuid,
      unreadReactions: [{ id: 'reaction-1', attachedTo: 'msg-1' }],
      unreadCommons: [{ id: 'common-1' }],
      unreadMentions: [{ id: 'mention-1' }],
      unreadCount: 3
    } as unknown as DocNotifyContext

    mockCache.getContext.mockResolvedValue(context)

    await handleReadNotificationAction(mockClient as unknown as Client, mockCache as unknown as Cache, result, tx)

    expect(result.updateContextTx).toHaveLength(1)
    expect(result.updateContextTx[0]).toEqual({
      _class: core.class.TxUpdateDoc,
      objectId: 'ctx-1',
      operations: {
        $pull: {
          unreadReactions: { id: { $in: ['reaction-1'] } },
          unreadCommons: { id: { $in: ['common-1'] } },
          unreadMentions: { id: { $in: ['mention-1'] } }
        },
        $inc: { unreadCount: -3 }
      }
    })
  })

  it('pulls message-based mention from unreadMessages and decrements unreadCount once', async () => {
    const tx = {
      _class: core.class.TxCreateDoc,
      objectId: 'action-1',
      attributes: {
        attachedTo: 'doc-1',
        account: 'user-1' as AccountUuid,
        messageIds: ['msg-1'],
        mentionIds: []
      }
    } as unknown as TxCUD<ReadNotificationAction>

    const context = {
      _id: 'ctx-1',
      _class: 'DocNotifyContext',
      space: 'space-1' as Ref<Space>,
      user: 'user-1' as AccountUuid,
      unreadMessages: [{ id: 'msg-1', createdOn: 100, notified: true, mentioned: true }],
      unreadMentions: [],
      unreadCount: 1
    } as unknown as DocNotifyContext

    mockCache.getContext.mockResolvedValue(context)
    mockClient.findAll.mockResolvedValue([{ _id: 'msg-1', createdOn: 100 }])

    await handleReadNotificationAction(mockClient as unknown as Client, mockCache as unknown as Cache, result, tx)

    expect(mockClient.findAll).not.toHaveBeenCalled()
    expect(result.updateContextTx).toHaveLength(1)
    expect(result.updateContextTx[0]).toEqual({
      _class: core.class.TxUpdateDoc,
      objectId: 'ctx-1',
      operations: {
        $pull: {
          unreadMessages: { id: { $in: ['msg-1'] } }
        },
        $inc: { unreadCount: -1 }
      }
    })
  })

  it('pulls messages and message chunks up to the maximum timestamp of the read messageIds', async () => {
    const tx = {
      _class: core.class.TxCreateDoc,
      objectId: 'action-1',
      attributes: {
        attachedTo: 'doc-1',
        account: 'user-1' as AccountUuid,
        messageIds: ['msg-2']
      }
    } as unknown as TxCUD<ReadNotificationAction>

    const context = {
      _id: 'ctx-1',
      _class: 'DocNotifyContext',
      space: 'space-1' as Ref<Space>,
      user: 'user-1' as AccountUuid,
      unreadMessages: [
        { id: 'msg-1', createdOn: 100, notified: true },
        { id: 'msg-2', createdOn: 150, notified: true },
        { from: 50, to: 120, count: 2, notifiedCount: 2 },
        { from: 160, to: 200, count: 1, notifiedCount: 1 }
      ],
      unreadCount: 5
    } as unknown as DocNotifyContext

    mockCache.getContext.mockResolvedValue(context)
    mockClient.findAll.mockResolvedValue([{ _id: 'msg-2', createdOn: 150 }])

    await handleReadNotificationAction(mockClient as unknown as Client, mockCache as unknown as Cache, result, tx)

    expect(mockClient.findAll).toHaveBeenCalledWith(
      activity.class.ActivityMessage,
      { _id: { $in: ['msg-2'] }, attachedTo: 'doc-1' },
      { projection: { _id: 1, createdOn: 1 } }
    )

    expect(result.updateContextTx).toHaveLength(2)
    // First update: pulls individual messages & updates count
    expect(result.updateContextTx[0]).toEqual({
      _class: core.class.TxUpdateDoc,
      objectId: 'ctx-1',
      operations: {
        $pull: {
          unreadMessages: { id: { $in: ['msg-1', 'msg-2'] } }
        },
        $inc: { unreadCount: -2 }
      }
    })
    // Second update: pulls chunk
    expect(result.updateContextTx[1]).toEqual({
      _class: core.class.TxUpdateDoc,
      objectId: 'ctx-1',
      operations: {
        $pull: {
          unreadMessages: { to: { $in: [120] } }
        },
        $inc: { unreadCount: -2 }
      }
    })
  })

  it('queues a dismiss for the native apps up to the newest message read', async () => {
    const tx = {
      _class: core.class.TxCreateDoc,
      objectId: 'action-dismiss',
      modifiedBy: 'social-1',
      attributes: {
        attachedTo: 'doc-1',
        account: 'user-1',
        messageIds: ['msg-1', 'msg-2']
      }
    } as unknown as TxCreateDoc<ReadNotificationAction>

    const context = {
      _id: 'ctx-1',
      _class: 'DocNotifyContext',
      space: 'space-1' as Ref<Space>,
      user: 'user-1' as AccountUuid,
      objectId: 'doc-1',
      objectClass: 'DocClass',
      objectSpace: 'space-doc',
      unreadMessages: [
        { id: 'msg-1', createdOn: 100, notified: true },
        { id: 'msg-2', createdOn: 150 },
        { id: 'msg-3', createdOn: 200, notified: true }
      ],
      unreadCount: 2
    } as unknown as DocNotifyContext

    mockCache.getContext.mockResolvedValue(context)
    mockCache.getPushSubscriptions.mockResolvedValue([
      { _id: 'sub-web', endpoint: 'https://push.example.com/x' },
      { _id: 'sub-fcm', endpoint: 'fcm://token' }
    ])

    await handleReadNotificationAction(mockClient as unknown as Client, mockCache as unknown as Cache, result, tx)

    expect(mockClient.pendingPush.cancelByObject).toHaveBeenCalledWith('user-1', 'doc-1', 150)
    expect(result.queueMessages).toEqual([
      {
        kind: 'dismiss',
        id: 'dismiss:ctx-1:150',
        account: 'user-1',
        objectId: 'doc-1',
        objectClass: 'DocClass',
        objectSpace: 'space-doc',
        pushSubscriptions: [{ _id: 'sub-fcm', endpoint: 'fcm://token' }],
        tags: ['msg-1'],
        readUpTo: 150
      }
    ])
  })
})

describe('handleReadNotificationAction: reactions, mentions and commons read', () => {
  const tx = {
    _class: core.class.TxCreateDoc,
    objectId: 'action-lists',
    modifiedBy: 'social-1',
    attributes: {
      attachedTo: 'doc-1',
      account: 'user-1',
      reactionIds: ['reaction-1', 'reaction-gone'],
      commonIds: ['common-1'],
      mentionIds: ['mention-1']
    }
  } as unknown as TxCreateDoc<ReadNotificationAction>

  const context = {
    _id: 'ctx-1',
    _class: 'DocNotifyContext',
    space: 'space-1' as Ref<Space>,
    user: 'user-1' as AccountUuid,
    objectId: 'doc-1',
    objectClass: 'DocClass',
    objectSpace: 'space-doc',
    unreadReactions: [{ id: 'reaction-1', attachedTo: 'msg-1' }],
    unreadCommons: [{ id: 'common-1' }],
    unreadMentions: [{ id: 'mention-1' }],
    unreadCount: 3
  } as unknown as DocNotifyContext

  let mockClient: any
  let mockCache: any
  let result: Result

  beforeEach(() => {
    mockClient = {
      ctx: { warn: jest.fn() },
      findAll: jest.fn(),
      pendingPush: { cancelByObject: jest.fn(), cancel: jest.fn() },
      txFactory: { createTxUpdateDoc: jest.fn().mockReturnValue({}) }
    }
    mockCache = {
      getContext: jest.fn().mockResolvedValue(context),
      getAccountBySocialId: jest.fn().mockResolvedValue('user-1'),
      getPushSubscriptions: jest.fn().mockResolvedValue([{ _id: 'sub-apns', endpoint: 'apns://token' }])
    }
    result = emptyResult()
  })

  it('cancels the held pushes of what was read and dismisses them by tag, with no read position', async () => {
    await handleReadNotificationAction(mockClient as Client, mockCache as Cache, result, tx)

    // Only what the context still held unread: an id the context does not know is not a push.
    expect(mockClient.pendingPush.cancel.mock.calls).toEqual([
      ['user-1', 'reaction-1'],
      ['user-1', 'common-1'],
      ['user-1', 'mention-1']
    ])
    expect(mockClient.pendingPush.cancelByObject).not.toHaveBeenCalled()
    expect(result.timeMachine).toEqual([
      { type: 'cancel', id: 'letter:user-1:reaction-1:%' },
      { type: 'cancel', id: 'letter:user-1:common-1:%' },
      { type: 'cancel', id: 'letter:user-1:mention-1:%' }
    ])
    expect(result.queueMessages).toEqual([
      expect.objectContaining({
        kind: 'dismiss',
        id: 'dismiss:ctx-1:reaction-1',
        objectId: 'doc-1',
        tags: ['reaction-1', 'common-1', 'mention-1'],
        readUpTo: 0
      })
    ])
  })

  it('dismisses nothing when the phone has no subscription', async () => {
    mockCache.getPushSubscriptions.mockResolvedValue([{ _id: 'sub-web', endpoint: 'https://push.example.com/x' }])

    await handleReadNotificationAction(mockClient as Client, mockCache as Cache, result, tx)

    expect(mockClient.pendingPush.cancel).toHaveBeenCalledTimes(3)
    expect(result.queueMessages).toEqual([])
  })
})

describe('read all / clear all notification actions', () => {
  const tx = {
    _class: core.class.TxCreateDoc,
    objectId: 'action-all',
    modifiedBy: 'social-1',
    modifiedOn: 1000,
    attributes: { account: 'user-1' }
  } as unknown as TxCreateDoc<ReadAllNotificationAction & ClearAllNotificationAction>

  // Messages (one notified, one chunk) and a reaction unread.
  const chat = {
    _id: 'ctx-chat',
    _class: 'DocNotifyContext',
    space: 'space-1' as Ref<Space>,
    user: 'user-1' as AccountUuid,
    objectId: 'doc-chat',
    objectClass: 'DocClass',
    objectSpace: 'space-doc',
    unreadMessages: [
      { from: 100, to: 200, count: 5, notifiedCount: 2 },
      { id: 'msg-1', createdOn: 300, notified: true }
    ],
    unreadReactions: [{ id: 'reaction-1', attachedTo: 'msg-0' }],
    unreadCount: 4
  } as unknown as DocNotifyContext

  // Only a common notification unread: no message position to move.
  const issue = {
    _id: 'ctx-issue',
    _class: 'DocNotifyContext',
    space: 'space-1' as Ref<Space>,
    user: 'user-1' as AccountUuid,
    objectId: 'doc-issue',
    objectClass: 'DocClass',
    objectSpace: 'space-doc',
    unreadCommons: [{ id: 'common-1' }],
    unreadCount: 1
  } as unknown as DocNotifyContext

  let mockClient: any
  let mockCache: any
  let result: Result

  // The full read is the one without a projection; the other one asks for the ids only.
  const fullReads = (): any[][] => mockClient.findAll.mock.calls.filter((call: any[]) => call[2] === undefined)

  beforeEach(() => {
    mockClient = {
      ctx: { warn: jest.fn() },
      findOne: jest.fn().mockResolvedValue({ _id: 'ctx-chat' }),
      findAll: jest.fn(async (_class: string, query: any, options?: any) =>
        options?.projection !== undefined ? [{ _id: 'ctx-chat', objectId: 'doc-chat' }] : [chat, issue]
      ),
      bulkUpdate: jest.fn().mockResolvedValue(undefined),
      bulkRemove: jest.fn().mockResolvedValue(undefined),
      pendingPush: { cancelByAccount: jest.fn().mockReturnValue([]) },
      txFactory: { createTxUpdateDoc: jest.fn(), createTxRemoveDoc: jest.fn() }
    }
    mockCache = {
      getAccountBySocialId: jest.fn().mockResolvedValue('user-1'),
      getPushSubscriptions: jest.fn().mockResolvedValue([{ _id: 'sub-web', endpoint: 'https://push.example.com/x' }]),
      dropInbox: jest.fn()
    }
    result = emptyResult()
  })

  it('read all clears every unread context of the account with one statement and no tx', async () => {
    const changed = await handleReadAllNotificationAction(mockClient as Client, mockCache as Cache, result, tx)

    const unread = { user: 'user-1', unreadCount: { $gt: 0 } }
    expect(mockClient.bulkUpdate).toHaveBeenCalledWith(notification.class.DocNotifyContext, unread, {
      unreadMessages: [],
      unreadReactions: [],
      unreadMentions: [],
      unreadCommons: [],
      unreadCount: 0,
      unreadMessagesCount: 0,
      notifiedMessagesCount: 0
    })
    expect(result.updateContextTx).toEqual([])
    expect(result.updateReadStateTx).toEqual([])
    expect(changed).toBe('user-1')
  })

  it('never reads the contexts whole: only the ids of those whose position has to move', async () => {
    mockCache.getPushSubscriptions.mockResolvedValue([{ _id: 'sub-apns', endpoint: 'apns://token' }])

    await handleReadAllNotificationAction(mockClient as Client, mockCache as Cache, result, tx)

    expect(fullReads()).toEqual([])
    expect(mockClient.findAll).toHaveBeenCalledTimes(1)
    expect(mockClient.findAll).toHaveBeenCalledWith(
      notification.class.DocNotifyContext,
      { user: 'user-1', unreadCount: { $gt: 0 }, unreadMessagesCount: { $gt: 0 } },
      { projection: { _id: 1, objectId: 1 } }
    )
  })

  it('drops everything held for the account, pushes and letters, without the contexts', async () => {
    await handleReadAllNotificationAction(mockClient as Client, mockCache as Cache, result, tx)

    expect(mockClient.pendingPush.cancelByAccount).toHaveBeenCalledWith('user-1')
    expect(result.timeMachine).toEqual([{ type: 'cancel', id: 'letter:user-1:%' }])
  })

  it('moves the read position to the action time, only where messages were unread', async () => {
    await handleReadAllNotificationAction(mockClient as Client, mockCache as Cache, result, tx)

    expect(mockClient.bulkUpdate).toHaveBeenCalledTimes(2)
    expect(mockClient.bulkUpdate).toHaveBeenNthCalledWith(
      1,
      notification.class.ReadState,
      { attachedTo: { $in: ['doc-chat'] } },
      { 'user-1': { messageId: expect.any(String), timestamp: 1000 } }
    )
  })

  it('a failed statement leaves the contexts unread and the pushes waiting, for the redelivered action', async () => {
    mockCache.getPushSubscriptions.mockResolvedValue([{ _id: 'sub-apns', endpoint: 'apns://token' }])
    // The positions moved, the contexts did not: the retry finds them unread and does it all again.
    mockClient.bulkUpdate.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('db is down'))

    await expect(handleReadAllNotificationAction(mockClient as Client, mockCache as Cache, result, tx)).rejects.toThrow(
      'db is down'
    )

    expect(mockClient.bulkUpdate).toHaveBeenLastCalledWith(
      notification.class.DocNotifyContext,
      expect.anything(),
      expect.anything()
    )
    expect(mockCache.dropInbox).toHaveBeenCalledTimes(1)
    expect(mockClient.pendingPush.cancelByAccount).not.toHaveBeenCalled()
    expect(result).toEqual(emptyResult())
  })

  it('clear all moves the positions before it removes the contexts, and drops the cache if the removal fails', async () => {
    const order: string[] = []
    mockClient.bulkUpdate.mockImplementation(async () => {
      order.push('positions')
    })
    mockClient.bulkRemove.mockImplementation(async () => {
      order.push('remove')
      throw new Error('db is down')
    })

    await expect(
      handleClearAllNotificationAction(mockClient as Client, mockCache as Cache, result, tx)
    ).rejects.toThrow('db is down')

    expect(order).toEqual(['positions', 'remove'])
    expect(mockCache.dropInbox).toHaveBeenCalledTimes(1)
    expect(mockClient.pendingPush.cancelByAccount).not.toHaveBeenCalled()
  })

  it('drops what the cache holds of the account after the database changed', async () => {
    const order: string[] = []
    mockClient.bulkUpdate.mockImplementation(async () => {
      order.push('db')
    })
    mockCache.dropInbox.mockImplementation(() => {
      order.push('cache')
    })

    await handleReadAllNotificationAction(mockClient as Client, mockCache as Cache, result, tx)

    expect(order).toEqual(['db', 'db', 'cache'])
  })

  it('takes down what is on the phones with one dismiss-all, up to the action time', async () => {
    mockCache.getPushSubscriptions.mockResolvedValue([{ _id: 'sub-apns', endpoint: 'apns://token' }])

    await handleReadAllNotificationAction(mockClient as Client, mockCache as Cache, result, tx)

    expect(result.queueMessages).toEqual([
      {
        kind: 'dismiss-all',
        id: 'dismiss-all:user-1:1000',
        account: 'user-1',
        pushSubscriptions: [{ _id: 'sub-apns', endpoint: 'apns://token' }],
        readUpTo: 1000
      }
    ])
  })

  it('clear all takes the pushes down the same way', async () => {
    mockCache.getPushSubscriptions.mockResolvedValue([{ _id: 'sub-apns', endpoint: 'apns://token' }])

    await handleClearAllNotificationAction(mockClient as Client, mockCache as Cache, result, tx)

    expect(fullReads()).toEqual([])
    expect(result.queueMessages).toEqual([expect.objectContaining({ kind: 'dismiss-all', readUpTo: 1000 })])
  })

  it('a dismiss that could not be prepared is ignored: the inbox is read all the same', async () => {
    mockCache.getPushSubscriptions.mockRejectedValue(new Error('db is down'))

    const changed = await handleReadAllNotificationAction(mockClient as Client, mockCache as Cache, result, tx)

    expect(changed).toBe('user-1')
    expect(result.queueMessages).toEqual([])
    expect(result.timeMachine).toEqual([{ type: 'cancel', id: 'letter:user-1:%' }])
    expect(mockClient.ctx.warn).toHaveBeenCalledTimes(1)
  })

  it('sends no dismiss to an account without a native app', async () => {
    await handleReadAllNotificationAction(mockClient as Client, mockCache as Cache, result, tx)

    expect(result.queueMessages).toEqual([])
  })

  it('does nothing when nothing is unread, and still names the account: its client waits for the answer', async () => {
    mockClient.findOne.mockResolvedValue(undefined)

    const account = await handleReadAllNotificationAction(mockClient as Client, mockCache as Cache, result, tx)

    expect(account).toBe('user-1')
    expect(mockClient.findOne).toHaveBeenCalledWith(
      notification.class.DocNotifyContext,
      { user: 'user-1', unreadCount: { $gt: 0 } },
      { projection: { _id: 1 } }
    )
    expect(mockClient.findAll).not.toHaveBeenCalled()
    expect(mockClient.bulkUpdate).not.toHaveBeenCalled()
    expect(mockCache.dropInbox).not.toHaveBeenCalled()
    expect(result).toEqual(emptyResult())
  })

  it('clear all removes every context of the account with one statement and moves the positions', async () => {
    const changed = await handleClearAllNotificationAction(mockClient as Client, mockCache as Cache, result, tx)

    expect(mockClient.bulkRemove).toHaveBeenCalledTimes(1)
    expect(mockClient.bulkRemove).toHaveBeenCalledWith(notification.class.DocNotifyContext, { user: 'user-1' })
    // The ids are asked for while the contexts still exist.
    expect(mockClient.findAll.mock.invocationCallOrder[0]).toBeLessThan(
      mockClient.bulkRemove.mock.invocationCallOrder[0]
    )
    expect(mockClient.findAll).toHaveBeenCalledWith(
      notification.class.DocNotifyContext,
      { user: 'user-1', unreadMessagesCount: { $gt: 0 } },
      { projection: { _id: 1, objectId: 1 } }
    )
    expect(mockClient.bulkUpdate).toHaveBeenCalledTimes(1)
    expect(mockClient.bulkUpdate).toHaveBeenCalledWith(
      notification.class.ReadState,
      { attachedTo: { $in: ['doc-chat'] } },
      expect.anything()
    )
    expect(changed).toBe('user-1')
  })

  it('ignores an action sent for a foreign account', async () => {
    mockCache.getAccountBySocialId.mockResolvedValue('user-2')

    const read = await handleReadAllNotificationAction(mockClient as Client, mockCache as Cache, result, tx)
    const cleared = await handleClearAllNotificationAction(mockClient as Client, mockCache as Cache, result, tx)

    expect([read, cleared]).toEqual([undefined, undefined])
    expect(mockClient.findOne).not.toHaveBeenCalled()
    expect(mockClient.pendingPush.cancelByAccount).not.toHaveBeenCalled()
    expect(mockClient.bulkUpdate).not.toHaveBeenCalled()
    expect(mockClient.bulkRemove).not.toHaveBeenCalled()
    expect(result).toEqual(emptyResult())
    expect(mockClient.ctx.warn).toHaveBeenCalledTimes(2)
  })
})

describe('handleCreateNotificationAction', () => {
  let mockClient: {
    ctx: { warn: jest.Mock }
    findOne: jest.Mock
    branding: undefined
  }
  let mockCache: {
    getDoc: jest.Mock
    getReceivers: jest.Mock
    getSettings: jest.Mock
    getContext: jest.Mock
    getPushSubscriptions: jest.Mock
    getSender: jest.Mock
  }
  let result: Result

  const makeTx = (): TxCUD<CreateNotificationAction> =>
    ({
      _id: 'tx-1',
      _class: core.class.TxCreateDoc,
      objectId: 'action-1',
      modifiedBy: 'social-1',
      modifiedOn: 100,
      attributes: {
        attachedTo: 'doc-1',
        attachedToClass: 'love:class:MeetingMinutes',
        account: 'guest-account' as AccountUuid,
        notification: {}
      }
    }) as unknown as TxCUD<CreateNotificationAction>

  const makeReceiver = (account: string, role: 'USER' | 'GUEST'): unknown => ({
    account,
    role,
    employeeRef: 'emp-1',
    space: 'space-1',
    socialIds: ['social-9'],
    online: false,
    away: false,
    language: 'en'
  })

  beforeEach(() => {
    mockClient = { ctx: { warn: jest.fn() }, findOne: jest.fn(), branding: undefined }
    mockCache = {
      getDoc: jest.fn().mockResolvedValue({ _id: 'doc-1', _class: 'love:class:MeetingMinutes', space: 'space-1' }),
      getReceivers: jest.fn(),
      getSettings: jest.fn().mockResolvedValue({}),
      getContext: jest.fn().mockResolvedValue(undefined),
      getPushSubscriptions: jest.fn().mockResolvedValue([]),
      getSender: jest.fn().mockResolvedValue({ socialId: 'social-1' })
    }
    result = emptyResult()
    jest.clearAllMocks()
    ;(getBaseDisplayParams as jest.Mock).mockResolvedValue({ intlParams: {}, intlParamsNotLocalized: {} })
    ;(getObjectDisplayData as jest.Mock).mockResolvedValue({})
    ;(getEmptyTxCache as jest.Mock).mockReturnValue({})
    ;(pushNotification as jest.Mock).mockResolvedValue(undefined)
  })

  it('marks the notification unread for a regular user', async () => {
    mockCache.getReceivers.mockResolvedValue([makeReceiver('user-1', 'USER')])

    await handleCreateNotificationAction(
      mockClient as unknown as Client,
      mockCache as unknown as Cache,
      {} as unknown as TxCache,
      result,
      makeTx()
    )

    expect(pushNotification).toHaveBeenCalledTimes(1)
    expect((pushNotification as jest.Mock).mock.calls[0][4].unreadCommon).toBeDefined()
  })

  it('hands the receiver settings on, so the letter waits the window the person chose', async () => {
    mockCache.getReceivers.mockResolvedValue([makeReceiver('user-1', 'USER')])
    const settings = { settingsByProvider: new Map(), typesByProvider: new Map() }
    mockCache.getSettings.mockResolvedValue(settings)

    await handleCreateNotificationAction(
      mockClient as unknown as Client,
      mockCache as unknown as Cache,
      {} as unknown as TxCache,
      result,
      makeTx()
    )

    expect((pushNotification as jest.Mock).mock.calls[0][4].settings).toBe(settings)
  })

  it('still delivers to the shared read-only guest account, but not as unread', async () => {
    mockCache.getReceivers.mockResolvedValue([makeReceiver(readOnlyGuestAccountUuid, 'GUEST')])

    await handleCreateNotificationAction(
      mockClient as unknown as Client,
      mockCache as unknown as Cache,
      {} as unknown as TxCache,
      result,
      makeTx()
    )

    expect(pushNotification).toHaveBeenCalledTimes(1)
    const data = (pushNotification as jest.Mock).mock.calls[0][4]
    expect(data.unreadCommon).toBeUndefined()
    // Delivery itself must be untouched — only the unread counter is suppressed.
    expect(data.notification).toBeDefined()
  })

  it('keeps a named guest account unread — only the shared guest account is suppressed', async () => {
    mockCache.getReceivers.mockResolvedValue([makeReceiver('named-guest', 'GUEST')])

    await handleCreateNotificationAction(
      mockClient as unknown as Client,
      mockCache as unknown as Cache,
      {} as unknown as TxCache,
      result,
      makeTx()
    )

    expect((pushNotification as jest.Mock).mock.calls[0][4].unreadCommon).toBeDefined()
  })

  it('hands the call of an invite on to the push', async () => {
    mockCache.getReceivers.mockResolvedValue([makeReceiver('user-1', 'USER')])
    const call = { inviteId: 'invite-1', callerName: 'Ann', callerPerson: 'person-ann', expiresAt: 145_000 }
    const tx = makeTx() as TxCreateDoc<CreateNotificationAction>
    tx.attributes.call = call as any

    await handleCreateNotificationAction(
      mockClient as unknown as Client,
      mockCache as unknown as Cache,
      {} as unknown as TxCache,
      result,
      tx
    )

    expect((pushNotification as jest.Mock).mock.calls[0][4].call).toEqual(call)
  })
})
