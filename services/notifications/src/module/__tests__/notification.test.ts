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

import { AccountUuid, Doc, Ref, Space, Class } from '@hcengineering/core'
import notificationPlugin, {
  DocNotifyContext,
  type QueueNotifyMessage,
  UnreadMessage
} from '@hcengineering/notification'
import { ActivityMessage } from '@hcengineering/activity'

import { Result, TxCache } from '../../types'
import { pushNotification } from '../notification'
import { emptyResult, getEmptyTxCache } from '../../utils/result'

jest.mock('../../config', () => ({
  __esModule: true,
  default: {
    LatestNotificationsSliceSize: 5,
    HoldLetters: true
  },
  LatestNotificationsSliceSize: 5
}))

const mockTranslateNotification = jest.fn()
const mockGetNotificationMessageId = jest.fn()

let actualNotification: any
const getActualNotification = (): any => {
  actualNotification ??= jest.requireActual('@hcengineering/notification')
  return actualNotification
}

jest.mock('@hcengineering/notification', () => {
  return new Proxy(
    {},
    {
      get: (target, prop) => {
        if (prop === 'translateNotification') {
          return mockTranslateNotification
        }
        if (prop === 'getNotificationMessageId') {
          return mockGetNotificationMessageId
        }
        if (prop === '__esModule') {
          return true
        }
        return getActualNotification()[prop as keyof typeof import('@hcengineering/notification')]
      }
    }
  ) as unknown as typeof import('@hcengineering/notification')
})

const mockTranslate = jest.fn()

let actualPlatform: any
const getActualPlatform = (): any => {
  actualPlatform ??= jest.requireActual('@hcengineering/platform')
  return actualPlatform
}

jest.mock('@hcengineering/platform', () => {
  return new Proxy(
    {},
    {
      get: (target, prop) => {
        if (prop === 'translate') {
          return mockTranslate
        }
        if (prop === '__esModule') {
          return true
        }
        return getActualPlatform()[prop as keyof typeof import('@hcengineering/platform')]
      }
    }
  ) as unknown as typeof import('@hcengineering/platform')
})

const mockGenerateId = jest.fn()

let actualCore: any
const getActualCore = (): any => {
  actualCore ??= jest.requireActual('@hcengineering/core')
  return actualCore
}

jest.mock('@hcengineering/core', () => {
  return new Proxy(
    {},
    {
      get: (target, prop) => {
        if (prop === 'generateId') {
          return mockGenerateId
        }
        if (prop === '__esModule') {
          return true
        }
        return getActualCore()[prop as keyof typeof import('@hcengineering/core')]
      }
    }
  ) as unknown as typeof import('@hcengineering/core')
})

const mockGetCreateContextTx = jest.fn()
const mockGetNotificationUrl = jest.fn()
const mockGetDomain = jest.fn()
const mockGetNotificationLocation = jest.fn()

jest.mock('../../utils/utils', () => {
  return {
    getCreateContextTx: (...args: any[]) => mockGetCreateContextTx(...args),
    getNotificationUrl: (...args: any[]) => mockGetNotificationUrl(...args),
    getDomain: (...args: any[]) => mockGetDomain(...args),
    getNotificationLocation: (...args: any[]) => mockGetNotificationLocation(...args)
  }
})

describe('pushNotification', () => {
  let mockClient: any
  let txCache: TxCache
  let result: Result
  let mockData: any

  beforeEach(() => {
    mockClient = {
      ctx: {
        error: jest.fn(),
        warn: jest.fn()
      },
      txFactory: {
        createTxUpdateDoc: jest.fn().mockImplementation((cls, space, id, payload) => ({
          _class: 'TxUpdateDoc',
          objectId: id,
          space,
          operations: payload
        })),
        createTxCreateDoc: jest.fn().mockImplementation((cls, space, payload) => ({
          _class: 'TxCreateDoc',
          space,
          attributes: payload
        }))
      },
      model: { findAllSync: jest.fn().mockReturnValue([]) },
      branding: {
        title: 'Platform Brand'
      }
    }

    txCache = getEmptyTxCache()
    result = emptyResult()

    mockData = {
      objectId: 'doc-1' as Ref<Doc>,
      objectClass: 'DocClass' as Ref<Class<Doc>>,
      objectSpace: 'space-1' as Ref<Space>,
      objectDisplayData: {
        objectTitle: 'Doc Title',
        objectIcon: 'doc-icon',
        objectLabel: 'doc-label',
        objectIdentifier: 'doc-id'
      },
      notifyProviders: {},
      notification: {
        id: 'notify-1',
        createdOn: 100,
        createdBy: 'user-2'
      },
      intl: {
        intlParams: {
          senderName: 'Sender',
          title: 'Doc Title',
          url: 'doc-url'
        }
      },
      receiver: {
        language: 'en',
        account: 'user-1' as AccountUuid,
        space: 'user-space' as Ref<Space>
      },
      pushSubscriptions: []
    }

    mockTranslateNotification.mockReset()
    mockGetNotificationMessageId.mockReset()
    mockTranslate.mockReset()
    mockGenerateId.mockReset()
    mockGetCreateContextTx.mockReset()
    mockGetNotificationUrl.mockReset()
    mockGetDomain.mockReset()
    mockGetNotificationLocation.mockReset()

    // Default mock behaviors
    mockTranslateNotification.mockResolvedValue({ title: 'Translated Title', body: 'Translated Body' })
    mockGetNotificationMessageId.mockReturnValue('msg-id-1')
    mockTranslate.mockImplementation((template) => Promise.resolve(`translated:${template}`))
    mockGenerateId.mockReturnValue('generated-ctx-id')
    mockGetNotificationUrl.mockReturnValue('http://localhost/notify/url')
    mockGetDomain.mockReturnValue('localhost')
    mockGetNotificationLocation.mockReturnValue({ path: '/notify', query: 'q=1' })
    mockGetCreateContextTx.mockImplementation(() => ({
      attributes: {
        latestNotifications: []
      }
    }))
  })

  it('translates notification and pushes it to result.queueMessages', async () => {
    mockData.notifyProviders = {
      'test-provider': [{ _id: 'type-1' }]
    }

    await pushNotification(mockClient, txCache, result, undefined, mockData)

    expect(mockTranslateNotification).toHaveBeenCalledWith(mockData.intl, 'en')
    expect(mockGetDomain).toHaveBeenCalledWith(mockClient)
    expect(mockGetNotificationUrl).toHaveBeenCalledWith(
      mockClient,
      'generated-ctx-id',
      mockData.notification,
      'doc-1',
      'DocClass'
    )

    expect(result.queueMessages).toHaveLength(1)
    expect(result.queueMessages[0]).toEqual({
      id: 'notify-1',
      title: 'Translated Title',
      body: 'Translated Body',
      url: 'http://localhost/notify/url',
      domain: 'localhost',
      pushSubscriptions: [],
      language: 'en',
      account: 'user-1',
      providers: {
        'test-provider': ['type-1']
      },
      objectId: 'doc-1',
      objectClass: 'DocClass',
      objectSpace: 'space-1',
      createdOn: 100,
      template: undefined
    })
  })

  describe('context creation path (context is undefined)', () => {
    let mockCreateTx: any

    beforeEach(() => {
      mockCreateTx = {
        attributes: {
          latestNotifications: []
        }
      }
      mockGetCreateContextTx.mockReturnValue(mockCreateTx)
    })

    it('handles context creation when context is undefined', async () => {
      mockData.unreadMessage = { id: 'msg-1', createdOn: 100, notified: true }
      await pushNotification(mockClient, txCache, result, undefined, mockData)

      expect(mockGetCreateContextTx).toHaveBeenCalledWith(
        'generated-ctx-id',
        'doc-1',
        'DocClass',
        'space-1',
        mockData.receiver,
        result,
        mockClient.txFactory,
        mockData.objectDisplayData
      )

      expect(mockCreateTx.attributes).toEqual({
        latestNotifications: [mockData.notification],
        lastNotify: 100,
        unreadCount: 1,
        unreadMessages: [mockData.unreadMessage]
      })
    })

    it('appends unreadMessage to context attributes during creation', async () => {
      mockData.unreadMessage = { id: 'msg-1', createdOn: 1, notified: true }

      await pushNotification(mockClient, txCache, result, undefined, mockData)

      expect(mockCreateTx.attributes).toEqual(
        expect.objectContaining({
          unreadMessages: [{ id: 'msg-1', createdOn: 1, notified: true }]
        })
      )
    })

    it('appends unreadReaction to context attributes during creation', async () => {
      mockData.unreadReaction = { id: 'react-1', attachedTo: 'attachedTo-1' }

      await pushNotification(mockClient, txCache, result, undefined, mockData)

      expect(mockCreateTx.attributes).toEqual(
        expect.objectContaining({
          unreadReactions: [{ id: 'react-1', attachedTo: 'attachedTo-1' }]
        })
      )
    })

    it('appends unreadMention to context attributes during creation', async () => {
      mockData.unreadMention = { messageId: 'msg-1' }

      await pushNotification(mockClient, txCache, result, undefined, mockData)

      expect(mockCreateTx.attributes).toEqual(
        expect.objectContaining({
          unreadMentions: [{ messageId: 'msg-1' }]
        })
      )
    })

    it('appends unreadCommon to context attributes during creation', async () => {
      mockData.unreadCommon = { id: 'common-1' }

      await pushNotification(mockClient, txCache, result, undefined, mockData)

      expect(mockCreateTx.attributes).toEqual(
        expect.objectContaining({
          unreadCommons: [{ id: 'common-1' }]
        })
      )
    })
  })

  describe('context update path (context exists)', () => {
    let context: DocNotifyContext

    beforeEach(() => {
      context = {
        _id: 'existing-ctx-id',
        _class: 'DocNotifyContextClass',
        space: 'existing-space',
        lastNotify: 50
      } as unknown as DocNotifyContext
    })

    it('handles context update when context exists', async () => {
      await pushNotification(mockClient, txCache, result, context, mockData)

      expect(mockClient.txFactory.createTxUpdateDoc).toHaveBeenCalledWith(
        'DocNotifyContextClass',
        'existing-space',
        'existing-ctx-id',
        {
          lastNotify: 100,
          $push: { latestNotifications: { $each: [mockData.notification], $position: 0, $slice: 5 } }
        }
      )
      expect(result.updateContextTx).toHaveLength(1)
    })

    it('handles context update and increments unreadCount when unreadMessage is present', async () => {
      mockData.unreadMessage = { id: 'msg-1' }
      await pushNotification(mockClient, txCache, result, context, mockData)

      expect(mockClient.txFactory.createTxUpdateDoc).toHaveBeenCalledWith(
        'DocNotifyContextClass',
        'existing-space',
        'existing-ctx-id',
        {
          lastNotify: 100,
          $push: {
            latestNotifications: { $each: [mockData.notification], $position: 0, $slice: 5 },
            unreadMessages: { id: 'msg-1' }
          },
          $inc: { unreadCount: 1 }
        }
      )
    })

    it('appends unreadMessage to context operations during update', async () => {
      mockData.unreadMessage = { id: 'msg-1' }

      await pushNotification(mockClient, txCache, result, context, mockData)

      const updateOpTx = result.updateContextTx[0]
      expect(updateOpTx.operations.$push).toEqual(
        expect.objectContaining({
          unreadMessages: { id: 'msg-1' }
        })
      )
    })

    it('appends unreadReaction to context operations during update', async () => {
      mockData.unreadReaction = { id: 'react-1' }

      await pushNotification(mockClient, txCache, result, context, mockData)

      const updateOpTx = result.updateContextTx[0]
      expect(updateOpTx.operations.$push).toEqual(
        expect.objectContaining({
          unreadReactions: { id: 'react-1' }
        })
      )
    })

    it('appends unreadMention to context operations during update', async () => {
      mockData.unreadMention = { messageId: 'msg-1' }

      await pushNotification(mockClient, txCache, result, context, mockData)

      const updateOpTx = result.updateContextTx[0]
      expect(updateOpTx.operations.$push).toEqual(
        expect.objectContaining({
          unreadMentions: { messageId: 'msg-1' }
        })
      )
    })

    it('appends unreadCommon to context operations during update', async () => {
      mockData.unreadCommon = { id: 'common-1' }

      await pushNotification(mockClient, txCache, result, context, mockData)

      const updateOpTx = result.updateContextTx[0]
      expect(updateOpTx.operations.$push).toEqual(
        expect.objectContaining({
          unreadCommons: { id: 'common-1' }
        })
      )
    })

    it('collapses unreadMessages when update causes the count to exceed 100', async () => {
      const unreadMessages: UnreadMessage[] = Array.from({ length: 100 }, (_, i) => ({
        id: `msg-${i}` as Ref<ActivityMessage>,
        createdOn: 1000 + i,
        notified: true
      }))
      context.unreadMessages = unreadMessages

      mockData.unreadMessage = { id: 'msg-100' as Ref<ActivityMessage>, createdOn: 1100, notified: true }

      await pushNotification(mockClient, txCache, result, context, mockData)

      const updateOpTx = result.updateContextTx[0]
      expect(updateOpTx.operations.unreadMessages).toBeDefined()
      expect(updateOpTx.operations.$push?.unreadMessages).toBeUndefined()
      expect(updateOpTx.operations.unreadMessages).toHaveLength(29)
    })
  })

  describe('createAppPushNotification', () => {
    it('creates AppPushNotification tx if PushNotificationProvider is enabled', async () => {
      mockData.notifyProviders = {
        [notificationPlugin.providers.PushNotificationProvider]: [{ _id: 'push-type-1' }]
      }

      await pushNotification(mockClient, txCache, result, undefined, mockData)

      expect(mockGetNotificationLocation).toHaveBeenCalledWith(
        mockClient,
        'generated-ctx-id',
        mockData.notification,
        'doc-1',
        'DocClass'
      )
      expect(mockClient.txFactory.createTxCreateDoc).toHaveBeenCalledWith(
        notificationPlugin.class.AppPushNotification,
        'user-space',
        expect.objectContaining({
          account: 'user-1',
          sender: 'user-2',
          tag: 'notify-1',
          objectId: 'doc-1',
          objectClass: 'DocClass',
          messageId: 'msg-id-1',
          onClickLocation: {
            path: '/notify',
            query: 'q=1'
          },
          soundAlert: false
        })
      )
      expect(result.createAppPushNotificationTx).toHaveLength(1)
    })

    it('sets soundAlert to true if SoundNotificationProvider is also enabled', async () => {
      mockData.notifyProviders = {
        [notificationPlugin.providers.PushNotificationProvider]: [{ _id: 'push-type-1' }],
        [notificationPlugin.providers.SoundNotificationProvider]: [{ _id: 'sound-type-1' }]
      }

      await pushNotification(mockClient, txCache, result, undefined, mockData)

      expect(result.createAppPushNotificationTx[0]).toEqual(
        expect.objectContaining({
          attributes: expect.objectContaining({
            soundAlert: true
          })
        })
      )
    })

    it('does not create AppPushNotification tx if PushNotificationProvider is disabled/absent', async () => {
      mockData.notifyProviders = {}

      await pushNotification(mockClient, txCache, result, undefined, mockData)

      expect(result.createAppPushNotificationTx).toHaveLength(0)
    })
  })

  describe('getTemplate & translateTemplate', () => {
    it('generates, translates, and caches the template if InboxNotificationProvider type has templates', async () => {
      const templates = {
        text: 'text-template-key',
        html: 'html-template-key',
        subject: 'subject-template-key'
      }

      mockData.notifyProviders = {
        [notificationPlugin.providers.InboxNotificationProvider]: [
          {
            _id: 'inbox-type-1',
            templates
          } as any
        ],
        'email-provider': [{ _id: 'inbox-type-1' } as any]
      }

      mockData.intl.intlParamsNotLocalized = {
        sender: 'SenderNotLocalized'
      }

      mockTranslate.mockImplementation((str) => {
        if (str === 'text-template-key') return Promise.resolve('translated text body')
        if (str === 'html-template-key') return Promise.resolve('translated html body')
        if (str === 'subject-template-key') return Promise.resolve('translated subject')
        return Promise.resolve(`translated:${str}`)
      })

      await pushNotification(mockClient, txCache, result, undefined, mockData)

      expect((result.queueMessages[0] as QueueNotifyMessage).template).toEqual({
        text: 'translated text body',
        html: 'translated html body',
        subject: 'translated subject'
      })

      // The template should be cached in txCache
      const cacheKey = 'inbox-type-1:en'
      expect(txCache.templates.has(cacheKey)).toBe(true)
      expect(txCache.templates.get(cacheKey)).toEqual({
        text: 'translated text body',
        html: 'translated html body',
        subject: 'translated subject'
      })

      // Calling again should hit cache and not translate
      mockTranslate.mockClear()
      const result2 = emptyResult()
      await pushNotification(mockClient, txCache, result2, undefined, mockData)
      expect(mockTranslate).not.toHaveBeenCalled()
      expect((result2.queueMessages[0] as QueueNotifyMessage).template).toEqual({
        text: 'translated text body',
        html: 'translated html body',
        subject: 'translated subject'
      })
    })

    it('handles translate errors in getTemplate and falls back/logs error', async () => {
      const templates = {
        text: 'text-template-key',
        html: 'html-template-key',
        subject: 'subject-template-key'
      }

      mockData.notifyProviders = {
        [notificationPlugin.providers.InboxNotificationProvider]: [
          {
            _id: 'inbox-type-1',
            templates
          } as any
        ],
        'email-provider': [{ _id: 'inbox-type-1' } as any]
      }

      mockTranslate.mockRejectedValue(new Error('translation error'))

      await pushNotification(mockClient, txCache, result, undefined, mockData)

      expect(mockClient.ctx.error).toHaveBeenCalledWith(
        'Failed to generate template',
        expect.objectContaining({ notificationId: 'notify-1' })
      )
      expect((result.queueMessages[0] as QueueNotifyMessage).template).toBeUndefined()
    })
  })

  describe('redelivered tx (already recorded notification)', () => {
    it('skips pushing when the notification id is already in context.latestNotifications', async () => {
      mockData.notifyProviders = {
        [notificationPlugin.providers.InboxNotificationProvider]: [{ _id: 'type-1' }]
      }

      const context: DocNotifyContext = {
        _id: 'ctx-1',
        _class: 'DocNotifyContextClass',
        space: 'space-1',
        user: 'user-1',
        lastNotify: 50,
        latestNotifications: [{ id: 'notify-1', type: 'common' }]
      } as any

      mockClient.ctx.info = jest.fn()

      await pushNotification(mockClient, txCache, result, context, mockData)

      expect(mockClient.ctx.info).toHaveBeenCalledWith(
        'notification already recorded, skipping',
        expect.objectContaining({ contextId: 'ctx-1', notificationId: 'notify-1' })
      )
      expect(result.updateContextTx).toHaveLength(0)
      expect(result.queueMessages).toHaveLength(0)
      expect(result.createAppPushNotificationTx).toHaveLength(0)
      expect(mockClient.txFactory.createTxUpdateDoc).not.toHaveBeenCalled()
    })

    it('skips pushing when the unreadMessage id is already in context.unreadMessages', async () => {
      mockData.unreadMessage = { id: 'msg-1', createdOn: 10, notified: true }

      const context: DocNotifyContext = {
        _id: 'ctx-1',
        _class: 'DocNotifyContextClass',
        space: 'space-1',
        user: 'user-1',
        lastNotify: 50,
        latestNotifications: [],
        unreadMessages: [{ id: 'msg-1', createdOn: 10 }]
      } as any

      mockClient.ctx.info = jest.fn()

      await pushNotification(mockClient, txCache, result, context, mockData)

      expect(mockClient.ctx.info).toHaveBeenCalledWith(
        'notification already recorded, skipping',
        expect.objectContaining({ contextId: 'ctx-1', notificationId: 'notify-1' })
      )
      expect(result.updateContextTx).toHaveLength(0)
      expect(result.queueMessages).toHaveLength(0)
      expect(result.createAppPushNotificationTx).toHaveLength(0)
    })

    it('never skips when the context is new (context undefined)', async () => {
      mockData.notifyProviders = {
        [notificationPlugin.providers.InboxNotificationProvider]: [{ _id: 'type-1' }],
        'test-provider': [{ _id: 'type-1' }]
      }
      mockClient.ctx.info = jest.fn()

      await pushNotification(mockClient, txCache, result, undefined, mockData)

      expect(mockClient.ctx.info).not.toHaveBeenCalled()
      expect(result.queueMessages).toHaveLength(1)
      expect(mockGetCreateContextTx).toHaveBeenCalled()
    })
  })

  describe('alreadyRead checks (no unread payload)', () => {
    it('does not increment unreadCount and updates latestNotifications; an inbox-only notification is not queued', async () => {
      mockData.notifyProviders = {
        [notificationPlugin.providers.InboxNotificationProvider]: [{ _id: 'type-1' }]
      }

      const context: DocNotifyContext = {
        _id: 'ctx-1',
        _class: 'DocNotifyContextClass',
        space: 'space-1',
        user: 'user-1',
        unreadMessages: [],
        unreadCount: 0,
        lastNotify: 50,
        latestNotifications: []
      } as any

      await pushNotification(mockClient, txCache, result, context, mockData)

      // It should still push the notification to latestNotifications
      expect(result.updateContextTx).toHaveLength(1)
      const op = result.updateContextTx[0].operations as any
      expect(op.$push.latestNotifications).toBeDefined()
      expect(op.$inc).toBeUndefined() // No unreadCount increment!
      expect(op.unreadMessages).toBeUndefined() // No unread messages updated!

      // Nobody consumes an inbox-only message: push and mail pods filter by their own provider.
      expect(result.queueMessages).toHaveLength(0)
    })

    it('keeps the inbox card but drops push, sound, mail and the app push when alreadyRead is set', async () => {
      mockData.notifyProviders = {
        [notificationPlugin.providers.InboxNotificationProvider]: [{ _id: 'type-1' }],
        [notificationPlugin.providers.PushNotificationProvider]: [{ _id: 'type-1' }],
        [notificationPlugin.providers.SoundNotificationProvider]: [{ _id: 'type-1' }],
        'email-provider': [{ _id: 'type-1' }]
      }
      mockData.pushSubscriptions = [{ _id: 'sub-1', endpoint: 'apns://token' }]
      mockData.alreadyRead = true

      const context: DocNotifyContext = {
        _id: 'ctx-1',
        _class: 'DocNotifyContextClass',
        space: 'space-1',
        user: 'user-1',
        unreadMessages: [],
        unreadCount: 0,
        lastNotify: 50,
        latestNotifications: []
      } as any

      await pushNotification(mockClient, txCache, result, context, mockData)

      expect(result.updateContextTx).toHaveLength(1)
      const op = result.updateContextTx[0].operations as any
      expect(op.$push.latestNotifications).toBeDefined()
      expect(op.$inc).toBeUndefined()
      expect(result.queueMessages).toHaveLength(0)
      expect(result.createAppPushNotificationTx).toHaveLength(0)
    })

    it('queues every provider and creates the app push when the message is not read yet', async () => {
      mockData.notifyProviders = {
        [notificationPlugin.providers.InboxNotificationProvider]: [{ _id: 'type-1' }],
        [notificationPlugin.providers.PushNotificationProvider]: [{ _id: 'type-1' }],
        'email-provider': [{ _id: 'type-1' }]
      }
      mockData.unreadMessage = { id: 'notify-1', createdOn: 100, notified: true }
      mockData.alreadyRead = false

      await pushNotification(mockClient, txCache, result, undefined, mockData)

      expect(result.queueMessages).toHaveLength(1)
      expect(Object.keys((result.queueMessages[0] as QueueNotifyMessage).providers).sort()).toEqual(
        [
          notificationPlugin.providers.InboxNotificationProvider,
          notificationPlugin.providers.PushNotificationProvider,
          'email-provider'
        ].sort()
      )
      expect(result.createAppPushNotificationTx).toHaveLength(1)
    })
  })

  describe('holding the native push while the receiver is at the computer', () => {
    const web = { _id: 'sub-web', endpoint: 'https://push.example.com/x' }
    const native = { _id: 'sub-apns', endpoint: 'apns://token' }
    const providers = {
      [notificationPlugin.providers.InboxNotificationProvider]: [{ _id: 'type-1' }],
      [notificationPlugin.providers.PushNotificationProvider]: [{ _id: 'type-1' }],
      [notificationPlugin.providers.SoundNotificationProvider]: [{ _id: 'type-1' }],
      'email-provider': [{ _id: 'type-1' }]
    }

    beforeEach(() => {
      mockClient.pendingPush = { hold: jest.fn() }
      mockData.notifyProviders = providers
      mockData.pushSubscriptions = [web, native]
      mockData.unreadMessage = { id: 'msg-1', createdOn: 100, notified: true }
      mockData.receiver = { ...mockData.receiver, online: true, away: false }
    })

    it('sends the browser push and the letter at once and holds the phone push', async () => {
      await pushNotification(mockClient, txCache, result, undefined, mockData)

      expect(result.queueMessages).toHaveLength(1)
      expect(result.queueMessages[0]).toMatchObject({ id: 'notify-1', pushSubscriptions: [web] })
      expect(Object.keys((result.queueMessages[0] as QueueNotifyMessage).providers)).toHaveLength(4)

      expect(result.heldPushes).toHaveLength(1)
      const held = result.heldPushes[0]
      expect(held).toMatchObject({
        account: 'user-1',
        notificationId: 'notify-1',
        objectId: 'doc-1',
        createdOn: 100,
        readBy: 'position',
        provider: notificationPlugin.providers.PushNotificationProvider
      })
      expect(held.message.pushSubscriptions).toEqual([native])
      expect(Object.keys(held.message.providers).sort()).toEqual(
        [
          notificationPlugin.providers.PushNotificationProvider,
          notificationPlugin.providers.SoundNotificationProvider
        ].sort()
      )
      expect(held.message.template).toBeUndefined()
    })

    it.each([
      [
        'a reaction',
        { unreadMessage: undefined, unreadReaction: { id: 'notify-1', attachedTo: 'msg-1' } },
        'reactions'
      ],
      ['a mention outside a message', { unreadMessage: undefined, unreadMention: { id: 'notify-1' } }, 'mentions'],
      ['a common notification', { unreadMessage: undefined, unreadCommon: { id: 'notify-1' } }, 'commons']
    ])('holds the phone push about %s, to be checked against the unread list', async (_name, overrides, readBy) => {
      mockData = { ...mockData, ...overrides }

      await pushNotification(mockClient, txCache, result, undefined, mockData)

      expect(result.heldPushes).toHaveLength(1)
      expect(result.heldPushes[0]).toMatchObject({ notificationId: 'notify-1', readBy })
    })

    it('queues nothing immediately when only the phone would be notified', async () => {
      mockData.pushSubscriptions = [native]
      mockData.notifyProviders = {
        [notificationPlugin.providers.InboxNotificationProvider]: [{ _id: 'type-1' }],
        [notificationPlugin.providers.PushNotificationProvider]: [{ _id: 'type-1' }]
      }

      await pushNotification(mockClient, txCache, result, undefined, mockData)

      expect(result.queueMessages).toHaveLength(0)
      expect(result.heldPushes).toHaveLength(1)
    })

    it.each([
      ['the receiver is away', { receiver: { online: true, away: true } }],
      ['the receiver is offline', { receiver: { online: false, away: false } }],
      ['the notification is not unread, so nothing could read it later', { unreadMessage: undefined }],
      ['there is no native subscription', { pushSubscriptions: [web] }]
    ])('sends everything at once when %s', async (_name, overrides: any) => {
      mockData = { ...mockData, ...overrides, receiver: { ...mockData.receiver, ...(overrides.receiver ?? {}) } }

      await pushNotification(mockClient, txCache, result, undefined, mockData)

      expect(result.heldPushes).toHaveLength(0)
      expect(result.queueMessages).toHaveLength(1)
      expect((result.queueMessages[0] as QueueNotifyMessage).pushSubscriptions).toEqual(mockData.pushSubscriptions)
    })
  })

  describe("scheduling the letter in the time machine for the receiver's window", () => {
    const email = 'email-provider'
    const native = { _id: 'sub-apns', endpoint: 'apns://token' }
    const web = { _id: 'sub-web', endpoint: 'https://push.example.com/x' }
    // The inbox type carries templates, so getTemplate renders the letter (translate is mocked as identity-ish).
    const inboxType = { _id: 'type-1', templates: { text: 'text-key', html: 'html-key', subject: 'subject-key' } }
    const providers = {
      [notificationPlugin.providers.InboxNotificationProvider]: [inboxType],
      [notificationPlugin.providers.PushNotificationProvider]: [{ _id: 'type-1' }],
      [email]: [{ _id: 'type-1' }]
    }
    const template = { subject: 'translated:subject-key', text: 'translated:text-key', html: 'translated:html-key' }
    const settingBy = (createdBy: string, holdMs?: number): any => ({
      attachedTo: email,
      enabled: true,
      createdBy,
      holdMs
    })
    const settings = (list: any[]): any => ({
      settingsByProvider: new Map([[email, list]]),
      typesByProvider: new Map()
    })

    beforeEach(() => {
      jest.useFakeTimers({ now: 1_000_000 })
      mockClient.pendingPush = { hold: jest.fn() }
      mockClient.model.findAllSync.mockReturnValue([{ _id: email, holdMs: 3_600_000 }])
      mockData.notifyProviders = providers
      mockData.pushSubscriptions = [web]
      mockData.unreadMessage = { id: 'msg-1', createdOn: 100, notified: true }
      mockData.receiver = { ...mockData.receiver, online: false, away: false, socialIds: ['social-1'] }
      mockData.settings = settings([])
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('schedules no letter for a notification without a template: nothing waits, the email provider goes at once', async () => {
      mockData.notifyProviders = {
        ...providers,
        [notificationPlugin.providers.InboxNotificationProvider]: [{ _id: 'type-1' }]
      }

      await pushNotification(mockClient, txCache, result, undefined, mockData)

      expect(result.timeMachine).toHaveLength(0)
      expect(result.queueMessages).toHaveLength(1)
      expect((result.queueMessages[0] as QueueNotifyMessage).template).toBeUndefined()
      expect(Object.keys((result.queueMessages[0] as QueueNotifyMessage).providers)).toContain(email)
    })

    it('schedules the letter for the provider default when the person has no setting; the push goes at once', async () => {
      await pushNotification(mockClient, txCache, result, undefined, mockData)

      expect(result.heldPushes).toHaveLength(0)
      expect(result.timeMachine).toHaveLength(1)
      const [schedule] = result.timeMachine
      expect(schedule).toMatchObject({
        type: 'schedule',
        id: `letter:user-1:notify-1:${email}`,
        targetDate: 1_000_000 + 3_600_000,
        topic: 'held-notifications'
      })
      const held = schedule.data as any
      expect(held).toMatchObject({ notificationId: 'notify-1', provider: email, readBy: 'position', objectId: 'doc-1' })
      expect(held.message).toMatchObject({ pushSubscriptions: [], providers: { [email]: ['type-1'] }, template })

      expect(result.queueMessages).toHaveLength(1)
      const immediate = result.queueMessages[0] as QueueNotifyMessage
      expect(immediate.template).toBeUndefined()
      expect(Object.keys(immediate.providers).sort()).toEqual(
        [
          notificationPlugin.providers.InboxNotificationProvider,
          notificationPlugin.providers.PushNotificationProvider
        ].sort()
      )
      expect(immediate.pushSubscriptions).toEqual([web])
    })

    it("uses the person's own window, matched by their social id", async () => {
      mockData.settings = settings([settingBy('someone-else', 1), settingBy('social-1', 15 * 60 * 1000)])

      await pushNotification(mockClient, txCache, result, undefined, mockData)

      expect(result.timeMachine[0]).toMatchObject({ targetDate: 1_000_000 + 15 * 60 * 1000 })
    })

    it('sends the letter at once when the person set the window to zero', async () => {
      mockData.settings = settings([settingBy('social-1', 0)])

      await pushNotification(mockClient, txCache, result, undefined, mockData)

      expect(result.timeMachine).toHaveLength(0)
      expect((result.queueMessages[0] as QueueNotifyMessage).template).toEqual(template)
    })

    it('queues nothing at once when the letter was the only delivery', async () => {
      mockData.notifyProviders = {
        [notificationPlugin.providers.InboxNotificationProvider]: [inboxType],
        [email]: [{ _id: 'type-1' }]
      }

      await pushNotification(mockClient, txCache, result, undefined, mockData)

      expect(result.timeMachine).toHaveLength(1)
      expect(result.queueMessages).toHaveLength(0)
    })

    it('marks the receiver notified even when everything waits and nothing is queued', async () => {
      mockData.notifyProviders = {
        [notificationPlugin.providers.InboxNotificationProvider]: [inboxType],
        [email]: [{ _id: 'type-1' }]
      }

      await pushNotification(mockClient, txCache, result, undefined, mockData)

      expect(result.queueMessages).toHaveLength(0)
      expect(Array.from(result.notified)).toEqual(['user-1'])
    })

    it('holds the phone push in memory and schedules the letter while the person is at the computer', async () => {
      mockData.pushSubscriptions = [web, native]
      mockData.receiver = { ...mockData.receiver, online: true, away: false }

      await pushNotification(mockClient, txCache, result, undefined, mockData)

      expect(result.heldPushes).toHaveLength(1)
      expect(result.heldPushes[0]).toMatchObject({
        provider: notificationPlugin.providers.PushNotificationProvider
      })
      expect(result.timeMachine).toHaveLength(1)
      expect(result.queueMessages).toHaveLength(1)
      expect((result.queueMessages[0] as QueueNotifyMessage).pushSubscriptions).toEqual([web])
    })
  })
})
