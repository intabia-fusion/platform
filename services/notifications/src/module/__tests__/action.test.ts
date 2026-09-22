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

import core, { AccountUuid, readOnlyGuestAccountUuid, Ref, TxCUD, Space } from '@hcengineering/core'
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
  }
  let mockCache: {
    getContext: jest.Mock
    getAccountBySocialId: jest.Mock
  }
  let result: Result

  beforeEach(() => {
    mockClient = {
      ctx: { warn: jest.fn() },
      findAll: jest.fn(),
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
      getAccountBySocialId: jest.fn()
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
