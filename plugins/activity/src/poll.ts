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

import type { AccountUuid, Doc, Ref, Timestamp } from '@hcengineering/core'
import type { PersonSpace } from '@hcengineering/contact'

import type { AppletInstance } from './applet'

export type OptionID = string

export const pollLimits = { maxOptions: 10, maxQuestionLength: 300, maxOptionLength: 100 }

export interface PollOption {
  id: OptionID
  label: string
}

export interface UserVote {
  account: AccountUuid
  options: OptionID[]
}

export interface Poll extends AppletInstance {
  mode: 'single' | 'multiple'
  anonymous?: boolean
  quiz?: boolean
  /** A voter may retract the vote and vote again; otherwise the first vote is final */
  revote?: boolean

  question: string
  options: PollOption[]
  /** Correct option of a quiz: the server strips it on create and writes it back after endAt */
  quizAnswer?: OptionID
  /** HMAC of the correct option, lets the activity service check answers without storing it */
  quizAnswerHash?: string

  startAt?: Timestamp
  endAt?: Timestamp

  totalVotes: number
  votes: Record<OptionID, number>
  userVotes?: UserVote[]
}

export interface PollAnswer extends Doc<PersonSpace> {
  attachedTo: Ref<AppletInstance>
  options: OptionID[]

  /** Correct option of a quiz, revealed to the voter by the activity service */
  quizAnswer?: OptionID
}

/** Transient, handled by the activity service */
export interface VotePollAction extends Doc<PersonSpace> {
  account: AccountUuid
  attachedTo: Ref<AppletInstance>
  options: OptionID[]
  retract?: boolean
  /** Asks to reveal the answer of an ended quiz */
  reveal?: boolean
}

export interface CreatePollParams {
  question: string
  options: PollOption[]
  mode?: 'single' | 'multiple'
  anonymous?: boolean
  quiz?: boolean
  revote?: boolean
  quizAnswer?: OptionID
  startAt?: Timestamp
  /** Start this long after sending, in place of startAt: a draft keeps it fresh */
  startDelay?: number
  endAt?: Timestamp
  /** End this long after the start, in place of endAt */
  duration?: number
}
