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

import activity from '@hcengineering/activity'
import chunter from '@hcengineering/chunter'
import core, {
  type Class,
  type Doc,
  type Ref,
  type Space,
  type TxCUD,
  TxFactory,
  toFindResult
} from '@hcengineering/core'
import { type TriggerControl } from '@hcengineering/server-core'

import plugin from '..'

const ISSUE = 'class:Issue' as Ref<Class<Doc>>
const NOTE = 'class:Note' as Ref<Class<Doc>>
const domains: Record<string, string> = { [ISSUE]: 'task', [NOTE]: 'note' }

const txFactory = new TxFactory('test-account' as any)

// Chats of `issue-1` for two accounts, and one of a note that has the same id in another domain.
const chats = [
  { _id: 'chat-a', _class: chunter.class.Chat, space: 'ps-a', attachedTo: 'issue-1', attachedToClass: ISSUE },
  { _id: 'chat-b', _class: chunter.class.Chat, space: 'ps-b', attachedTo: 'issue-1', attachedToClass: ISSUE },
  { _id: 'chat-n', _class: chunter.class.Chat, space: 'ps-a', attachedTo: 'issue-1', attachedToClass: NOTE }
]

function makeControl (): TriggerControl {
  return {
    ctx: {},
    txFactory,
    hierarchy: {
      classHierarchyMixin: (_class: string, mixin: string) =>
        mixin === activity.mixin.ActivityDoc && domains[_class] !== undefined ? {} : undefined,
      getDomain: (_class: string) => domains[_class],
      findDomain: (_class: string) => domains[_class]
    },
    findAll: jest.fn(async (_ctx: unknown, _class: string, query: any) =>
      toFindResult(
        (_class === chunter.class.Chat
          ? chats.filter((it) => query.attachedTo.$in.includes(it.attachedTo) === true)
          : []) as any[]
      )
    )
  } as any as TriggerControl
}

const removed = (tx: TxCUD<Doc>): string[] => [tx.objectId, tx.objectSpace]

describe('OnChatDocRemoved', () => {
  it('removes the chats of a removed document for every account, by its domain', async () => {
    const control = makeControl()
    const tx = txFactory.createTxRemoveDoc(ISSUE, 'space-1' as Ref<Space>, 'issue-1' as Ref<Doc>)
    const res = (await (await plugin()).trigger.OnChatDocRemoved([tx], control)) as TxCUD<Doc>[]
    expect(res.map(removed)).toEqual([
      ['chat-a', 'ps-a'],
      ['chat-b', 'ps-b']
    ])
    expect(res.every((it) => it._class === core.class.TxRemoveDoc && it.collection === 'chats')).toBe(true)
  })

  it('asks nothing for a document without activity', async () => {
    const control = makeControl()
    const tx = txFactory.createTxRemoveDoc('class:Plain' as Ref<Class<Doc>>, 'space-1' as Ref<Space>, 'x' as Ref<Doc>)
    expect(await (await plugin()).trigger.OnChatDocRemoved([tx], control)).toEqual([])
    expect(control.findAll).not.toHaveBeenCalled()
  })
})
