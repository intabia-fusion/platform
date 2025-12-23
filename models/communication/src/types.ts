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

import { ArrOf, type Builder, Mixin, Model, TypeRef } from '@hcengineering/model'
import core, { TAttachedDoc, TClass, TConfiguration, TDoc } from '@hcengineering/model-core'
import {
  AccountRole,
  type AccountUuid,
  type Class,
  type Doc,
  type Domain,
  DOMAIN_MODEL,
  type Ref
} from '@hcengineering/core'
import { type Asset, type IntlString } from '@hcengineering/platform'
import {
  type Applet,
  type MessageAction,
  type MessageActionFunctionResource,
  type MessageActionVisibilityTesterResource,
  type AppletCreateFnResource,
  type Poll,
  type CustomActivityPresenter,
  type GuestCommunicationSettings,
  type AppletGetTitleFnResource,
  type PollAnonymousAnswer,
  PollVotedOption,
  type OptionID,
  type Messageable
} from '@hcengineering/communication'
import { PaletteColorIndexes } from '@hcengineering/ui/src/colors'
import { type MessageID, type AppletType } from '@hcengineering/communication-types'
import { createSystemType } from '@hcengineering/model-card'
import type { AnyComponent } from '@hcengineering/ui'
import contact, { type PersonSpace } from '@hcengineering/contact'
import { DOMAIN_SETTING } from '@hcengineering/setting'
import view from '@hcengineering/model-view'

import communication from './plugin'
import { type Card } from '@hcengineering/card'

export const DOMAIN_POLL = 'poll' as Domain

@Model(communication.class.MessageAction, core.class.Doc, DOMAIN_MODEL)
class TMessageAction extends TDoc implements MessageAction {
  label!: IntlString
  icon!: Asset
  action!: MessageActionFunctionResource
  order!: number

  visibilityTester?: MessageActionVisibilityTesterResource
  menu?: boolean
}

@Model(communication.class.Applet, core.class.Doc, DOMAIN_MODEL)
class TApplet extends TDoc implements Applet {
  type!: AppletType
  icon!: Asset
  label!: IntlString
  component!: AnyComponent
  createLabel!: IntlString
  createComponent!: AnyComponent
  previewComponent!: AnyComponent
  getTitleFn!: AppletGetTitleFnResource
  createFn?: AppletCreateFnResource
}

@Model(communication.class.Poll, core.class.Doc, DOMAIN_POLL)
class TPoll extends TAttachedDoc implements Poll {
  docId!: Ref<Doc>
  docClass!: Ref<Class<Doc>>
  messageId!: MessageID

  question!: string
  totalVotes!: number;

  // Voted options count
  [key: OptionID]: number

  // Users votes for public poll
  [key: AccountUuid]: PollVotedOption[]
}

@Model(communication.class.PollAnonymousAnswer, core.class.Doc, DOMAIN_POLL)
class TPollAnonymousAnswer extends TAttachedDoc implements PollAnonymousAnswer {
  options!: PollVotedOption[]
  declare attachedTo: Ref<Poll>
  declare attachedToClass: Ref<Class<Poll>>
  declare space: Ref<PersonSpace>
}

@Model(communication.class.CustomActivityPresenter, core.class.Doc, DOMAIN_MODEL)
class TCustomActivityPresenter extends TDoc implements CustomActivityPresenter {
  attribute!: string
  component!: AnyComponent
  type!: Ref<Class<Doc>>
}

@Model(communication.class.GuestCommunicationSettings, core.class.Configuration, DOMAIN_SETTING)
export class TGuestCommunicationSettings extends TConfiguration implements GuestCommunicationSettings {
  allowedCards!: Ref<Card>[]
}

@Mixin(communication.mixin.Messageable, core.class.Class)
export class TMessageable extends TClass implements Messageable {}

export function buildTypes (builder: Builder): void {
  builder.createModel(
    TMessageAction,
    TApplet,
    TPoll,
    TPollAnonymousAnswer,
    TCustomActivityPresenter,
    TGuestCommunicationSettings,
    TMessageable
  )

  defineDirect(builder)
  defineThread(builder)
}

function defineThread (builder: Builder): void {
  createSystemType(
    builder,
    communication.type.Thread,
    communication.icon.Thread,
    communication.string.Thread,
    communication.string.Threads,
    {
      defaultSection: communication.ids.CardMessagesSection
    },
    PaletteColorIndexes.Houseplant
  )

  builder.mixin(communication.type.Thread, core.class.Class, core.mixin.TxAccessLevel, {
    updateAccessLevel: AccountRole.Guest
  })
}

function defineDirect (builder: Builder): void {
  createSystemType(
    builder,
    communication.type.Direct,
    contact.icon.Contacts,
    communication.string.Direct,
    communication.string.Directs,
    {
      defaultSection: communication.ids.CardMessagesSection
    },
    PaletteColorIndexes.Lavander
  )

  builder.createDoc(core.class.Attribute, core.space.Model, {
    name: 'members',
    readonly: true, // TODO: remove
    attributeOf: communication.type.Direct,
    type: ArrOf(TypeRef(contact.class.Person)),
    label: communication.string.Members
  })

  builder.mixin(communication.type.Direct, core.class.Class, view.mixin.ObjectIcon, {
    component: communication.component.DirectIcon
  })
  // builder.mixin(communication.type.Direct, core.class.Class, card.mixin.CreateCardExtension, {
  //   component: communication.component.CreateDirect,
  //   canCreate: communication.function.CanCreateDirect,
  //   disableTitle: true,
  //   hideSpace: true
  // })
  //
  // builder.mixin(communication.type.Direct, core.class.Class, view.mixin.IgnoreActions, {
  //   actions: [view.action.Delete, card.action.PublicLink]
  // })
}
