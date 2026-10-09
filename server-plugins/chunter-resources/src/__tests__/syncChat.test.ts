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

import chunter from '@hcengineering/chunter'
import type { UserStatus } from '@hcengineering/core'
import type { TriggerControl } from '@hcengineering/server-core'

import { syncChat } from '../index'

describe('syncChat', () => {
  it('filters non-channel chats without touching hierarchy before it is declared', async () => {
    const syncInfo = { _class: chunter.class.ChatSyncInfo, space: 's', _id: 'sync-1', timestamp: 0 }
    const chat = { _class: chunter.class.Chat, space: 's', _id: 'chat-1', attachedTo: 'doc-1', attachedToClass: 'x' }
    const control = {
      ctx: {
        with: async (_n: string, _p: any, op: any) => await op({}),
        info: () => {}
      },
      hierarchy: { getDescendants: (_class: string) => [_class] },
      txFactory: {
        createTxUpdateDoc: () => ({ _class: 'update' }),
        createTxCollectionCUD: () => ({ _class: 'collection' })
      },
      findAll: async (_ctx: any, _class: any) => {
        if (_class === chunter.class.ChatSyncInfo) return [syncInfo]
        if (_class === chunter.class.Chat) return [chat]
        return []
      }
    } as unknown as TriggerControl

    const res = await syncChat(control, { user: 'u1' } as unknown as UserStatus, 10 ** 15)

    expect(res.map((t) => t._class)).toEqual(['collection', 'update'])
  })

  it('excludes every chunter space chat in the query', async () => {
    const syncInfo = { _class: chunter.class.ChatSyncInfo, space: 's', _id: 'sync-1', timestamp: 0 }
    const chats = [
      { _class: chunter.class.Chat, space: 's', _id: 'chat-doc', attachedTo: 'doc-1', attachedToClass: 'x' },
      {
        _class: chunter.class.Chat,
        space: 's',
        _id: 'chat-direct',
        attachedTo: 'dm-1',
        attachedToClass: chunter.class.DirectMessage
      },
      {
        _class: chunter.class.Chat,
        space: 's',
        _id: 'chat-channel',
        attachedTo: 'ch-1',
        attachedToClass: 'x:class:OnboardingChannel'
      }
    ]
    let chatQuery: any
    const hidden: string[] = []
    const control = {
      ctx: {
        with: async (_n: string, _p: any, op: any) => await op({}),
        info: () => {}
      },
      hierarchy: {
        getDescendants: (_class: string) =>
          _class === chunter.class.ChunterSpace
            ? [_class, chunter.class.Channel, 'x:class:OnboardingChannel', chunter.class.DirectMessage]
            : [_class]
      },
      txFactory: {
        createTxUpdateDoc: (_c: any, _s: any, objectId: string) => ({ _class: 'update', objectId }),
        createTxCollectionCUD: (_c: any, _a: any, _s: any, _col: any, tx: any) => {
          hidden.push(tx.objectId)
          return { _class: 'collection' }
        }
      },
      findAll: async (_ctx: any, _class: any, query: any) => {
        if (_class === chunter.class.ChatSyncInfo) return [syncInfo]
        if (_class === chunter.class.Chat) {
          chatQuery = query
          return chats.filter((it) => !(query.attachedToClass.$nin as string[]).includes(it.attachedToClass))
        }
        return []
      }
    } as unknown as TriggerControl

    await syncChat(control, { user: 'u1' } as unknown as UserStatus, 10 ** 15)

    expect(chatQuery).toEqual({
      account: 'u1',
      hidden: false,
      pinned: false,
      attachedToClass: {
        $nin: [
          chunter.class.ChunterSpace,
          chunter.class.Channel,
          'x:class:OnboardingChannel',
          chunter.class.DirectMessage
        ]
      }
    })
    expect(hidden).toEqual(['chat-doc'])
  })
})
