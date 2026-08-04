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

import core, {
  type AccountUuid,
  type Doc,
  type Timestamp,
  type TxCreateDoc,
  type TxCUD,
  TxProcessor
} from '@hcengineering/core'
import activity, { type OptionID, type Poll, type VotePollAction } from '@hcengineering/activity'
import { hashQuizAnswerServer } from '@hcengineering/server-activity'

import type Cache from './cache'
import config from './config'
import { type Client } from './types'

/**
 * Main entry point: handles incoming poll vote actions (submitting and retracting votes).
 */
export async function VotePollHandler (tx: TxCUD<VotePollAction>, client: Client, cache: Cache): Promise<TxCUD<Doc>[]> {
  console.log('[VotePollHandler] Incoming transaction:', tx)

  if (tx._class !== core.class.TxCreateDoc) {
    console.log('[VotePollHandler] Ignored: tx._class is not TxCreateDoc:', tx._class)
    return []
  }

  const action = TxProcessor.createDoc2Doc(tx as TxCreateDoc<VotePollAction>)
  const poll = await cache.getPoll(action.attachedTo)
  if (poll == null) {
    console.log('[VotePollHandler] Ignored: Poll not found in cache for attachedTo:', action.attachedTo)
    return []
  }

  const now = Date.now()
  if (!isPollActive(poll, now)) {
    console.log('[VotePollHandler] Ignored: Poll is inactive at now:', now, {
      startAt: poll.startAt,
      endAt: poll.endAt
    })
    return []
  }

  const isRetract = action.retract === true
  const selectedOptions = action.options ?? []
  const isAnonymous = poll.anonymous === true
  const isQuiz = poll.quiz === true

  console.log('[VotePollHandler] Processing vote action:', {
    pollId: poll._id,
    account: action.account,
    space: action.space,
    isRetract,
    selectedOptions,
    isAnonymous,
    isQuiz
  })

  if (isAnonymous) {
    return await handleAnonymousPoll(action, client, cache, poll, isRetract, selectedOptions)
  }

  if (isQuiz) {
    return await handleQuizPoll(action, client, cache, poll, isRetract, selectedOptions, now)
  }

  return handlePublicPoll(action, client, poll, isRetract, selectedOptions, now)
}

/**
 * Handles voting and retraction for Anonymous polls.
 * Voter identity is tracked exclusively via PollAnswer documents in user's space.
 */
async function handleAnonymousPoll (
  action: VotePollAction,
  client: Client,
  cache: Cache,
  poll: Poll,
  isRetract: boolean,
  selectedOptions: OptionID[]
): Promise<TxCUD<Doc>[]> {
  const existingAnswer = await cache.getPollAnswer(poll._id, action.space)

  if (isRetract) {
    if (existingAnswer == null) {
      console.log('[handleAnonymousPoll] Retract failed: no existing PollAnswer found in space:', action.space)
      return []
    }
    const removeAnswerTx = client.txFactory.createTxRemoveDoc(
      activity.class.PollAnswer,
      existingAnswer.space,
      existingAnswer._id
    )

    const newData = retractAnonymousVoteData(poll, existingAnswer.options)
    const result = [removeAnswerTx, createPollUpdateTx(client, poll, newData)]
    console.log('[handleAnonymousPoll] Retract success: generated transactions:', result)
    return result
  }

  if (existingAnswer != null) {
    console.log(
      '[handleAnonymousPoll] Vote failed: user already has PollAnswer in space:',
      action.space,
      existingAnswer
    )
    return []
  }

  if (!isValidVoteSelection(poll, selectedOptions)) {
    console.log('[handleAnonymousPoll] Vote failed: invalid option selection:', selectedOptions)
    return []
  }

  const quizAnswer = findQuizAnswer(poll)
  const createAnswerTx = client.txFactory.createTxCreateDoc(activity.class.PollAnswer, action.space, {
    attachedTo: poll._id,
    options: selectedOptions,
    quizAnswer
  })

  const newData = applyAnonymousVoteData(poll, selectedOptions)
  const result = [createAnswerTx, createPollUpdateTx(client, poll, newData)]
  console.log('[handleAnonymousPoll] Vote success: generated transactions:', result)
  return result
}

/**
 * Handles voting and retraction for Non-Anonymous Quiz polls.
 * Tracks user account in userVotes array AND creates PollAnswer with revealed quiz answer.
 */
async function handleQuizPoll (
  action: VotePollAction,
  client: Client,
  cache: Cache,
  poll: Poll,
  isRetract: boolean,
  selectedOptions: OptionID[],
  now: Timestamp
): Promise<TxCUD<Doc>[]> {
  const userVotes = poll.userVotes ?? []
  const existingVoteIndex = userVotes.findIndex((v) => v.account === action.account)
  const hasVoted = existingVoteIndex !== -1

  const existingAnswer = await cache.getPollAnswer(poll._id, action.space)

  if (isRetract) {
    if (!hasVoted) {
      console.log('[handleQuizPoll] Retract failed: user account has not voted in userVotes:', action.account)
      return []
    }

    const txes: TxCUD<Doc>[] = []

    if (existingAnswer != null) {
      const removeAnswerTx = client.txFactory.createTxRemoveDoc(
        activity.class.PollAnswer,
        existingAnswer.space,
        existingAnswer._id
      )
      txes.push(removeAnswerTx)
    }

    const newData = retractPublicVoteData(poll, existingVoteIndex)
    txes.push(createPollUpdateTx(client, poll, newData))

    console.log('[handleQuizPoll] Retract success: generated transactions:', txes)
    return txes
  }

  if (hasVoted) {
    console.log('[handleQuizPoll] Vote failed: user account has already voted in userVotes:', action.account)
    return []
  }

  if (!isValidVoteSelection(poll, selectedOptions)) {
    console.log('[handleQuizPoll] Vote failed: invalid option selection:', selectedOptions)
    return []
  }

  const createAnswerTx = client.txFactory.createTxCreateDoc(activity.class.PollAnswer, action.space, {
    attachedTo: poll._id,
    options: selectedOptions,
    quizAnswer: findQuizAnswer(poll)
  })

  const newData = applyPublicVoteData(poll, action.account, selectedOptions, now)
  const result = [createAnswerTx, createPollUpdateTx(client, poll, newData)]
  console.log('[handleQuizPoll] Vote success: generated transactions:', result)
  return result
}

/**
 * Handles voting and retraction for Standard Public polls.
 * Tracks user account in userVotes array without PollAnswer documents.
 */
function handlePublicPoll (
  action: VotePollAction,
  client: Client,
  poll: Poll,
  isRetract: boolean,
  selectedOptions: OptionID[],
  now: Timestamp
): TxCUD<Doc>[] {
  const userVotes = poll.userVotes ?? []
  const existingVoteIndex = userVotes.findIndex((v) => v.account === action.account)
  const hasVoted = existingVoteIndex !== -1

  if (isRetract) {
    if (!hasVoted) {
      console.log('[handlePublicPoll] Retract failed: user account has not voted in userVotes:', action.account)
      return []
    }
    const newData = retractPublicVoteData(poll, existingVoteIndex)
    const result = [createPollUpdateTx(client, poll, newData)]
    console.log('[handlePublicPoll] Retract success: generated transactions:', result)
    return result
  }

  if (hasVoted) {
    console.log('[handlePublicPoll] Vote failed: user account has already voted in userVotes:', action.account)
    return []
  }

  if (!isValidVoteSelection(poll, selectedOptions)) {
    console.log('[handlePublicPoll] Vote failed: invalid option selection:', selectedOptions)
    return []
  }

  const newData = applyPublicVoteData(poll, action.account, selectedOptions, now)
  const result = [createPollUpdateTx(client, poll, newData)]
  console.log('[handlePublicPoll] Vote success: generated transactions:', result)
  return result
}

/**
 * Checks if the poll is active within the allowed time window.
 */
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

/**
 * Validates selected options (non-empty, no duplicates, existing option IDs, mode check).
 */
function isValidVoteSelection (poll: Poll, selectedOptions: OptionID[]): boolean {
  if (selectedOptions.length === 0) {
    console.log('[isValidVoteSelection] Rejected: selectedOptions is empty')
    return false
  }

  if (new Set(selectedOptions).size !== selectedOptions.length) {
    console.log('[isValidVoteSelection] Rejected: duplicate option IDs in selectedOptions:', selectedOptions)
    return false
  }

  const validOptions = new Set((poll.options ?? []).map((o) => o.id))
  if (!selectedOptions.every((id) => validOptions.has(id))) {
    console.log('[isValidVoteSelection] Rejected: option ID not in poll options:', {
      selectedOptions,
      validOptionIds: Array.from(validOptions)
    })
    return false
  }

  if (poll.mode === 'single' && selectedOptions.length !== 1) {
    console.log('[isValidVoteSelection] Rejected: mode single requires 1 option, got:', selectedOptions.length)
    return false
  }

  return true
}

/**
 * Resolves the correct option ID for Quiz mode polls using server quiz hash verification.
 */
function findQuizAnswer (poll: Poll): OptionID | undefined {
  if (poll.quiz !== true) {
    return undefined
  }
  const hash = poll.quizAnswerHash
  if (hash == null || hash === '') {
    return undefined
  }
  const options = poll.options ?? []
  const correctOption = options.find((opt) => hashQuizAnswerServer(poll._id, opt.id, config.QuizSecret) === hash)
  return correctOption?.id
}

/**
 * Updates poll data tallies when an anonymous vote is applied.
 */
function applyAnonymousVoteData (poll: Poll, selectedOptions: OptionID[]): Partial<Poll> {
  const votes: Record<string, number> = { ...(poll.votes ?? {}) }

  for (const optId of selectedOptions) {
    votes[optId] = (votes[optId] ?? 0) + 1
  }

  const totalVotes = (poll.totalVotes ?? 0) + 1

  return {
    totalVotes,
    votes,
    userVotes: []
  }
}

/**
 * Updates poll data tallies when an anonymous vote is retracted.
 */
function retractAnonymousVoteData (poll: Poll, votedOptions: OptionID[]): Partial<Poll> {
  const votes: Record<string, number> = { ...(poll.votes ?? {}) }

  for (const optId of votedOptions) {
    votes[optId] = Math.max(0, (votes[optId] ?? 0) - 1)
  }

  const totalVotes = Math.max(0, (poll.totalVotes ?? 0) - 1)

  return {
    totalVotes,
    votes,
    userVotes: []
  }
}

/**
 * Updates poll data tallies when a public vote is applied.
 */
function applyPublicVoteData (
  poll: Poll,
  account: AccountUuid,
  selectedOptions: OptionID[],
  now: number
): Partial<Poll> {
  const userVotes = [...(poll.userVotes ?? [])]
  const votes: Record<string, number> = { ...(poll.votes ?? {}) }

  for (const optId of selectedOptions) {
    votes[optId] = (votes[optId] ?? 0) + 1
  }

  userVotes.push({
    account,
    options: selectedOptions.map((id) => ({ id, votedAt: now }))
  })

  const totalVotes = (poll.totalVotes ?? 0) + 1

  return {
    totalVotes,
    votes,
    userVotes
  }
}

/**
 * Updates poll data tallies when a public vote is retracted.
 */
function retractPublicVoteData (poll: Poll, existingVoteIndex: number): Partial<Poll> {
  const userVotes = [...(poll.userVotes ?? [])]
  const votes: Record<string, number> = { ...(poll.votes ?? {}) }

  const removedVote = userVotes[existingVoteIndex]
  if (removedVote != null) {
    userVotes.splice(existingVoteIndex, 1)
    for (const opt of removedVote.options) {
      votes[opt.id] = Math.max(0, (votes[opt.id] ?? 0) - 1)
    }
  }

  const totalVotes = Math.max(0, (poll.totalVotes ?? 0) - 1)

  return {
    totalVotes,
    votes,
    userVotes
  }
}

/**
 * Constructs an update transaction for the poll applet instance with new data.
 */
function createPollUpdateTx (client: Client, poll: Poll, newData: Partial<Poll>): TxCUD<Doc> {
  return client.txFactory.createTxUpdateDoc(activity.class.AppletInstance, poll.space, poll._id, newData)
}
