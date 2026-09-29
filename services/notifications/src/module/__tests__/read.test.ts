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

import core, { AccountUuid, Ref, TxCUD, TxUpdateDoc, Space } from '@hcengineering/core'
import { DocNotifyContext, ReadState } from '@hcengineering/notification'

import { Client, Result } from '../../types'
import Cache from '../../cache'
import { handleReadState } from '../read'
import { emptyResult } from '../../utils/result'

describe('handleReadState', () => {
  let mockClient: {
    ctx: {
      warn: jest.Mock
      error: jest.Mock
    }
    txFactory: {
      createTxUpdateDoc: jest.Mock
    }
    pendingPush: { cancelByObject: jest.Mock, cancel: jest.Mock }
  }
  let mockCache: {
    getReadState: jest.Mock
    getContexts: jest.Mock
    getPushSubscriptions: jest.Mock
  }
  let result: Result

  beforeEach(() => {
    mockClient = {
      pendingPush: { cancelByObject: jest.fn(), cancel: jest.fn() },
      ctx: {
        warn: jest.fn(),
        error: jest.fn()
      },
      txFactory: {
        createTxUpdateDoc: jest.fn().mockImplementation((cls: string, space: string, id: string, payload: unknown) => ({
          _class: core.class.TxUpdateDoc,
          objectId: id,
          operations: payload
        }))
      }
    }

    mockCache = {
      getReadState: jest.fn(),
      getContexts: jest.fn(),
      getPushSubscriptions: jest.fn().mockResolvedValue([])
    }

    result = emptyResult()
    jest.clearAllMocks()
  })

  it('does nothing if transaction class is not TxUpdateDoc', async () => {
    const tx = {
      _class: 'TxCreateDoc'
    } as unknown as TxCUD<ReadState>

    await handleReadState(mockClient as unknown as Client, mockCache as unknown as Cache, result, tx)

    expect(mockCache.getReadState).not.toHaveBeenCalled()
  })

  it('does nothing if update operations only contain skip keys', async () => {
    const tx = {
      _class: core.class.TxUpdateDoc,
      objectId: 'rs-1',
      operations: {
        modifiedOn: 12345,
        modifiedBy: 'user-1'
      }
    } as unknown as TxUpdateDoc<ReadState>

    await handleReadState(mockClient as unknown as Client, mockCache as unknown as Cache, result, tx)

    expect(mockCache.getReadState).not.toHaveBeenCalled()
  })

  it('does nothing if ReadState document is not found', async () => {
    const tx = {
      _class: core.class.TxUpdateDoc,
      objectId: 'rs-1',
      operations: {
        'user-1': { timestamp: 100 }
      }
    } as unknown as TxUpdateDoc<ReadState>

    mockCache.getReadState.mockResolvedValue(null)

    await handleReadState(mockClient as unknown as Client, mockCache as unknown as Cache, result, tx)

    expect(mockCache.getReadState).toHaveBeenCalledWith('rs-1')
    expect(mockClient.ctx.warn).toHaveBeenCalledWith('ReadState not found for read state update', {
      readStateId: 'rs-1'
    })
    expect(mockCache.getContexts).not.toHaveBeenCalled()
  })

  it('does nothing if no context exists for the account', async () => {
    const tx = {
      _class: core.class.TxUpdateDoc,
      objectId: 'rs-1',
      operations: {
        'user-1': { timestamp: 100 }
      }
    } as unknown as TxUpdateDoc<ReadState>

    const readState = {
      _id: 'rs-1',
      attachedTo: 'doc-1'
    } as unknown as ReadState

    mockCache.getReadState.mockResolvedValue(readState)
    mockCache.getContexts.mockResolvedValue([])

    await handleReadState(mockClient as unknown as Client, mockCache as unknown as Cache, result, tx)

    expect(mockCache.getContexts).toHaveBeenCalledWith('doc-1')
    expect(result.updateContextTx).toHaveLength(0)
  })

  it('does nothing if read position timestamp is 0 or missing', async () => {
    const tx = {
      _class: core.class.TxUpdateDoc,
      objectId: 'rs-1',
      operations: {
        'user-1': { timestamp: 0 },
        'user-2': undefined
      }
    } as unknown as TxUpdateDoc<ReadState>

    const readState = {
      _id: 'rs-1',
      attachedTo: 'doc-1'
    } as unknown as ReadState

    mockCache.getReadState.mockResolvedValue(readState)
    mockCache.getContexts.mockResolvedValue([])

    await handleReadState(mockClient as unknown as Client, mockCache as unknown as Cache, result, tx)

    expect(mockCache.getContexts).toHaveBeenCalledWith('doc-1')
    expect(result.updateContextTx).toHaveLength(0)
  })

  it('handles message and mention reads and updates context', async () => {
    const tx = {
      _class: core.class.TxUpdateDoc,
      objectId: 'rs-1',
      operations: {
        'user-1': { timestamp: 150 }
      }
    } as unknown as TxUpdateDoc<ReadState>

    const readState = {
      _id: 'rs-1',
      attachedTo: 'doc-1'
    } as unknown as ReadState

    const context = {
      _id: 'ctx-1',
      _class: 'DocNotifyContext',
      space: 'space-1' as Ref<Space>,
      user: 'user-1' as AccountUuid,
      unreadMessages: [
        { id: 'msg-1', createdOn: 100, notified: true, mentioned: true },
        { id: 'msg-2', createdOn: 150, notified: false },
        { id: 'msg-3', createdOn: 200, notified: true }
      ],
      unreadMentions: [],
      unreadCount: 2
    } as unknown as DocNotifyContext

    mockCache.getReadState.mockResolvedValue(readState)
    mockCache.getContexts.mockResolvedValue([context])

    await handleReadState(mockClient as unknown as Client, mockCache as unknown as Cache, result, tx)

    expect(result.updateContextTx).toHaveLength(1)
    expect(result.updateContextTx[0]).toEqual({
      _class: core.class.TxUpdateDoc,
      objectId: 'ctx-1',
      operations: {
        $pull: {
          unreadMessages: { id: { $in: ['msg-1', 'msg-2'] } }
        },
        $inc: { unreadCount: -1 }
      }
    })
  })

  it('handles chunk reads and updates context', async () => {
    const tx = {
      _class: core.class.TxUpdateDoc,
      objectId: 'rs-1',
      operations: {
        'user-1': { timestamp: 150 }
      }
    } as unknown as TxUpdateDoc<ReadState>

    const readState = {
      _id: 'rs-1',
      attachedTo: 'doc-1'
    } as unknown as ReadState

    const context = {
      _id: 'ctx-1',
      _class: 'DocNotifyContext',
      space: 'space-1' as Ref<Space>,
      user: 'user-1' as AccountUuid,
      unreadMessages: [
        { from: 50, to: 100, count: 2, notifiedCount: 2 },
        { from: 101, to: 150, count: 1, notifiedCount: 1 },
        { from: 151, to: 200, count: 3, notifiedCount: 3 }
      ],
      unreadCount: 5
    } as unknown as DocNotifyContext

    mockCache.getReadState.mockResolvedValue(readState)
    mockCache.getContexts.mockResolvedValue([context])

    await handleReadState(mockClient as unknown as Client, mockCache as unknown as Cache, result, tx)

    expect(result.updateContextTx).toHaveLength(1)
    expect(result.updateContextTx[0]).toEqual({
      _class: core.class.TxUpdateDoc,
      objectId: 'ctx-1',
      operations: {
        $pull: {
          unreadMessages: { to: { $in: [100, 150] } }
        },
        $inc: { unreadCount: -3 }
      }
    })
  })

  it('does not include $inc for unreadCount if decrease is 0', async () => {
    const tx = {
      _class: core.class.TxUpdateDoc,
      objectId: 'rs-1',
      operations: {
        'user-1': { timestamp: 150 }
      }
    } as unknown as TxUpdateDoc<ReadState>

    const readState = {
      _id: 'rs-1',
      attachedTo: 'doc-1'
    } as unknown as ReadState

    const context = {
      _id: 'ctx-1',
      _class: 'DocNotifyContext',
      space: 'space-1' as Ref<Space>,
      user: 'user-1' as AccountUuid,
      unreadMessages: [{ id: 'msg-1', createdOn: 100, notified: false }],
      unreadCount: 5
    } as unknown as DocNotifyContext

    mockCache.getReadState.mockResolvedValue(readState)
    mockCache.getContexts.mockResolvedValue([context])

    await handleReadState(mockClient as unknown as Client, mockCache as unknown as Cache, result, tx)

    expect(result.updateContextTx).toHaveLength(1)
    expect(result.updateContextTx[0].operations).toEqual({
      $pull: {
        unreadMessages: { id: { $in: ['msg-1'] } }
      }
    })
  })

  it('handles read state updates for multiple accounts concurrently', async () => {
    const tx = {
      _class: core.class.TxUpdateDoc,
      objectId: 'rs-1',
      operations: {
        'user-1': { timestamp: 100 },
        'user-2': { timestamp: 200 }
      }
    } as unknown as TxUpdateDoc<ReadState>

    const readState = {
      _id: 'rs-1',
      attachedTo: 'doc-1'
    } as unknown as ReadState

    const context1 = {
      _id: 'ctx-1',
      _class: 'DocNotifyContext',
      space: 'space-1' as Ref<Space>,
      user: 'user-1' as AccountUuid,
      unreadMessages: [{ id: 'msg-1', createdOn: 100, notified: true }]
    } as unknown as DocNotifyContext

    const context2 = {
      _id: 'ctx-2',
      _class: 'DocNotifyContext',
      space: 'space-1' as Ref<Space>,
      user: 'user-2' as AccountUuid,
      unreadMessages: [{ id: 'msg-2', createdOn: 200, notified: true }]
    } as unknown as DocNotifyContext

    mockCache.getReadState.mockResolvedValue(readState)
    mockCache.getContexts.mockResolvedValue([context1, context2])

    await handleReadState(mockClient as unknown as Client, mockCache as unknown as Cache, result, tx)

    expect(result.updateContextTx).toHaveLength(2)
  })

  describe('dismiss for the native apps', () => {
    const tx = {
      _class: core.class.TxUpdateDoc,
      objectId: 'rs-1',
      operations: {
        'user-1': { timestamp: 150 }
      }
    } as unknown as TxUpdateDoc<ReadState>
    const readState = { _id: 'rs-1', attachedTo: 'doc-1' } as unknown as ReadState
    const context = {
      _id: 'ctx-1',
      _class: 'DocNotifyContext',
      space: 'space-1',
      user: 'user-1',
      objectId: 'doc-1',
      objectClass: 'DocClass',
      objectSpace: 'space-doc',
      unreadMessages: [
        { id: 'msg-1', createdOn: 100, notified: true },
        { id: 'msg-2', createdOn: 120 },
        { from: 10, to: 90, count: 3, notifiedCount: 2 },
        { id: 'msg-3', createdOn: 200, notified: true }
      ],
      // A mention in msg-1 has a card and a push of its own: read with the message, dismissed by its id.
      latestNotifications: [{ id: 'mention-1', type: 'mention', messageId: 'msg-1', createdOn: 100 }],
      unreadCount: 3
    } as unknown as DocNotifyContext
    const native = { _id: 'sub-apns', endpoint: 'apns://token', user: 'user-1' }
    const web = { _id: 'sub-web', endpoint: 'https://push.example.com/x', user: 'user-1' }

    it('queues one dismiss with the read tags, the read position and only the native subscriptions', async () => {
      mockCache.getReadState.mockResolvedValue(readState)
      mockCache.getContexts.mockResolvedValue([context])
      mockCache.getPushSubscriptions.mockResolvedValue([web, native])

      await handleReadState(mockClient as unknown as Client, mockCache as unknown as Cache, result, tx)

      expect(mockClient.pendingPush.cancelByObject).toHaveBeenCalledWith('user-1', 'doc-1', 120)
      // The letters of the messages read (notified or not) are dropped; a chunk names no id.
      expect(result.timeMachine).toEqual([
        { type: 'cancel', id: 'letter:user-1:msg-1:%' },
        { type: 'cancel', id: 'letter:user-1:msg-2:%' },
        { type: 'cancel', id: 'letter:user-1:mention-1:%' }
      ])
      expect(mockClient.pendingPush.cancel).toHaveBeenCalledWith('user-1', 'mention-1')
      expect(mockCache.getPushSubscriptions).toHaveBeenCalledWith('user-1')
      expect(result.queueMessages).toHaveLength(1)
      expect(result.queueMessages[0]).toEqual({
        kind: 'dismiss',
        id: 'dismiss:ctx-1:120',
        account: 'user-1',
        objectId: 'doc-1',
        objectClass: 'DocClass',
        objectSpace: 'space-doc',
        pushSubscriptions: [native],
        tags: ['msg-1', 'mention-1'],
        readUpTo: 120
      })
    })

    it('queues nothing when the account has only web subscriptions', async () => {
      mockCache.getReadState.mockResolvedValue(readState)
      mockCache.getContexts.mockResolvedValue([context])
      mockCache.getPushSubscriptions.mockResolvedValue([web])

      await handleReadState(mockClient as unknown as Client, mockCache as unknown as Cache, result, tx)

      expect(result.queueMessages).toHaveLength(0)
    })

    it('queues nothing when the read clears no notified message', async () => {
      mockCache.getReadState.mockResolvedValue(readState)
      mockCache.getContexts.mockResolvedValue([
        { ...context, unreadMessages: [{ id: 'msg-2', createdOn: 120 }] } as unknown as DocNotifyContext
      ])
      mockCache.getPushSubscriptions.mockResolvedValue([native])

      await handleReadState(mockClient as unknown as Client, mockCache as unknown as Cache, result, tx)

      expect(mockCache.getPushSubscriptions).not.toHaveBeenCalled()
      expect(result.queueMessages).toHaveLength(0)
    })
  })
})
