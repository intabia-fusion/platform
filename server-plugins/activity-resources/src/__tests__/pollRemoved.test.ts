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

import activity, { type PollAnswer } from '@hcengineering/activity'
import core, { TxFactory, toFindResult, type Doc, type Ref, type TxCUD, type TxRemoveDoc } from '@hcengineering/core'
import { type TriggerControl } from '@hcengineering/server-core'

import { OnPollRemoved } from '../index'

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

function makeControl (): TriggerControl {
  return {
    ctx: {},
    txFactory,
    findAll: jest.fn().mockImplementation(async (_ctx, _class, query: { attachedTo: { $in: string[] } }) => {
      if (_class !== activity.class.PollAnswer) return toFindResult([])
      return toFindResult(answers.filter((it) => query.attachedTo.$in.includes(it.attachedTo)))
    })
  } as any as TriggerControl
}

describe('OnPollRemoved', () => {
  it('removes the answers of every voter, each in its own space', async () => {
    const tx = txFactory.createTxRemoveDoc(activity.class.Poll, 'channel' as any, 'poll-1' as Ref<Doc>)
    const result = (await OnPollRemoved([tx as TxCUD<Doc>], makeControl())) as TxRemoveDoc<Doc>[]

    expect(result.map((it) => `${it.objectId}@${it.objectSpace}`).sort((a, b) => a.localeCompare(b))).toEqual([
      'a1@alice-space',
      'a2@bob-space'
    ])
  })

  it('ignores transactions that are not removals', async () => {
    const control = makeControl()
    const tx = txFactory.createTxUpdateDoc(activity.class.Poll, 'channel' as any, 'poll-1' as Ref<Doc>, {})

    expect(await OnPollRemoved([tx as TxCUD<Doc>], control)).toEqual([])
    expect(control.findAll).not.toHaveBeenCalled()
  })
})
