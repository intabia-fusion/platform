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

/**
 * Identifier of a poll option.
 * @public
 */
export type OptionID = string

/**
 * Option entry in a Poll.
 * @public
 */
export interface PollOption {
  id: OptionID
  label: string
}

/**
 * User vote record in a public Poll.
 * @public
 */
export interface UserVote {
  account: AccountUuid
  options: { id: OptionID, votedAt: Timestamp }[]
}

/**
 * Static configuration parameters set at creation defining Poll rules and modes.
 * @public
 */
export interface PollStaticConfig {
  mode?: 'single' | 'multiple'
  anonymous?: boolean
  quiz?: boolean
}

/**
 * Dynamic content and payload of a Poll.
 * @public
 */
export interface PollDynamicConfig {
  question: string
  options: PollOption[]

  /**
   * Plaintext correct option ID.
   * Omitted prior to voting to prevent cheating. Populated only when the poll has ended.
   */
  quizAnswer?: OptionID

  /**
   * Salted hash of the correct option ID.
   * Stored prior to voting for secure client/server verification without exposing answer.
   */
  quizAnswerHash?: string

  startAt?: Timestamp
  endAt?: Timestamp
}

/**
 * Runtime vote tallies, option counters, and user response data.
 * @public
 */
export interface PollData {
  totalVotes: number
  votes: Record<OptionID, number>
  userVotes?: UserVote[]
}

/**
 * Interactive Poll Applet Instance.
 * @public
 */
export interface Poll extends AppletInstance {
  mode: 'single' | 'multiple'
  anonymous?: boolean
  quiz?: boolean

  question: string
  options: PollOption[]
  quizAnswer?: OptionID
  quizAnswerHash?: string

  startAt?: Timestamp
  endAt?: Timestamp

  totalVotes: number
  votes: Record<OptionID, number>
  userVotes?: UserVote[]
}

/**
 * User Poll Answer stored in employee space.
 * @public
 */
export interface PollAnswer extends Doc<PersonSpace> {
  attachedTo: Ref<AppletInstance>
  options: OptionID[]

  /** Correct option ID revealed by the server trigger after voting (for Quiz mode) */
  quizAnswer?: OptionID
}

/**
 * Transient vote action sent to server transactor stream for public polls.
 * @public
 */
export interface VotePollAction extends Doc<PersonSpace> {
  account: AccountUuid
  attachedTo: Ref<AppletInstance>
  options: OptionID[]
  retract?: boolean
}

/**
 * Creation parameters passed to createPoll.
 * @public
 */
export interface CreatePollParams {
  question: string
  options: PollOption[]
  mode?: 'single' | 'multiple'
  anonymous?: boolean
  quiz?: boolean
  quizAnswer?: OptionID
  startAt?: Timestamp
  endAt?: Timestamp
}
