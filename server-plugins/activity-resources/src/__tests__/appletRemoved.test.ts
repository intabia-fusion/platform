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

import activity, { type AppletInstance, type PollAnswer } from '@hcengineering/activity'
import core, { TxFactory, toFindResult, type Doc, type TxRemoveDoc } from '@hcengineering/core'
import { type TriggerControl } from '@hcengineering/server-core'

import { OnAppletRemoved } from '../index'

const txFactory = new TxFactory(core.account.System)

function answer (_id: string, attachedTo: string, space: string): PollAnswer {
  return { _id, _class: activity.class.PollAnswer, space, attachedTo, options: ['a'] } as any as PollAnswer
}

// Answers sit in the personal spaces of different voters.
const answers = [
  answer('a1', 'poll-1', 'alice-space'),
  answer('a2', 'poll-1', 'bob-space'),
  answer('a3', 'poll-2', 'alice-space')
]

// Another kind keeps its own documents, the poll kind its answers.
const noteItems = [{ _id: 'n1', _class: 'test:class:NoteItem', space: 'channel', attachedTo: 'note-1' }]
const applets = [{ dependents: [activity.class.PollAnswer] }, { dependents: ['test:class:NoteItem'] }, {}]

function makeControl (): TriggerControl {
  const byClass: Record<string, any[]> = { [activity.class.PollAnswer]: answers, 'test:class:NoteItem': noteItems }
  return {
    ctx: {},
    txFactory,
    modelDb: { findAllSync: () => applets },
    findAll: jest.fn().mockImplementation(async (_ctx, _class, query: { attachedTo: { $in: string[] } }) => {
      return toFindResult((byClass[_class] ?? []).filter((it) => query.attachedTo.$in.includes(it.attachedTo)))
    })
  } as any as TriggerControl
}

describe('OnAppletRemoved', () => {
  it('removes the answers of every voter, each in its own space', async () => {
    const tx = txFactory.createTxRemoveDoc<AppletInstance>(activity.class.Poll, 'channel' as any, 'poll-1' as any)
    const result = (await OnAppletRemoved([tx], makeControl())) as TxRemoveDoc<Doc>[]

    expect(result.map((it) => `${it.objectId}@${it.objectSpace}`).sort((a, b) => a.localeCompare(b))).toEqual([
      'a1@alice-space',
      'a2@bob-space'
    ])
  })

  it('removes the dependents of any applet kind, whatever class the tx names', async () => {
    const tx = txFactory.createTxRemoveDoc<AppletInstance>(
      activity.class.AppletInstance,
      'channel' as any,
      'note-1' as any
    )
    const result = (await OnAppletRemoved([tx], makeControl())) as TxRemoveDoc<Doc>[]

    expect(result.map((it) => `${it.objectClass}:${it.objectId}`)).toEqual(['test:class:NoteItem:n1'])
  })

  it('does not query the answers without removals', async () => {
    const control = makeControl()

    expect(await OnAppletRemoved([], control)).toEqual([])
    expect(control.findAll).not.toHaveBeenCalled()
  })
})
