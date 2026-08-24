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
import chunter, {
  type ChatMessage,
  createAndGetDirect,
  type DirectMessage,
  type ThreadMessage
} from '@hcengineering/chunter'
import aiBot, { type AIContextMessage } from '@hcengineering/ai-bot'
import contact from '@hcengineering/contact'
import { getClient } from '@hcengineering/presentation'
import { jsonToMarkup } from '@hcengineering/text'
import { markdownToMarkup } from '@hcengineering/text-markdown'
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
export async function getBotAccount (): Promise<AccountUuid | undefined> {
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

/** Posts a top-level message in the user's Direct with the bot; the server trigger replies in a thread under it. */
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

  // Convert markdown to Markup with refUrl='ref://' so the origin link parses as a reference node.
  const md = origin !== undefined ? `${originMention(origin)}\n\n${message}` : message
  const body: Markup = jsonToMarkup(markdownToMarkup(md, { refUrl: 'ref://', imageUrl: '' }))

  // With origin: AIContextMessage, so the trigger recognizes the thread starter and skips a top-level reply.
  const messageId =
    origin !== undefined
      ? await client.addCollection<DirectMessage, AIContextMessage>(
        aiBot.class.AIContextMessage,
        direct._id,
        direct._id,
        chunter.class.DirectMessage,
        'messages',
        { message: body, objectId: origin.objectId, objectClass: origin.objectClass, direct: direct._id }
      )
      : await client.addCollection<DirectMessage, ChatMessage>(
        chunter.class.ChatMessage,
        direct._id,
        direct._id,
        chunter.class.DirectMessage,
        'messages',
        { message: body }
      )

  return { direct, messageId }
}

/**
 * Start (or continue) the assistant conversation behind the create-issue dialog. The thread is an
 * ordinary Direct conversation with the bot, tagged `purpose: 'issue-draft'` so history views can
 * tell assistant sessions from plain discussions. Nothing is hidden and nothing is deleted: the
 * dialog links the created issue back via `resultId`.
 */
export async function startIssueDraftConversation (
  message: Markup,
  origin: ConversationOrigin
): Promise<StartedConversation | undefined> {
  const me = getCurrentAccount().uuid
  const botAccount = await getBotAccount()
  if (botAccount === undefined) return undefined

  const client = getClient()
  const direct = await createAndGetDirect(client, [me, botAccount])
  if (direct === undefined) return undefined

  const messageId = await client.addCollection<DirectMessage, AIContextMessage>(
    aiBot.class.AIContextMessage,
    direct._id,
    direct._id,
    chunter.class.DirectMessage,
    'messages',
    {
      message,
      objectId: origin.objectId,
      objectClass: origin.objectClass,
      direct: direct._id,
      purpose: 'issue-draft'
    }
  )

  return { direct, messageId }
}

/**
 * Post a follow-up into an existing conversation thread; the bot replies in the same thread.
 * `objectId`/`objectClass` point at the Direct, not at the root message — the server trigger
 * routes on them, and anything else means the bot never sees the message.
 */
export async function postToConversation (
  root: StartedConversation,
  message: Markup
): Promise<Ref<ChatMessage> | undefined> {
  const client = getClient()
  return await client.addCollection<ChatMessage, ThreadMessage>(
    chunter.class.ThreadMessage,
    root.direct._id,
    root.messageId,
    aiBot.class.AIContextMessage,
    'replies',
    { message, objectId: root.direct._id, objectClass: chunter.class.DirectMessage }
  )
}

/**
 * Store the working state the conversation is about (e.g. the issue draft being edited). It goes
 * into a field, not into the message body: the model reads it every turn, people never see it.
 */
export async function updateConversationContext (root: StartedConversation, workingContext: string): Promise<void> {
  const client = getClient()
  await client.updateDoc<AIContextMessage>(
    aiBot.class.AIContextMessage,
    root.direct._id,
    root.messageId as Ref<AIContextMessage>,
    { workingContext }
  )
}

/** Archive a conversation root: the pod and the UI both skip archived roots, so the next one starts clean. */
export async function archiveConversation (root: StartedConversation): Promise<void> {
  const client = getClient()
  await client.updateDoc<AIContextMessage>(
    aiBot.class.AIContextMessage,
    root.direct._id,
    root.messageId as Ref<AIContextMessage>,
    { archived: true }
  )
}

/**
 * Hand the drafting conversation over to the issue it produced: the root points at that issue and
 * loses its draft purpose, so it becomes the object's ordinary "discuss with the assistant" thread -
 * pressing that button on the issue reopens this conversation, history and all.
 */
export async function linkConversationResult (
  root: StartedConversation,
  result: { id: Ref<Doc>, class: Ref<Class<Doc>>, label: string }
): Promise<void> {
  const client = getClient()
  const mention = originMention({ objectId: result.id, objectClass: result.class, label: result.label })
  const message = jsonToMarkup(markdownToMarkup(mention, { refUrl: 'ref://', imageUrl: '' }))
  await client.updateDoc<AIContextMessage>(
    aiBot.class.AIContextMessage,
    root.direct._id,
    root.messageId as Ref<AIContextMessage>,
    {
      resultId: result.id,
      objectId: result.id,
      objectClass: result.class,
      message,
      // Draft rules no longer apply: the issue exists, so the thread gets the full toolset back.
      $unset: { purpose: 1, workingContext: 1 }
    } as any
  )
}

/** Reopen a conversation by its root message; undefined when it is gone or was archived. */
export async function resumeConversation (messageId: Ref<ChatMessage>): Promise<StartedConversation | undefined> {
  const client = getClient()
  const root = await client.findOne(aiBot.class.AIContextMessage, { _id: messageId as Ref<AIContextMessage> })
  if (root === undefined || root.archived === true) return undefined
  const direct = await client.findOne(chunter.class.DirectMessage, { _id: root.direct as Ref<DirectMessage> })
  if (direct === undefined) return undefined
  return { direct, messageId }
}

/** The current user's existing object-linked conversation for an object, if any. */
export async function findObjectConversation (objectId: Ref<Doc>): Promise<AIContextMessage | undefined> {
  const client = getClient()
  const me = getCurrentAccount().uuid
  const botAccount = await getBotAccount()
  if (botAccount === undefined) return undefined
  // Resolve the user's Direct with the bot first and query within it: a plain findAll by
  // objectId can miss messages whose space is not in the active liveQuery subscription.
  const direct = await createAndGetDirect(client, [me, botAccount])
  if (direct === undefined) return undefined
  // Only the live (non-archived) context: the button always lands in the current one, never a
  // context the user explicitly reset away from.
  const contexts = await client.findAll(aiBot.class.AIContextMessage, {
    space: direct._id,
    objectId,
    archived: { $ne: true }
  })
  return contexts[0]
}

/** Archives the current root conversation for an object and starts a fresh one with the same origin. */
export async function resetObjectConversation (
  root: AIContextMessage,
  firstMessage: Markup
): Promise<StartedConversation | undefined> {
  const client = getClient()
  await client.updateDoc<AIContextMessage>(root._class, root.space, root._id, { archived: true })
  return await startAIConversation(firstMessage, {
    objectId: root.objectId,
    objectClass: root.objectClass,
    label: ''
  })
}

/**
 * Open the object-linked conversation with the bot, reusing the existing one when present.
 * Returns the root message + its Direct so the caller can open the thread in the sidebar.
 */
export async function openOrStartObjectConversation (
  origin: ConversationOrigin,
  firstMessage: Markup
): Promise<StartedConversation | undefined> {
  const existing = await findObjectConversation(origin.objectId)
  if (existing !== undefined) {
    const client = getClient()
    const direct = await client.findOne(chunter.class.DirectMessage, { _id: existing.direct as Ref<DirectMessage> })
    if (direct !== undefined) {
      return { direct, messageId: existing._id }
    }
  }
  return await startAIConversation(firstMessage, origin)
}
