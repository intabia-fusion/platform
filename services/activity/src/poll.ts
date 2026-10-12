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

import { createHash } from 'crypto'
import core, {
  type AccountUuid,
  type Doc,
  type DocumentUpdate,
  type Ref,
  type Space,
  type Timestamp,
  type TxCreateDoc,
  type TxCUD,
  TxProcessor
} from '@hcengineering/core'
import activity, {
  type OptionID,
  type Poll,
  type PollAnswer,
  type UserVote,
  type VotePollAction
} from '@hcengineering/activity'
import { hashQuizAnswer } from '@hcengineering/server-activity'

import { type Client } from './types'

export async function VotePollHandler (tx: TxCUD<VotePollAction>, client: Client): Promise<TxCUD<Doc>[]> {
  if (tx._class !== core.class.TxCreateDoc) {
    return []
  }

  const action = TxProcessor.createDoc2Doc(tx as TxCreateDoc<VotePollAction>)
  // ActivityMiddleware rejects such votes; a throw here would stall the queue partition.
  if (!isWellFormed(action)) {
    return []
  }
  // Not cached: the previous vote is written already, but its echo from the queue may still be behind this action.
  const poll = await client.findOne(activity.class.Poll, { _id: action.attachedTo as Ref<Poll> })
  // A poll broken in storage must not throw either: the queue would retry the vote forever.
  if (poll === undefined || !isPollWellFormed(poll)) {
    return []
  }
  const space = await findAccessibleSpace(client, poll.space, action.account)
  if (space === undefined) {
    return []
  }

  // The transactor's clock: a queue lag must not drop a vote cast in time or count one after the reveal.
  const now = tx.modifiedOn
  if (action.reveal === true) {
    return revealQuizAnswer(client, poll, now)
  }
  if (!isPollActive(poll, now)) {
    return []
  }

  if (action.retract === true) {
    return canRetract(poll) ? await retractVote(client, poll, action) : []
  }
  return await castVote(client, poll, action)
}

function isWellFormed (action: VotePollAction): boolean {
  return (
    typeof action.attachedTo === 'string' &&
    Array.isArray(action.options) &&
    action.options.every((it) => typeof it === 'string')
  )
}

function isPollWellFormed (poll: Poll): boolean {
  const isTime = (value: unknown): boolean => value == null || (typeof value === 'number' && Number.isFinite(value))
  const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
  return (
    Array.isArray(poll.options) &&
    poll.options.every((it) => isObject(it) && typeof it.id === 'string') &&
    (poll.userVotes == null ||
      (Array.isArray(poll.userVotes) &&
        poll.userVotes.every(
          (it) =>
            isObject(it) &&
            typeof it.account === 'string' &&
            Array.isArray(it.options) &&
            it.options.every((opt) => typeof opt === 'string')
        ))) &&
    (poll.votes == null || isObject(poll.votes)) &&
    isTime(poll.startAt) &&
    isTime(poll.endAt)
  )
}

// A quiz voter sees the correct option right after voting, a retract would give a second try.
function canRetract (poll: Poll): boolean {
  return poll.revote === true && poll.quiz !== true
}

async function findAccessibleSpace (
  client: Client,
  spaceId: Ref<Space>,
  account: AccountUuid
): Promise<Space | undefined> {
  const space = await client.findOne(core.class.Space, { _id: spaceId })
  if (space === undefined) return undefined
  return !space.private || space.members.includes(account) ? space : undefined
}

// Anonymous polls and quizzes keep each voter's own answer, a poll that is not anonymous lists its voters.
async function findAnswer (client: Client, poll: Poll, action: VotePollAction): Promise<PollAnswer | undefined> {
  if (poll.anonymous !== true && poll.quiz !== true) return undefined
  return await client.findOne(activity.class.PollAnswer, { attachedTo: poll._id, space: action.space })
}

// An anonymous poll knows its voter by the answer only.
function findOwnVote (poll: Poll, action: VotePollAction, answer: PollAnswer | undefined): OptionID[] | undefined {
  if (poll.anonymous === true) return answer?.options
  return poll.userVotes?.find((it) => it.account === action.account)?.options
}

function revealQuizAnswer (client: Client, poll: Poll, now: Timestamp): TxCUD<Doc>[] {
  if (poll.quiz !== true || poll.quizAnswer != null || poll.endAt == null || now <= poll.endAt) {
    return []
  }
  const quizAnswer = findQuizAnswer(client, poll)
  return quizAnswer === undefined ? [] : [createPollUpdateTx(client, poll, { quizAnswer })]
}

async function castVote (client: Client, poll: Poll, action: VotePollAction): Promise<TxCUD<Doc>[]> {
  const answer = await findAnswer(client, poll, action)
  if (answer !== undefined) {
    // The poll is written after its answer: only a poll older than the answer missed this vote.
    return answer.modifiedOn > poll.modifiedOn ? await syncWithAnswers(client, poll, action, answer) : []
  }
  if (findOwnVote(poll, action, undefined) !== undefined || !isValidVoteSelection(poll, action.options)) {
    return []
  }

  const result: TxCUD<Doc>[] = []
  if (poll.anonymous === true || poll.quiz === true) {
    result.push(
      client.txFactory.createTxCreateDoc(
        activity.class.PollAnswer,
        action.space,
        { attachedTo: poll._id, options: action.options, quizAnswer: findQuizAnswer(client, poll) },
        getAnswerId(poll, action)
      )
    )
  }
  // Operators run in key order: the $pull first makes a repeated apply leave one entry.
  const voter: DocumentUpdate<Poll> =
    poll.anonymous === true
      ? {}
      : { ...pullVoter(action.account), $push: { userVotes: { account: action.account, options: action.options } } }
  result.push(createPollUpdateTx(client, poll, { ...countVote(poll, action.options, 1), ...voter }))
  return result
}

async function retractVote (client: Client, poll: Poll, action: VotePollAction): Promise<TxCUD<Doc>[]> {
  const answer = await findAnswer(client, poll, action)
  const vote = findOwnVote(poll, action, answer)
  if (vote === undefined) {
    // A retract cut off after removing its answer left the voter in the tallies.
    const stale = poll.anonymous === true && (await countAnswers(client, poll)) !== poll.totalVotes
    return stale ? await syncWithAnswers(client, poll, action, undefined) : []
  }

  const result: TxCUD<Doc>[] = []
  if (answer !== undefined) {
    result.push(client.txFactory.createTxRemoveDoc(activity.class.PollAnswer, answer.space, answer._id))
  }
  const voter = poll.anonymous === true ? {} : pullVoter(action.account)
  result.push(createPollUpdateTx(client, poll, { ...countVote(poll, vote, -1), ...voter }))
  return result
}

// Answer and poll are written by separate queries: a vote cut off between them is completed on redelivery.
async function syncWithAnswers (
  client: Client,
  poll: Poll,
  action: VotePollAction,
  answer: PollAnswer | undefined
): Promise<TxCUD<Doc>[]> {
  const answers = await client.findAll(
    activity.class.PollAnswer,
    { attachedTo: poll._id },
    { projection: { options: 1 } }
  )
  const votes: Record<OptionID, number> = {}
  for (const it of answers) {
    for (const optId of it.options) {
      votes[optId] = (votes[optId] ?? 0) + 1
    }
  }
  const totalVotes = answers.length
  const update: DocumentUpdate<Poll> = hasTallies(poll, totalVotes, votes) ? {} : { totalVotes, votes }
  if (answer !== undefined && poll.anonymous !== true && findOwnVote(poll, action, undefined) === undefined) {
    Object.assign(update, pullVoter(action.account), {
      $push: { userVotes: { account: action.account, options: answer.options } }
    })
  }
  return Object.keys(update).length > 0 ? [createPollUpdateTx(client, poll, update)] : []
}

async function countAnswers (client: Client, poll: Poll): Promise<number> {
  return (await client.findAll(activity.class.PollAnswer, { attachedTo: poll._id }, { limit: 1, total: true })).total
}

// One answer per voter and poll: a vote processed twice fails on the key instead of counting twice.
function getAnswerId (poll: Poll, action: VotePollAction): Ref<PollAnswer> {
  return createHash('sha256').update(`${poll._id}:${action.space}`).digest('hex').slice(0, 24) as Ref<PollAnswer>
}

function hasTallies (poll: Poll, totalVotes: number, votes: Record<OptionID, number>): boolean {
  const ids = new Set([...Object.keys(poll.votes ?? {}), ...Object.keys(votes)])
  return poll.totalVotes === totalVotes && [...ids].every((id) => (poll.votes?.[id] ?? 0) === (votes[id] ?? 0))
}

function isPollActive (poll: Poll, now: number): boolean {
  const { startAt, endAt } = poll
  if (startAt != null && now < startAt) {
    return false
  }
  if (endAt != null && now > endAt) {
    return false
  }
  return true
}

function isValidVoteSelection (poll: Poll, selectedOptions: OptionID[]): boolean {
  if (selectedOptions.length === 0) {
    return false
  }

  if (new Set(selectedOptions).size !== selectedOptions.length) {
    return false
  }

  const validOptions = new Set(poll.options.map((o) => o.id))
  if (!selectedOptions.every((id) => validOptions.has(id))) {
    return false
  }

  if (poll.mode === 'single' && selectedOptions.length !== 1) {
    return false
  }

  return true
}

// Until the reveal the poll keeps only the hash of the correct option.
function findQuizAnswer (client: Client, poll: Poll): OptionID | undefined {
  if (poll.quiz !== true) {
    return undefined
  }
  const hash = poll.quizAnswerHash
  if (hash == null || hash === '') {
    return undefined
  }
  const correctOption = poll.options.find((opt) => hashQuizAnswer(client.workspace.uuid, poll._id, opt.id) === hash)
  return correctOption?.id
}

// totalVotes counts voters, not chosen options.
function countVote (poll: Poll, options: OptionID[], delta: 1 | -1): DocumentUpdate<Poll> {
  const votes: Record<string, number> = { ...(poll.votes ?? {}) }
  for (const optId of options) {
    votes[optId] = Math.max(0, (votes[optId] ?? 0) + delta)
  }
  return { totalVotes: Math.max(0, (poll.totalVotes ?? 0) + delta), votes }
}

// By element, as the list grows with the channel; idempotent, as lookups may apply it to a poll that has it.
function pullVoter (account: AccountUuid): DocumentUpdate<Poll> {
  return { $pull: { userVotes: { account } as unknown as UserVote } }
}

function createPollUpdateTx (client: Client, poll: Poll, newData: DocumentUpdate<Poll>): TxCUD<Doc> {
  return client.txFactory.createTxUpdateDoc(poll._class, poll.space, poll._id, newData)
}
