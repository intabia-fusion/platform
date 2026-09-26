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

import { readUnread } from '../dismiss'

const id = (value: string): Ref<ActivityMessage> => value as Ref<ActivityMessage>

describe('readUnread', () => {
  it('names the notified messages and keeps the read position', () => {
    const read: UnreadMessage[] = [
      { id: id('a'), createdOn: 10, notified: true },
      { id: id('b'), createdOn: 20 },
      { id: id('c'), createdOn: 30, notified: true, mentioned: true }
    ]
    expect(readUnread(read, 40)).toEqual({ tags: ['a', 'c'], readUpTo: 40 })
  })

  it('has no tags for a chunk but still dismisses up to the position when it was notified', () => {
    expect(readUnread([{ from: 1, to: 9, count: 5, notifiedCount: 2 }], 40)).toEqual({ tags: [], readUpTo: 40 })
  })

  it('dismisses nothing when no notified message was read', () => {
    const read: UnreadMessage[] = [{ id: id('b'), createdOn: 20 }, { from: 1, to: 9, count: 5 }]
    expect(readUnread(read, 40)).toEqual({ tags: [], readUpTo: 0 })
    expect(readUnread([], 40)).toEqual({ tags: [], readUpTo: 0 })
  })
})
