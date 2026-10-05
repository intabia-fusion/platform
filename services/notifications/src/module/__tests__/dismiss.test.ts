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

import { Ref } from '@hcengineering/core'
import { ActivityMessage } from '@hcengineering/activity'
import { UnreadMessage } from '@hcengineering/notification'

import { pushDismissMessage, pushDismissAllMessage, dismissScopeOf } from '../dismiss'
import { emptyResult } from '../../utils/result'

const id = (value: string): Ref<ActivityMessage> => value as Ref<ActivityMessage>

describe('dismissScopeOf', () => {
  it('names the notified messages and keeps the read position', () => {
    const read: UnreadMessage[] = [
      { id: id('a'), createdOn: 10, notified: true },
      { id: id('b'), createdOn: 20 },
      { id: id('c'), createdOn: 30, notified: true, mentioned: true }
    ]
    expect(dismissScopeOf(read, 40)).toEqual({ tags: ['a', 'c'], readUpTo: 40 })
  })

  it('has no tags for a chunk but still dismisses up to the position when it was notified', () => {
    expect(dismissScopeOf([{ from: 1, to: 9, count: 5, notifiedCount: 2 }], 40)).toEqual({ tags: [], readUpTo: 40 })
  })

  it('dismisses nothing when no notified message was read', () => {
    const read: UnreadMessage[] = [
      { id: id('b'), createdOn: 20 },
      { from: 1, to: 9, count: 5 }
    ]
    expect(dismissScopeOf(read, 40)).toEqual({ tags: [], readUpTo: 0 })
    expect(dismissScopeOf([], 40)).toEqual({ tags: [], readUpTo: 0 })
  })
})

describe('pushDismissMessage', () => {
  const context = {
    _id: 'ctx-1',
    user: 'user-1',
    objectId: 'doc-1',
    objectClass: 'DocClass',
    objectSpace: 'space-doc'
  } as any
  const cache = (endpoints: string[]): any => ({
    getPushSubscriptions: jest.fn().mockResolvedValue(endpoints.map((endpoint) => ({ _id: endpoint, endpoint })))
  })

  it('dismisses by tags alone when no message was read (reactions, mentions, commons)', async () => {
    const result = emptyResult()
    await pushDismissMessage(cache(['apns://a', 'https://web']), result, context, { tags: ['r-1', 'c-1'], readUpTo: 0 })
    expect(result.queueMessages).toEqual([
      expect.objectContaining({
        kind: 'dismiss',
        id: 'dismiss:ctx-1:r-1',
        pushSubscriptions: [{ _id: 'apns://a', endpoint: 'apns://a' }],
        tags: ['r-1', 'c-1'],
        readUpTo: 0
      })
    ])
  })

  it('sends nothing when the read names no tag and no position', async () => {
    const result = emptyResult()
    await pushDismissMessage(cache(['apns://a']), result, context, { tags: [], readUpTo: 0 })
    expect(result.queueMessages).toEqual([])
  })
})

describe('dismissScopeOf with pushes still held', () => {
  it('leaves out the tags whose push never left, and dismisses nothing when none did', () => {
    const read: UnreadMessage[] = [
      { id: id('a'), createdOn: 10, notified: true },
      { id: id('c'), createdOn: 30, notified: true }
    ]
    expect(dismissScopeOf(read, 40, new Set(['a']))).toEqual({ tags: ['c'], readUpTo: 40 })
    expect(dismissScopeOf(read, 40, new Set(['a', 'c']))).toEqual({ tags: [], readUpTo: 0 })
  })
})

describe('pushDismissMessage with many tags', () => {
  const context = {
    _id: 'ctx-1',
    user: 'user-1',
    objectId: 'doc-1',
    objectClass: 'DocClass',
    objectSpace: 'space-doc'
  } as any
  const cache: any = { getPushSubscriptions: jest.fn().mockResolvedValue([{ _id: 'apns', endpoint: 'apns://t' }]) }

  it('splits the tags into messages of fifty, each with the read position and its own id', async () => {
    const result = emptyResult()
    const tags = Array.from({ length: 120 }, (_, i) => `m-${i}`)
    await pushDismissMessage(cache, result, context, { tags, readUpTo: 500 })
    expect(result.queueMessages.map((it: any) => [it.id, it.tags.length, it.readUpTo])).toEqual([
      ['dismiss:ctx-1:500', 50, 500],
      ['dismiss:ctx-1:500:m-50', 50, 500],
      ['dismiss:ctx-1:500:m-100', 20, 500]
    ])
  })
})

describe('pushDismissAllMessage', () => {
  const cache = (endpoints: string[]): any => ({
    getPushSubscriptions: jest.fn().mockResolvedValue(endpoints.map((endpoint) => ({ _id: endpoint, endpoint })))
  })

  it('sends one message for the whole workspace to the native subscriptions', async () => {
    const result = emptyResult()
    await pushDismissAllMessage(cache(['apns://a', 'https://web', 'fcm://b']), result, 'user-1' as any, 1000)
    expect(result.queueMessages).toEqual([
      {
        kind: 'dismiss-all',
        id: 'dismiss-all:user-1:1000',
        account: 'user-1',
        pushSubscriptions: [
          { _id: 'apns://a', endpoint: 'apns://a' },
          { _id: 'fcm://b', endpoint: 'fcm://b' }
        ],
        readUpTo: 1000
      }
    ])
  })

  it('sends nothing to an account without a native app', async () => {
    const result = emptyResult()
    await pushDismissAllMessage(cache(['https://web']), result, 'user-1' as any, 1000)
    expect(result.queueMessages).toEqual([])
  })
})
