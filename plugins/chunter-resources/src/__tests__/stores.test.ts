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

import { type Readable, writable } from 'svelte/store'

const unreadByDoc = writable(new Map<string, any>())

jest.mock('@hcengineering/notification-resources', () => ({
  NotificationClientImpl: { getClient: () => ({ unreadByDoc }) }
}))
jest.mock('@hcengineering/ui', () => ({
  languageStore: { subscribe: () => () => {} }
}))
jest.mock('@hcengineering/activity', () => ({
  __esModule: true,
  default: { class: { ActivityMessage: 'activity:class:ActivityMessage' } }
}))
jest.mock('@hcengineering/presentation', () => ({
  getClient: () => ({
    getHierarchy: () => ({
      isDerived: (_class: string, from: string) =>
        from === 'activity:class:ActivityMessage' && mockMessageClasses.includes(_class)
    })
  })
}))

const mockMessageClasses = ['chunter:class:ChatMessage', 'activity:class:DocUpdateMessage']

// eslint-disable-next-line import/first
import { unreadThreadsCountStore } from '../stores'

// Through a subscription: `get` of the shared svelte mock answers a readable with its initial value.
function current<T> (store: Readable<T>): T {
  let value: T | undefined
  store.subscribe((it) => {
    value = it
  })()
  return value as T
}

function context (objectClass: string, unreadMessagesCount: number, notifiedMessagesCount?: number): any {
  return { objectClass, unreadCount: notifiedMessagesCount ?? 0, unreadMessagesCount, notifiedMessagesCount }
}

describe('unreadThreadsCountStore', () => {
  it('counts threads with unread replies that raised a notification', () => {
    unreadByDoc.set(
      new Map([
        ['thread-1', context('chunter:class:ChatMessage', 2, 2)],
        // A thread on any activity message, not only on a chat one.
        ['thread-2', context('activity:class:DocUpdateMessage', 1, 1)],
        // A channel is not a thread.
        ['channel', context('chunter:class:Channel', 5, 5)],
        // Replies without a notification: the thread is muted or mentions-only.
        ['quiet-thread', context('chunter:class:ChatMessage', 3, 0)],
        // A context written before the counter existed.
        ['old-thread', context('chunter:class:ChatMessage', 1, undefined)]
      ])
    )

    expect(current(unreadThreadsCountStore)).toBe(2)
  })

  it('follows the unread map, which leaves out a thread that is being read', () => {
    const values: number[] = []
    const unsubscribe = unreadThreadsCountStore.subscribe((it) => values.push(it))

    unreadByDoc.set(new Map([['thread-1', context('chunter:class:ChatMessage', 1, 1)]]))
    // What publishUnread does for a document being read: no entry, or no unread messages in it.
    unreadByDoc.set(new Map())
    unreadByDoc.set(new Map([['thread-1', context('chunter:class:ChatMessage', 0, 0)]]))
    unsubscribe()

    expect(values.slice(-3)).toEqual([1, 0, 0])
  })
})
