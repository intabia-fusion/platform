//
// Copyright © 2024 Hardcore Engineering Inc.
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

import { AccountRole, type AccountUuid, type Domain, type Ref, type Space, type Timestamp } from '@hcengineering/core'
import {
  type AILevel,
  type AISpaceSettings,
  type AIPersonalData,
  type AIRequest,
  type AIRequestStatus
} from '@hcengineering/ai-bot'
import { type Builder, Model, Prop, TypeNumber, TypeRef, TypeString, TypeTimestamp } from '@hcengineering/model'
import core, { TDoc } from '@hcengineering/model-core'
import preference, { TPreference } from '@hcengineering/model-preference'
import setting from '@hcengineering/setting'
import view from '@hcengineering/model-view'

import aiBot from './plugin'

/** Domain for AI request status documents. */
export const DOMAIN_AI = 'ai' as Domain

export { aiBotId } from '@hcengineering/ai-bot'
export { aiBotOperation } from './migration'
export default aiBot

@Model(aiBot.class.AIPersonalData, preference.class.Preference)
export class TAIPersonalData extends TPreference implements AIPersonalData {
  declare attachedTo: AccountUuid

  @Prop(TypeString(), core.string.String)
    assistantMemory!: string

  @Prop(TypeString(), core.string.String)
    userMemory!: string

  @Prop(TypeString(), core.string.String)
    sharedContext!: string
}

@Model(aiBot.class.AIRequest, core.class.Doc, DOMAIN_AI)
export class TAIRequest extends TDoc implements AIRequest {
  @Prop(TypeString(), core.string.String)
    status!: AIRequestStatus

  @Prop(TypeString(), core.string.String)
    level!: AILevel

  @Prop(TypeString(), core.string.String)
    modelId!: string

  @Prop(TypeString(), core.string.String)
    kind!: string

  @Prop(TypeNumber(), core.string.Number)
    promptTokens!: number

  @Prop(TypeNumber(), core.string.Number)
    completionTokens!: number

  @Prop(TypeNumber(), core.string.Number)
    billedTokens!: number

  @Prop(TypeTimestamp(), core.string.Timestamp)
    estimatedFinishAt?: Timestamp

  @Prop(TypeString(), core.string.String)
    error?: string
}

@Model(aiBot.class.AISpaceSettings, core.class.Doc, DOMAIN_AI)
export class TAISpaceSettings extends TDoc implements AISpaceSettings {
  @Prop(TypeRef(core.class.Space), core.string.Space)
    attachedTo?: Ref<Space>

  @Prop(TypeString(), core.string.String)
    level!: AILevel

  @Prop(TypeString(), core.string.String)
    language?: string
}

export function createModel (builder: Builder): void {
  builder.createModel(TAIPersonalData, TAIRequest, TAISpaceSettings)

  builder.createDoc(setting.class.SettingsCategory, core.space.Model, {
    name: 'ai-personal-data',
    label: aiBot.string.AISettings,
    icon: view.icon.AiStar,
    component: aiBot.component.AIPersonalDataSettings,
    group: 'settings-account',
    role: AccountRole.Guest,
    order: 1700
  })
}
