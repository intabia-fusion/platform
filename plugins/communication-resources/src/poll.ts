// Copyright © 2025 Hardcore Engineering Inc.
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

import {
  type Data,
  type Doc,
  fillDefaults,
  generateId,
  getCurrentAccount,
  type Ref,
  type Timestamp
} from '@hcengineering/core'
import { type OptionID, type Poll, type PollAnonymousAnswer, type PollVotedOption } from '@hcengineering/communication'
import { getClient } from '@hcengineering/presentation'
import { type AppletAttachment, type MessageID } from '@hcengineering/communication-types'

import communication from './plugin'

// Poll configuration
export interface PollConfig {
  id: Ref<Poll>
  question: string
  options: PollOption[]
  mode: PollMode

  anonymous?: boolean
  quiz?: boolean
  quizAnswer?: string

  startAt?: Timestamp
  endAt?: Timestamp
}

export type PollMode = 'single' | 'multiple'

export interface PollOption {
  id: OptionID
  label: string
}

export function getEmptyPollConfig (): PollConfig {
  return {
    id: generateId<Poll>(),
    question: '',
    options: [
      {
        id: generateId() as any as OptionID,
        label: ''
      }
    ],
    mode: 'single',
    anonymous: false,
    quiz: false
  }
}

export async function createPoll (doc: Doc, message: MessageID, params: PollConfig): Promise<void> {
  const client = getClient()
  const hierarchy = client.getHierarchy()

  const data: Data<Poll> = {
    question: params.question,
    totalVotes: 0,
    docId: doc._id,
    docClass: doc._class,
    messageId: message
  }
  const filledData = fillDefaults(hierarchy, data, communication.class.Poll)

  await client.createDoc(communication.class.Poll, doc.space, filledData, params.id)
}

export function getPollTitle (attachment: AppletAttachment): string {
  const params = attachment.params as PollConfig
  return params.question
}

export function isVotedByMe (
  result: Poll | undefined,
  anonymous: boolean = false,
  answers: PollAnonymousAnswer[] = []
): boolean {
  if (result == null) return false
  if (anonymous) {
    return answers.some((it: PollAnonymousAnswer) => it.options.length > 0) ?? false
  }
  const me = getCurrentAccount()

  const myOptions: PollVotedOption[] = result[me.uuid] ?? []
  return myOptions.length > 0 || false
}
