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

import { type AccountUuid, type Class, type Doc, getCurrentAccount, type Markup, type Ref } from '@hcengineering/core'
import chunter, { type ChatMessage, createAndGetDirect, type DirectMessage } from '@hcengineering/chunter'
import contact from '@hcengineering/contact'
import { getClient } from '@hcengineering/presentation'
import { get } from 'svelte/store'

import { aiBotSocialIdentityStore } from './utils'

/** Optional link back to the object that started the conversation. */
export interface ConversationOrigin {
  objectId: Ref<Doc>
  objectClass: Ref<Class<Doc>>
  label: string
}

export interface StartedConversation {
  direct: DirectMessage
  messageId: Ref<ChatMessage>
}

/** Resolve the AI bot's account uuid from its cached social identity. */
async function getBotAccount (): Promise<AccountUuid | undefined> {
  const identity = get(aiBotSocialIdentityStore)
  if (identity === undefined) return undefined
  const client = getClient()
  const person = await client.findOne(contact.class.Person, { _id: identity.attachedTo })
  return person?.personUuid as AccountUuid | undefined
}

/** Build a clickable reference-mention markdown to the origin object. */
function originMention (origin: ConversationOrigin): string {
  const cls = encodeURIComponent(origin.objectClass)
  const id = encodeURIComponent(origin.objectId)
  const label = encodeURIComponent(origin.label)
  return `[](ref://?_class=${cls}&_id=${id}&label=${label})`
}

/**
 * Start a new conversation with the AI bot in the user's Direct channel.
 *
 * Posts a top-level ChatMessage (= a new conversation); the server trigger makes
 * the bot reply in a thread under it. Returns the Direct and the new message id so
 * the caller can open the thread (see openThreadInSidebar in chunter-resources).
 *
 * Reusable across features (e.g. "discuss this task with Yulia"): pass the first
 * message and an optional origin link so the user can navigate back.
 */
export async function startAIConversation (
  message: Markup,
  origin?: ConversationOrigin
): Promise<StartedConversation | undefined> {
  const me = getCurrentAccount().uuid
  const botAccount = await getBotAccount()
  if (botAccount === undefined) return undefined

  const client = getClient()
  const direct = await createAndGetDirect(client, [me, botAccount])
  if (direct === undefined) return undefined

  const body: Markup = origin !== undefined ? `${originMention(origin)}\n\n${message}` : message

  const messageId = await client.addCollection<DirectMessage, ChatMessage>(
    chunter.class.ChatMessage,
    direct._id,
    direct._id,
    chunter.class.DirectMessage,
    'messages',
    { message: body }
  )

  return { direct, messageId }
}
