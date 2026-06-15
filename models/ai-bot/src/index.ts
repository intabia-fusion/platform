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

import { type AccountUuid } from '@hcengineering/core'
import { type AIPersonalData } from '@hcengineering/ai-bot'
import { type Builder, Model, Prop, TypeString } from '@hcengineering/model'
import core from '@hcengineering/model-core'
import preference, { TPreference } from '@hcengineering/model-preference'

import aiBot from './plugin'

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

export function createModel (builder: Builder): void {
  builder.createModel(TAIPersonalData)
}
