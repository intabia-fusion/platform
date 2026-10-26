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

import activity, {
  type ActivityMessage,
  type AppletCreateFn,
  type AppletDraft,
  type AppletInstance,
  type CreateAppletClient,
  type CreatePollParams,
  type OptionID,
  type Poll,
  type PollOption,
  type VotePollAction
} from '@hcengineering/activity'
import { getCurrentEmployeeSpace } from '@hcengineering/contact'
import {
  type Class,
  generateId,
  getCurrentAccount,
  type Ref,
  type Space,
  type Timestamp,
  type TxOperations
} from '@hcengineering/core'

import { getPollTimeErrorFrom, resolvePollTimes } from './pollTime'

export function getPollTitle (poll: Poll): string {
  return poll.question ?? ''
}

export const createPoll: AppletCreateFn<CreatePollParams> = async (
  client: CreateAppletClient,
  attachedTo: Ref<ActivityMessage>,
  attachedToClass: Ref<Class<ActivityMessage>>,
  space: Ref<Space>,
  params: CreatePollParams
): Promise<Ref<AppletInstance>> => {
  const instanceId = generateId<Poll>()
  const { startAt, endAt } = resolvePollTimes(params, Date.now())

  await client.addCollection(
    activity.class.Poll,
    space,
    attachedTo,
    attachedToClass,
    'applets',
    {
      applet: activity.applet.Poll,
      mode: params.quiz === true ? 'single' : (params.mode ?? 'single'),
      anonymous: params.anonymous ?? false,
      quiz: params.quiz ?? false,
      // On unless the form turned it off; a quiz vote is final.
      revote: params.quiz !== true && params.revote !== false,
      question: params.question,
      options: params.options,
      quizAnswer: params.quiz === true ? params.quizAnswer : undefined,
      startAt,
      endAt,
      totalVotes: 0,
      votes: {}
    },
    instanceId
  )

  return instanceId
}

// Into the voter's own space: the middleware takes a vote from nowhere else.
async function sendVoteAction (
  client: TxOperations,
  poll: Poll,
  action: Pick<VotePollAction, 'options' | 'retract' | 'reveal'>
): Promise<void> {
  await client.createDoc(activity.class.VotePollAction, getCurrentEmployeeSpace(), {
    account: getCurrentAccount().uuid,
    attachedTo: poll._id,
    ...action
  })
}

// When a draft stops being sendable: the server would refuse its message, or post an ended poll.
export function getAppletDraftExpiry (draft: AppletDraft): Timestamp | undefined {
  return draft.appletId === activity.applet.Poll ? getPollTimeErrorFrom(draft.params as CreatePollParams) : undefined
}

export async function votePoll (client: TxOperations, poll: Poll, selectedOptions: PollOption[]): Promise<void> {
  if (selectedOptions.length === 0) return
  await sendVoteAction(client, poll, { options: selectedOptions.map((it) => it.id) })
}

export async function retractPollVote (client: TxOperations, poll: Poll): Promise<void> {
  await sendVoteAction(client, poll, { options: [], retract: true })
}

// Rounded per option: equal votes show equal percents, even when the sum is not 100.
export function getOptionPercent (poll: Poll, optionId: OptionID): number {
  const votes = poll.votes?.[optionId] ?? 0
  const total = poll.totalVotes ?? 0
  // A system import keeps its tallies as is, they may lack the total.
  if (votes === 0 || total <= 0) return 0
  return Math.round((votes / total) * 100)
}

// The client clock may run ahead of the service, which then refuses the reveal.
export const QUIZ_REVEAL_RETRY_MS = 30_000

// A quiz hashed with a since rotated secret never reveals, so the requests stop.
const QUIZ_REVEAL_MAX_ATTEMPTS = 10

const revealRequests = new Map<Ref<Poll>, { at: number, count: number }>()

export function canRequestQuizReveal (poll: Ref<Poll>): boolean {
  return (revealRequests.get(poll)?.count ?? 0) < QUIZ_REVEAL_MAX_ATTEMPTS
}

export async function requestQuizReveal (client: TxOperations, poll: Poll): Promise<void> {
  // Every rendered copy of the quiz asks, one request per retry period is enough.
  const last = revealRequests.get(poll._id)
  if (last != null && (Date.now() - last.at < QUIZ_REVEAL_RETRY_MS || !canRequestQuizReveal(poll._id))) {
    return
  }
  revealRequests.set(poll._id, { at: Date.now(), count: (last?.count ?? 0) + 1 })

  await sendVoteAction(client, poll, { options: [], reveal: true })
}
