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

import {
  type AccountUuid,
  buildSocialIdString,
  type Class,
  type Doc,
  type Markup,
  type Ref,
  type Space,
  type Timestamp,
  SocialIdType
} from '@hcengineering/core'
import type { IntlString, Metadata, Plugin, Resource } from '@hcengineering/platform'
import { plugin } from '@hcengineering/platform'
import type { Preference } from '@hcengineering/preference'
import type { AnyComponent } from '@hcengineering/ui/src/types'
import type { AILevel } from './rest'

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

/** Lifecycle of a queued AI request, surfaced to the user for status/ETA. */
export type AIRequestStatus = 'queued' | 'processing' | 'done' | 'failed'

/**
 * Status document for one AI request. Lives in the user's PersonSpace so both the
 * user and the system can see it. The pod creates it on enqueue and updates it as
 * the request moves through the pipeline; the UI shows progress and ETA from it.
 */
export interface AIRequest extends Doc {
  status: AIRequestStatus
  level: AILevel
  modelId: string
  kind: string // 'chat' | 'text-op' | ... (request category)
  promptTokens: number
  completionTokens: number
  billedTokens: number // (prompt+completion) * model.tokenMultiplier
  estimatedFinishAt?: Timestamp
  error?: string
}

/**
 * Per-space (or workspace-wide when attachedTo is unset) AI settings.
 * - `level`: the AI level ceiling; a request carries its own requested level and the
 *   server trigger clamps it to this ceiling. NOT a Space mixin.
 * - `language`: language for the bot's non-personal replies (summary, translate,
 *   limit notices). Falls back to the pod's AI_DEFAULT_LANGUAGE env when unset.
 */
export interface AISpaceSettings extends Doc {
  attachedTo?: Ref<Space> // undefined = workspace-wide settings
  level: AILevel
  language?: string
}

/** Optional link back to the object that started an AI conversation. */
export interface ConversationOrigin {
  objectId: Ref<Doc>
  objectClass: Ref<Class<Doc>>
  label: string
}

/** Signature of the reusable "start a conversation with the bot" function resource. */
export type StartAIConversationFn = (
  message: Markup,
  origin?: ConversationOrigin
) => Promise<{ direct: Ref<Doc>, messageId: Ref<Doc> } | undefined>

const aiBot = plugin(aiBotId, {
  metadata: {
    EndpointURL: '' as Metadata<string>
  },
  class: {
    AIPersonalData: '' as Ref<Class<AIPersonalData>>,
    AIRequest: '' as Ref<Class<AIRequest>>,
    AISpaceSettings: '' as Ref<Class<AISpaceSettings>>
  },
  component: {
    AIPersonalDataSettings: '' as AnyComponent
  },
  function: {
    StartAIConversation: '' as Resource<StartAIConversationFn>
  },
  string: {
    AISettings: '' as IntlString,
    AssistantMemory: '' as IntlString,
    UserMemory: '' as IntlString,
    SharedContext: '' as IntlString,
    AssistantMemoryHint: '' as IntlString,
    UserMemoryHint: '' as IntlString,
    SharedContextHint: '' as IntlString,
    ClearAll: '' as IntlString
  }
})

export default aiBot
