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
import { CreateNotificationAction, DocNotifyContext, ReadNotificationAction } from '@hcengineering/notification'
import activity from '@hcengineering/activity'

import { Client, Result, TxCache } from '../../types'
import Cache from '../../cache'
import { handleCreateNotificationAction, handleReadNotificationAction } from '../action'
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
})
