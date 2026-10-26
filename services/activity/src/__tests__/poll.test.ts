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

import activity, { type Poll, type PollAnswer, type VotePollAction } from '@hcengineering/activity'
import core, {
  type AccountUuid,
  type Doc,
  type Ref,
  type Space,
  type TxCreateDoc,
  type TxCUD,
  TxFactory,
  toFindResult,
  TxProcessor,
  type TxRemoveDoc,
  type TxUpdateDoc,
  type WorkspaceUuid
} from '@hcengineering/core'
import { hashQuizAnswer } from '@hcengineering/server-activity'

import { VotePollHandler } from '../poll'
import { type Client } from '../types'

const alice = 'alice' as AccountUuid
const bob = 'bob' as AccountUuid
const aliceSpace = 'alice-space' as Ref<any>
const channel = 'channel' as Ref<Space>
const pollId = 'poll-1' as Ref<Poll>
const workspace = 'ws-1' as WorkspaceUuid

function makePoll (data: Partial<Poll> = {}): Poll {
  return {
    _id: pollId,
    _class: activity.class.Poll,
    space: channel,
    attachedTo: 'msg-1' as any,
    attachedToClass: activity.class.ActivityMessage,
    collection: 'applets',
    applet: activity.applet.Poll,
    modifiedOn: 0,
    modifiedBy: core.account.System,
    mode: 'single',
    question: 'Lunch?',
    options: [
      { id: 'a', label: 'Pizza' },
      { id: 'b', label: 'Sushi' }
    ],
    totalVotes: 0,
    votes: {},
    userVotes: [],
    ...data
  }
}

describe('VotePollHandler', () => {
  const userFactory = new TxFactory(core.account.System)
  let poll: Poll
  let space: Space
  let answers: PollAnswer[]
  let client: Client

  beforeEach(() => {
    poll = makePoll()
    space = { _id: channel, private: false, members: [] } as unknown as Space
    answers = []
    client = {
      workspace: { uuid: workspace },
      txFactory: new TxFactory(core.account.System, true),
      findOne: async (_class: Ref<any>, query: any) => {
        if (_class === activity.class.Poll) return query._id === poll._id ? poll : undefined
        if (_class === core.class.Space) return query._id === space._id ? space : undefined
        if (_class === activity.class.PollAnswer) {
          return answers.find((it) => it.attachedTo === query.attachedTo && it.space === query.space)
        }
        return undefined
      },
      findAll: async (_class: Ref<any>, query: any) => {
        const found =
          _class === activity.class.PollAnswer ? answers.filter((it) => it.attachedTo === query.attachedTo) : []
        return toFindResult(found, found.length)
      }
    } as unknown as Client
  })

  function action (data: Partial<VotePollAction>, account: AccountUuid = alice): TxCUD<VotePollAction> {
    return userFactory.createTxCreateDoc(activity.class.VotePollAction, aliceSpace, {
      account,
      attachedTo: poll._id,
      options: [],
      ...data
    })
  }

  function updateOf (txes: TxCUD<Doc>[]): Partial<Poll> | undefined {
    const tx = txes.find((it) => it._class === core.class.TxUpdateDoc) as TxUpdateDoc<Poll> | undefined
    return tx?.operations as Partial<Poll> | undefined
  }

  // The poll as the storage and the clients get it: the same TxProcessor applies the operators there.
  function afterUpdate (txes: TxCUD<Doc>[], base: Poll = poll): Poll {
    const tx = txes.find((it) => it._class === core.class.TxUpdateDoc) as TxUpdateDoc<Poll>
    return TxProcessor.updateDoc2Doc(structuredClone(base), tx)
  }

  it('counts a public vote and remembers the voter', async () => {
    const res = await VotePollHandler(action({ options: ['a'] }), client)

    expect(res).toHaveLength(1)
    const updated = afterUpdate(res)
    expect(updated).toMatchObject({ totalVotes: 1, votes: { a: 1 } })
    expect(updated.userVotes?.map((it) => it.account)).toEqual([alice])
  })

  it('sends the new voter only, not the whole voter list', async () => {
    const others = Array.from({ length: 300 }, (_, i) => ({ account: `user-${i}` as AccountUuid, options: [] }))
    poll = makePoll({ totalVotes: 300, votes: { a: 300 }, userVotes: others })

    const res = await VotePollHandler(action({ options: ['b'] }), client)

    expect(updateOf(res)).not.toHaveProperty('userVotes')
    expect(JSON.stringify(updateOf(res)).length).toBeLessThan(500)
    expect(afterUpdate(res).userVotes).toHaveLength(301)
  })

  it('gives the same poll when an update is applied twice', async () => {
    poll = makePoll({
      revote: true,
      totalVotes: 1,
      votes: { a: 1 },
      userVotes: [{ account: bob, options: ['a'] }]
    })

    const vote = await VotePollHandler(action({ options: ['b'] }), client)
    const once = afterUpdate(vote)
    expect(afterUpdate(vote, once)).toEqual(once)

    poll = once
    const retract = await VotePollHandler(action({ retract: true }), client)
    const retracted = afterUpdate(retract)
    expect(afterUpdate(retract, retracted)).toEqual(retracted)
  })

  it('takes back a public vote and keeps the other voters', async () => {
    poll = makePoll({
      revote: true,
      totalVotes: 2,
      votes: { a: 1, b: 1 },
      userVotes: [
        { account: alice, options: ['a'] },
        { account: bob, options: ['b'] }
      ]
    })

    const updated = afterUpdate(await VotePollHandler(action({ retract: true }), client))

    expect(updated).toMatchObject({ totalVotes: 1, votes: { a: 0, b: 1 } })
    expect(updated.userVotes?.map((it) => it.account)).toEqual([bob])
  })

  it('keeps the first vote final in a poll without revote', async () => {
    poll = makePoll({ totalVotes: 1, votes: { a: 1 }, userVotes: [{ account: alice, options: ['a'] }] })

    expect(await VotePollHandler(action({ options: ['b'] }), client)).toEqual([])
    expect(await VotePollHandler(action({ retract: true }), client)).toEqual([])
  })

  it('takes a new vote after a retract, not instead of the current one', async () => {
    poll = makePoll({
      revote: true,
      totalVotes: 1,
      votes: { a: 1 },
      userVotes: [{ account: alice, options: ['a'] }]
    })

    expect(await VotePollHandler(action({ options: ['b'] }), client)).toEqual([])

    poll = afterUpdate(await VotePollHandler(action({ retract: true }), client))
    const updated = afterUpdate(await VotePollHandler(action({ options: ['b'] }), client))
    expect(updated).toMatchObject({ totalVotes: 1, votes: { a: 0, b: 1 } })
    expect(updated.userVotes?.map((it) => it.account)).toEqual([alice])
  })

  it('ignores a vote outside the time window', async () => {
    poll = makePoll({ startAt: Date.now() + 60_000 })
    expect(await VotePollHandler(action({ options: ['a'] }), client)).toEqual([])

    poll = makePoll({ endAt: Date.now() - 60_000 })
    expect(await VotePollHandler(action({ options: ['a'] }), client)).toEqual([])
  })

  it('counts a vote cast in time but processed after the end', async () => {
    const vote = action({ options: ['a'] })
    poll = makePoll({ endAt: vote.modifiedOn + 1 })
    await new Promise((resolve) => setTimeout(resolve, 5))

    expect(afterUpdate(await VotePollHandler(vote, client))).toMatchObject({ totalVotes: 1 })
  })

  it('ignores a vote in a private space the voter is not a member of', async () => {
    space = { _id: channel, private: true, members: [bob] } as unknown as Space

    expect(await VotePollHandler(action({ options: ['a'] }), client)).toEqual([])
  })

  it('reveals by the time the request was cast, as votes are judged', async () => {
    const reveal = action({ reveal: true })
    poll = makePoll({ quiz: true, quizAnswerHash: hashQuizAnswer(workspace, pollId, 'a'), endAt: reveal.modifiedOn })
    await new Promise((resolve) => setTimeout(resolve, 5))

    // Processed after the end, but asked for at the very end: a vote cast then is still counted.
    expect(await VotePollHandler(reveal, client)).toEqual([])
  })

  it('rejects two options in single mode and unknown options', async () => {
    expect(await VotePollHandler(action({ options: ['a', 'b'] }), client)).toEqual([])
    expect(await VotePollHandler(action({ options: ['x'] }), client)).toEqual([])
  })

  it('stores an anonymous vote as a personal answer without the voter in the poll', async () => {
    poll = makePoll({ anonymous: true })

    const res = await VotePollHandler(action({ options: ['b'] }), client)

    const create = res.find((it) => it._class === core.class.TxCreateDoc) as TxCreateDoc<PollAnswer>
    expect(create.objectClass).toBe(activity.class.PollAnswer)
    expect(create.objectSpace).toBe(aliceSpace)
    expect(create.attributes.options).toEqual(['b'])
    expect(afterUpdate(res)).toMatchObject({ totalVotes: 1, votes: { b: 1 }, userVotes: [] })
  })

  it('keeps an anonymous vote final in a poll without revote', async () => {
    poll = makePoll({ anonymous: true, totalVotes: 1, votes: { b: 1 } })
    answers = [{ _id: 'answer-1', space: aliceSpace, attachedTo: poll._id, options: ['b'] } as unknown as PollAnswer]

    expect(await VotePollHandler(action({ options: ['a'] }), client)).toEqual([])
    expect(await VotePollHandler(action({ retract: true }), client)).toEqual([])
  })

  it('takes back an anonymous vote and refuses a second one', async () => {
    poll = makePoll({ anonymous: true, revote: true, totalVotes: 1, votes: { b: 1 } })
    answers = [{ _id: 'answer-1', space: aliceSpace, attachedTo: poll._id, options: ['b'] } as unknown as PollAnswer]

    expect(await VotePollHandler(action({ options: ['a'] }), client)).toEqual([])

    const res = await VotePollHandler(action({ retract: true }), client)
    expect((res.find((it) => it._class === core.class.TxRemoveDoc) as TxRemoveDoc<Doc>).objectId).toBe('answer-1')
    expect(afterUpdate(res)).toMatchObject({ totalVotes: 0, votes: { b: 0 } })
  })

  it('tells a quiz voter the correct option and refuses a retract', async () => {
    poll = makePoll({ quiz: true, quizAnswerHash: hashQuizAnswer(workspace, pollId, 'b') })

    const res = await VotePollHandler(action({ options: ['a'] }), client)
    const create = res.find((it) => it._class === core.class.TxCreateDoc) as TxCreateDoc<PollAnswer>
    expect(create.attributes.quizAnswer).toBe('b')

    poll = afterUpdate(res)
    expect(await VotePollHandler(action({ retract: true }), client)).toEqual([])
  })

  it('keeps the first quiz answer, anonymous or not', async () => {
    // A system import may write the flag into a quiz as well.
    poll = makePoll({ quiz: true, revote: true, quizAnswerHash: hashQuizAnswer(workspace, pollId, 'b') })
    const res = await VotePollHandler(action({ options: ['a'] }), client)
    poll = afterUpdate(res)
    expect(await VotePollHandler(action({ options: ['b'] }), client)).toEqual([])

    poll = makePoll({
      quiz: true,
      anonymous: true,
      revote: true,
      quizAnswerHash: hashQuizAnswer(workspace, pollId, 'b'),
      totalVotes: 1,
      votes: { a: 1 }
    })
    answers = [{ _id: 'answer-1', space: aliceSpace, attachedTo: poll._id, options: ['a'] } as unknown as PollAnswer]
    expect(await VotePollHandler(action({ retract: true }), client)).toEqual([])
    expect(await VotePollHandler(action({ options: ['b'] }), client)).toEqual([])
  })

  it('completes an anonymous vote or retract cut off between the answer and the poll', async () => {
    // The answer looks older than the poll, as from a lagging clock: the count still tells the vote is missing.
    poll = makePoll({ anonymous: true, revote: true, modifiedOn: 5 })
    const cutOff = { _id: 'answer-1', space: aliceSpace, attachedTo: poll._id, options: ['b'], modifiedOn: 1 }
    answers = [cutOff as unknown as PollAnswer]

    const vote = await VotePollHandler(action({ options: ['b'] }), client)
    expect(vote.some((it) => it._class === core.class.TxCreateDoc)).toBe(false)
    poll = afterUpdate(vote)
    expect(poll).toMatchObject({ totalVotes: 1, votes: { b: 1 } })

    answers = []
    poll = afterUpdate(await VotePollHandler(action({ retract: true }), client))
    expect(poll).toMatchObject({ totalVotes: 0, votes: {} })
    expect(await VotePollHandler(action({ retract: true }), client)).toEqual([])
  })

  it('adds a quiz voter cut off after the answer, without a second answer', async () => {
    poll = makePoll({ quiz: true, quizAnswerHash: hashQuizAnswer(workspace, pollId, 'b') })
    const cutOff = { _id: 'answer-1', space: aliceSpace, attachedTo: poll._id, options: ['a'], modifiedOn: 1 }
    answers = [cutOff as unknown as PollAnswer]

    const res = await VotePollHandler(action({ options: ['a'] }), client)
    expect(res).toHaveLength(1)
    const updated = afterUpdate(res)
    expect(updated).toMatchObject({ totalVotes: 1, votes: { a: 1 }, userVotes: [{ account: alice, options: ['a'] }] })
    poll = updated
    expect(await VotePollHandler(action({ options: ['a'] }), client)).toEqual([])
  })

  it('does not recount a repeated vote whose poll update landed, whatever the clocks say', async () => {
    poll = makePoll({ anonymous: true, totalVotes: 1, votes: { b: 1 }, modifiedOn: 1 })
    answers = [{ _id: 'answer-1', space: aliceSpace, attachedTo: poll._id, options: ['b'], modifiedOn: 2 } as any]
    expect(await VotePollHandler(action({ options: ['b'] }), client)).toEqual([])
  })

  it('gives one answer id per voter and poll', async () => {
    poll = makePoll({ anonymous: true, revote: true })
    const first = await VotePollHandler(action({ options: ['b'] }), client)
    const second = await VotePollHandler(action({ options: ['a'] }), client)
    const idOf = (txes: TxCUD<Doc>[]): string | undefined =>
      txes.find((it) => it._class === core.class.TxCreateDoc)?.objectId
    expect(idOf(first)).toBe(idOf(second))
    const fromBob = userFactory.createTxCreateDoc(activity.class.VotePollAction, 'bob-space' as Ref<any>, {
      account: bob,
      attachedTo: poll._id,
      options: ['a']
    })
    expect(idOf(first)).not.toBe(idOf(await VotePollHandler(fromBob, client)))
  })

  it('reveals the answer of an ended quiz only', async () => {
    poll = makePoll({ quiz: true, quizAnswerHash: hashQuizAnswer(workspace, pollId, 'a'), endAt: Date.now() + 60_000 })
    expect(await VotePollHandler(action({ reveal: true }), client)).toEqual([])

    poll = makePoll({ ...poll, endAt: Date.now() - 1 })
    expect(updateOf(await VotePollHandler(action({ reveal: true }), client))).toEqual({ quizAnswer: 'a' })

    poll = makePoll({ ...poll, quizAnswer: 'a' })
    expect(await VotePollHandler(action({ reveal: true }), client)).toEqual([])
  })
})
