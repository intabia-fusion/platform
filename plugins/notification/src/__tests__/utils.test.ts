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
import { getNotifiedMessagesTotal, getUnreadMessageCount } from '../utils'
import { DocNotifyContext, UnreadMessage } from '../types'

type UnreadCounted = Partial<Pick<DocNotifyContext, 'unreadMessages' | 'unreadMessagesCount'>>

describe('getUnreadMessageCount', () => {
  it('prefers unreadMessagesCount even when the array says otherwise', () => {
    const context: UnreadCounted = {
      unreadMessagesCount: 7,
      unreadMessages: [
        { id: 'msg-1' as Ref<ActivityMessage>, createdOn: 1 },
        { id: 'msg-2' as Ref<ActivityMessage>, createdOn: 2 }
      ]
    }

    expect(getUnreadMessageCount(context)).toBe(7)
  })

  it('falls back to summing unreadMessages when unreadMessagesCount is absent', () => {
    const unreadMessages: UnreadMessage[] = [
      { id: 'msg-1' as Ref<ActivityMessage>, createdOn: 1 },
      { id: 'msg-2' as Ref<ActivityMessage>, createdOn: 2 },
      { from: 10, to: 20, count: 3 }
    ]
    const context: UnreadCounted = { unreadMessages }

    expect(getUnreadMessageCount(context)).toBe(5)
  })

  it('sums across an array of contexts', () => {
    const withCounter: UnreadCounted = { unreadMessagesCount: 7 }
    const withoutCounter: UnreadCounted = {
      unreadMessages: [
        { id: 'msg-1' as Ref<ActivityMessage>, createdOn: 1 },
        { id: 'msg-2' as Ref<ActivityMessage>, createdOn: 2 },
        { from: 10, to: 20, count: 3 }
      ]
    }

    expect(getUnreadMessageCount([withCounter, withoutCounter])).toBe(12)
  })

  it('returns 0 for undefined', () => {
    expect(getUnreadMessageCount(undefined)).toBe(0)
  })
})

describe('getNotifiedMessagesTotal', () => {
  it('counts notified entries and the notified part of chunks', () => {
    const unreadMessages: UnreadMessage[] = [
      { from: 1, to: 5, count: 10, notifiedCount: 3 },
      { from: 6, to: 7, count: 4 },
      { id: 'm1' as Ref<ActivityMessage>, createdOn: 8 },
      { id: 'm2' as Ref<ActivityMessage>, createdOn: 9, notified: true },
      { id: 'm3' as Ref<ActivityMessage>, createdOn: 10, notified: false }
    ]

    expect(getNotifiedMessagesTotal(unreadMessages)).toBe(4)
    expect(getNotifiedMessagesTotal([])).toBe(0)
  })
})
