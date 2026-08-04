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
  type OptionID,
  type Poll,
  type PollAnswer,
  type PollOption,
  type UserVote,
  type VotePollAction
} from '@hcengineering/activity'
import core, { type AccountUuid, DOMAIN_TRANSIENT, type Domain, type Ref, type Timestamp } from '@hcengineering/core'
import {
  ArrOf,
  Hidden,
  Model,
  Prop,
  ReadOnly,
  TypeBoolean,
  TypeNumber,
  TypeRecord,
  TypeRef,
  TypeString
} from '@hcengineering/model'
import { TDoc } from '@hcengineering/model-core'
import { type PersonSpace } from '@hcengineering/contact'
import { TAppletInstance } from './applet'

export const DOMAIN_POLL = 'poll' as Domain

@Model(activity.class.Poll, activity.class.AppletInstance, DOMAIN_POLL)
export class TPoll extends TAppletInstance implements Poll {
  @Prop(TypeString(), activity.string.QuizMode)
  @ReadOnly()
    mode!: 'single' | 'multiple'

  @Prop(TypeBoolean(), activity.string.AnonymousVoting)
  @ReadOnly()
    anonymous?: boolean

  @Prop(TypeBoolean(), activity.string.Quiz)
  @ReadOnly()
    quiz?: boolean

  @Prop(TypeString(), activity.string.Question)
    question!: string

  @Prop(ArrOf(TypeRecord()), activity.string.PollOptions)
    options!: PollOption[]

  @Prop(TypeString(), activity.string.Option)
    quizAnswer?: OptionID

  @Prop(TypeString(), activity.string.Option)
  @Hidden()
    quizAnswerHash?: string

  @Prop(TypeNumber(), activity.string.StartsAt)
    startAt?: Timestamp

  @Prop(TypeNumber(), activity.string.EndsAt)
    endAt?: Timestamp

  @Prop(TypeNumber(), activity.string.VotesCount, { automationOnly: true })
    totalVotes!: number

  @Prop(TypeRecord(), activity.string.PollResults, { automationOnly: true })
    votes!: Record<OptionID, number>

  @Prop(ArrOf(TypeRecord()), activity.string.VotedParticipants, { automationOnly: true })
    userVotes?: UserVote[]
}

@Model(activity.class.PollAnswer, core.class.Doc, DOMAIN_POLL)
export class TPollAnswer extends TDoc implements PollAnswer {
  declare space: Ref<PersonSpace>

  @Prop(TypeRef(activity.class.AppletInstance), activity.string.Applet)
    attachedTo!: Ref<AppletInstance>

  @Prop(ArrOf(TypeString()), activity.string.Options)
    options!: OptionID[]

  @Prop(TypeString(), activity.string.Option)
    quizAnswer?: OptionID
}

@Model(activity.class.VotePollAction, core.class.Doc, DOMAIN_TRANSIENT)
export class TVotePollAction extends TDoc implements VotePollAction {
  account!: AccountUuid
  declare space: Ref<PersonSpace>
  @Prop(TypeRef(activity.class.AppletInstance), core.string.AttachedTo)
    attachedTo!: Ref<AppletInstance>

  @Prop(ArrOf(TypeString()), activity.string.Options)
    options!: OptionID[]

  @Prop(TypeBoolean(), activity.string.RetractVote)
    retract?: boolean
}
