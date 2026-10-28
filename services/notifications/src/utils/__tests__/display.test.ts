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
  getDocTitle,
  getDocIdentifier,
  getDocUrl,
  getContextRefs,
  getBaseDisplayParams,
  getPushGroup
} from '../display'
import { getEmptyTxCache } from '../result'
import {
  getDocIdentifier as _getDocIdentifier,
  getDocTitle as _getDocTitle,
  getDocUrl as _getDocUrl,
  getTitlePresenter
} from '@hcengineering/server-activity'
import { getSenderName, Sender } from '@hcengineering/server-notification'
import { Client, TxCache } from '../../types'
import { Doc, AccountUuid } from '@hcengineering/core'
import { NotificationType } from '@hcengineering/notification'
import { ActivityMessage } from '@hcengineering/activity'
import chunter from '@hcengineering/chunter'

jest.mock('@hcengineering/server-activity', () => ({
  getDocIcon: jest.fn(),
  getDocIdentifier: jest.fn(),
  getDocLabel: jest.fn(),
  getDocTitle: jest.fn(),
  getDocUrl: jest.fn(),
  getIconPresenter: jest.fn(),
  getTitlePresenter: jest.fn()
}))

jest.mock('@hcengineering/server-notification', () => ({
  getSenderName: jest.fn()
}))

describe('display utils', () => {
  let mockClient: Client
  let txCache: TxCache

  beforeEach(() => {
    mockClient = {
      ctx: 'ctx-val',
      workspace: 'ws-val',
      hierarchy: {
        isDerived: jest.fn().mockReturnValue(false)
      },
      model: 'model-val',
      branding: { lastNameFirst: true },
      findAll: jest.fn()
    } as unknown as Client
    txCache = getEmptyTxCache()
    jest.clearAllMocks()
  })

  describe('getPushGroup', () => {
    it('leaves a message outside a thread with its context', () => {
      const plain = { _id: 'msg-1', _class: chunter.class.ChatMessage } as unknown as ActivityMessage
      expect(getPushGroup(mockClient, plain)).toBeUndefined()
      expect(getPushGroup(mockClient, undefined)).toBeUndefined()
    })

    it('stacks a thread reply with its channel', () => {
      ;(mockClient.hierarchy.isDerived as jest.Mock).mockImplementation(
        (_: unknown, base: unknown) => base === chunter.class.ThreadMessage
      )
      const reply = { _id: 'reply-1', _class: chunter.class.ThreadMessage, objectId: 'channel-1' }
      expect(getPushGroup(mockClient, reply as unknown as ActivityMessage)).toBe('channel-1')
    })
  })

  describe('getDocTitle', () => {
    it('fetches and caches non-personalized title', async () => {
      const doc = { _id: 'doc-1', _class: 'DocClass' } as unknown as Doc
      ;(getTitlePresenter as jest.Mock).mockReturnValue({ personalized: false })
      ;(_getDocTitle as jest.Mock).mockResolvedValue('My Doc Title')

      const title1 = await getDocTitle(mockClient, txCache, doc)
      expect(title1).toBe('My Doc Title')
      expect(_getDocTitle).toHaveBeenCalledTimes(1)

      // Second call should retrieve from cache
      const title2 = await getDocTitle(mockClient, txCache, doc)
      expect(title2).toBe('My Doc Title')
      expect(_getDocTitle).toHaveBeenCalledTimes(1)
    })

    it('caches personalized title under account key', async () => {
      const doc = { _id: 'doc-1', _class: 'DocClass' } as unknown as Doc
      ;(getTitlePresenter as jest.Mock).mockReturnValue({ personalized: true })
      ;(_getDocTitle as jest.Mock).mockResolvedValueOnce('User 1 Title').mockResolvedValueOnce('User 2 Title')

      const t1 = await getDocTitle(mockClient, txCache, doc, 'user-1' as AccountUuid)
      const t2 = await getDocTitle(mockClient, txCache, doc, 'user-2' as AccountUuid)
      const t1Cached = await getDocTitle(mockClient, txCache, doc, 'user-1' as AccountUuid)

      expect(t1).toBe('User 1 Title')
      expect(t2).toBe('User 2 Title')
      expect(t1Cached).toBe('User 1 Title')
      expect(_getDocTitle).toHaveBeenCalledTimes(2)
    })
  })

  describe('getDocIdentifier', () => {
    it('fetches and caches document identifier', async () => {
      const doc = { _id: 'doc-1', _class: 'DocClass' } as unknown as Doc
      ;(_getDocIdentifier as jest.Mock).mockResolvedValue('ID-100')

      const id1 = await getDocIdentifier(mockClient, txCache, doc)
      const id2 = await getDocIdentifier(mockClient, txCache, doc)

      expect(id1).toBe('ID-100')
      expect(id2).toBe('ID-100')
      expect(_getDocIdentifier).toHaveBeenCalledTimes(1)
    })
  })

  describe('getDocUrl', () => {
    it('fetches and caches document url', async () => {
      const doc = { _id: 'doc-1', _class: 'DocClass' } as unknown as Doc
      ;(_getDocUrl as jest.Mock).mockResolvedValue('/docs/1')

      const url1 = await getDocUrl(mockClient, txCache, doc)
      const url2 = await getDocUrl(mockClient, txCache, doc)

      expect(url1).toBe('/docs/1')
      expect(url2).toBe('/docs/1')
      expect(_getDocUrl).toHaveBeenCalledTimes(1)
    })
  })

  describe('getContextRefs', () => {
    it('refers to the preview of the document', async () => {
      const doc = { _id: 'doc-1', _class: 'DocClass' } as unknown as Doc
      const cache = { getDocPreviewId: jest.fn().mockResolvedValue('preview-1') } as any

      expect(await getContextRefs(mockClient, cache, doc)).toEqual({ preview: 'preview-1' })
      expect(cache.getDocPreviewId).toHaveBeenCalledWith('doc-1', 'DocClass')
    })

    it('refers a thread to the preview of its parent and keeps its own message', async () => {
      const doc = {
        _id: 'msg-1',
        _class: 'MessageClass',
        attachedTo: 'parent-1',
        attachedToClass: 'ParentClass'
      } as unknown as Doc
      const cache = { getDocPreviewId: jest.fn().mockResolvedValue('preview-1') } as any
      ;(mockClient.hierarchy.isDerived as jest.Mock).mockReturnValue(true)

      const res = await getContextRefs(mockClient, cache, doc)

      expect(cache.getDocPreviewId).toHaveBeenCalledWith('parent-1', 'ParentClass')
      expect(res).toEqual({
        preview: 'preview-1',
        message: { _id: 'msg-1', _class: 'MessageClass', attachedTo: 'parent-1', attachedToClass: 'ParentClass' }
      })
    })

    it('leaves the preview unset when the document has none, for the backfill to fill', async () => {
      const doc = { _id: 'doc-1', _class: 'DocClass' } as unknown as Doc
      const cache = { getDocPreviewId: jest.fn().mockResolvedValue(undefined) } as any

      expect(await getContextRefs(mockClient, cache, doc)).toEqual({})
    })
  })

  describe('getBaseDisplayParams', () => {
    const receiver = { account: 'acc-1' as AccountUuid, language: 'en' }

    it('names a personalized document as the receiver sees it', async () => {
      const doc = { _id: 'dm-1', _class: 'DirectClass' } as unknown as Doc
      ;(getTitlePresenter as jest.Mock).mockReturnValue({ personalized: true })
      ;(_getDocTitle as jest.Mock).mockResolvedValue('Alice')

      const result = await getBaseDisplayParams(mockClient, txCache, undefined, doc, {} as unknown as Sender, receiver)

      expect(_getDocTitle).toHaveBeenCalledWith(expect.anything(), doc, { account: 'acc-1', lang: 'en' })
      expect(result.intlParams).toMatchObject({ title: 'Alice', doc: 'Alice' })
    })

    it('writes a channel with its hash, the title giving the bare name', async () => {
      const doc = { _id: 'ch-1', _class: chunter.class.Channel } as unknown as Doc
      ;(mockClient.hierarchy.isDerived as jest.Mock).mockImplementation((a, b) => a === b)
      ;(getTitlePresenter as jest.Mock).mockReturnValue({ personalized: false })
      ;(_getDocTitle as jest.Mock).mockResolvedValue('general')

      const result = await getBaseDisplayParams(mockClient, txCache, undefined, doc, {} as unknown as Sender, receiver)

      expect(result.intlParams).toMatchObject({ title: '#general', doc: '#general' })
    })

    it('resolves parameters from title, url, identifier, sender, and message type', async () => {
      const doc = { _id: 'doc-1', _class: 'DocClass' } as unknown as Doc
      ;(getTitlePresenter as jest.Mock).mockReturnValue({ personalized: false })
      ;(_getDocTitle as jest.Mock).mockResolvedValue('Title')
      ;(_getDocUrl as jest.Mock).mockResolvedValue('/url')
      ;(_getDocIdentifier as jest.Mock).mockResolvedValue('ID')
      ;(getSenderName as jest.Mock).mockReturnValue('John Doe')

      const type = { notificationMessage: 'Hello World' } as unknown as NotificationType
      const sender = { name: 'John' } as unknown as Sender

      const result = await getBaseDisplayParams(mockClient, txCache, type, doc, sender, receiver)

      expect(getSenderName).toHaveBeenCalledWith(sender, true) // client.branding.lastNameFirst is true
      expect(result).toEqual({
        intlParams: {
          title: 'Title',
          doc: 'Title',
          url: '/url',
          identifier: 'ID',
          senderName: 'John Doe'
        },
        intlParamsNotLocalized: {
          message: 'Hello World'
        }
      })
    })

    it('handles missing/empty values gracefully', async () => {
      const doc = { _id: 'doc-1', _class: 'DocClass' } as unknown as Doc
      ;(getTitlePresenter as jest.Mock).mockReturnValue({ personalized: false })
      ;(_getDocTitle as jest.Mock).mockResolvedValue(null)
      ;(_getDocUrl as jest.Mock).mockResolvedValue(null)
      ;(_getDocIdentifier as jest.Mock).mockResolvedValue(null)
      ;(getSenderName as jest.Mock).mockReturnValue('Anonymous')

      const type = {} as unknown as NotificationType
      const sender = {} as unknown as Sender

      const result = await getBaseDisplayParams(mockClient, txCache, type, doc, sender, receiver)

      expect(result).toEqual({
        intlParams: {
          senderName: 'Anonymous'
        },
        intlParamsNotLocalized: {}
      })
    })
  })
})
