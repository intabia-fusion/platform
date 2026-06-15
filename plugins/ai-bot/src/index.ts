//
// Copyright © 2024-2025 Hardcore Engineering Inc.
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

import { type AccountUuid, buildSocialIdString, type Class, type Ref, SocialIdType } from '@hcengineering/core'
import type { Metadata, Plugin } from '@hcengineering/platform'
import { plugin } from '@hcengineering/platform'
import type { Preference } from '@hcengineering/preference'

export * from './rest'

export const aiBotId = 'ai-bot' as Plugin

export const aiBotAccountEmail = 'huly.ai.bot@hc.engineering'
export const aiBotEmailSocialKey = buildSocialIdString({
  type: SocialIdType.EMAIL,
  value: aiBotAccountEmail
})

/**
 * Per-user AI assistant memory, stored as a Preference owned by the user.
 * The ai-bot writes it on the user's behalf; the user sees and edits it in settings.
 */
export interface AIPersonalData extends Preference {
  attachedTo: AccountUuid // the user this memory belongs to
  assistantMemory: string // about the assistant: name, behavior, how to address the user
  userMemory: string // about the user: preferences, context, personal info
  sharedContext: string // language, timezone, group-chat preferences
}

const aiBot = plugin(aiBotId, {
  metadata: {
    EndpointURL: '' as Metadata<string>
  },
  class: {
    AIPersonalData: '' as Ref<Class<AIPersonalData>>
  }
})

export default aiBot
