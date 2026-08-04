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
  type AppletInstance,
  type CreateAppletClient,
  type CreatePollParams,
  type Poll,
  type PollOption,
  type AppletCreateFn
} from '@hcengineering/activity'
import { getCurrentEmployeeSpace } from '@hcengineering/contact'
import {
  type Class,
  type Doc,
  generateId,
  getCurrentAccount,
  type Ref,
  type Space,
  type TxOperations
} from '@hcengineering/core'

export function getPollTitle (poll: Poll): string {
  return poll.question ?? ''
}

export function getPollSummary (poll: Poll): string {
  const question = poll.question ?? ''
  const votes = poll.totalVotes ?? 0
  return `📊 ${question} (${votes})`
}

export const createPoll: AppletCreateFn<CreatePollParams> = async (
  client: CreateAppletClient,
  attachedTo: Ref<Doc>,
  attachedToClass: Ref<Class<Doc>>,
  space: Ref<Space>,
  params: CreatePollParams
): Promise<Ref<AppletInstance>> => {
  const instanceId = generateId<Poll>()

  const pollAttributes = {
    applet: activity.applet.Poll,
    mode: params.mode ?? 'single',
    anonymous: params.anonymous ?? false,
    quiz: params.quiz ?? false,
    question: params.question,
    options: params.options,
    quizAnswer: params.quizAnswer,
    startAt: params.startAt,
    endAt: params.endAt,
    totalVotes: 0,
    votes: {}
  }

  console.log(activity.class.AppletInstance, space, attachedTo, attachedToClass, 'applets', pollAttributes, instanceId)
  await client.addCollection(
    activity.class.AppletInstance,
    space,
    attachedTo,
    attachedToClass,
    'applets',
    pollAttributes,
    instanceId
  )

  return instanceId
}

/**
 * Submit votes for a Poll.
 * @public
 */
export async function votePoll (client: TxOperations, poll: Poll, selectedOptions: PollOption[]): Promise<void> {
  if (selectedOptions.length === 0 || poll == null) return

  await client.createDoc(activity.class.VotePollAction, getCurrentEmployeeSpace(), {
    account: getCurrentAccount().uuid,
    attachedTo: poll._id,
    options: selectedOptions.map((it) => it.id)
  })
}

/**
 * Retract current user's vote from a Poll.
 * @public
 */
export async function retractPollVote (client: TxOperations, poll: Poll): Promise<void> {
  if (poll == null) return

  await client.createDoc(activity.class.VotePollAction, getCurrentEmployeeSpace(), {
    account: getCurrentAccount().uuid,
    attachedTo: poll._id,
    options: [],
    retract: true
  })
}
