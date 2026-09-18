/**
 Copyright © 2026 Intabia Fusion.

 Licensed under the Eclipse Public License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License. You may
 obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.

 See the License for the specific language governing permissions and
 limitations under the License.
 */

import core, { type Class, type Doc, type Hierarchy, Markup, Ref } from '@hcengineering/core'
import activity, { ActivityMessage, type DocAttributeUpdates, type DocUpdateMessage } from '@hcengineering/activity'
import { translate } from '@hcengineering/platform'
import { jsonToMarkup, type MarkupNode, MarkupNodeType, markupToJSON } from '@hcengineering/text-core'

import {
  ContextNotification,
  DocNotifyContext,
  NotificationIntl,
  NotificationMessage,
  UnreadMessage,
  UnreadMessageChunk,
  UnreadMessageId
} from './types'

type UnreadCounted = Partial<Pick<DocNotifyContext, 'unreadMessages' | 'unreadMessagesCount'>>

export function getUnreadMessageCount (_contexts?: UnreadCounted | UnreadCounted[]): number {
  if (_contexts == null) return 0
  const contexts = Array.isArray(_contexts) ? _contexts : [_contexts]

  return contexts.reduce(
    (acc, it) => acc + (it.unreadMessagesCount ?? getUnreadMessagesTotal(it.unreadMessages ?? [])),
    0
  )
}

export function isUnreadMessageId (unread: UnreadMessage | undefined): unread is UnreadMessageId {
  if (unread == null) return false
  return 'id' in unread && 'createdOn' in unread
}

export function getUnreadMessagesTotal (unreadMessages: UnreadMessage[]): number {
  return unreadMessages.reduce((acc, it) => acc + (isUnreadMessageChunk(it) ? it.count : 1), 0)
}

export function isUnreadMessageChunk (unread: UnreadMessage | undefined): unread is UnreadMessageChunk {
  if (unread == null) return false
  return 'from' in unread && 'to' in unread && 'count' in unread
}

export function getNotificationMessageId (inboxNotification: ContextNotification): Ref<ActivityMessage> | undefined {
  if (inboxNotification.type === 'common') return undefined
  return inboxNotification.messageId
}

export const PUSH_NOTIFICATION_TITLE_SIZE = 80
export const PUSH_NOTIFICATION_BODY_SIZE = 150

export function truncate (text: string, limit: number): string {
  const trimmed = text.trim()
  return trimmed.length > limit ? trimmed.slice(0, limit) + '...' : trimmed
}

export async function translateNotification (
  intl: NotificationIntl,
  language: string
): Promise<{ title: string, body: string }> {
  const params = { ...intl.intlParams }
  if (intl.intlParamsNotLocalized != null) {
    for (const [key, val] of Object.entries(intl.intlParamsNotLocalized)) {
      params[key] = await translate(val, params, language)
    }
  }

  const title = await translate(intl.titleIntl, params, language)
  const body = await translate(intl.bodyIntl, params, language)

  return { title, body }
}

// ---- Embedded message compaction ----

/**
 * Stands in for the body of a text attribute inside an embedded notification message. The inbox
 * card only says that the field changed; the full activity feed loads the real message itself.
 * It has to be a non-empty string, an empty `set` reads as "unset" on the client.
 */
export const EMBEDDED_TEXT_PLACEHOLDER = '…'

// Resolved on use, not at import: test doubles of `@hcengineering/core` may not carry `class`.
function isTextAttributeType (typeClass: string | undefined): boolean {
  return typeClass === core.class.TypeMarkup || typeClass === core.class.TypeCollaborativeDoc
}

/**
 * True when the attribute update carries a markup or collaborative document body: the whole
 * document (and its previous version) travels in `set` / `prevValue`.
 */
export function isTextAttributeUpdate (
  hierarchy: Hierarchy,
  objectClass: Ref<Class<Doc>>,
  updates: DocAttributeUpdates
): boolean {
  let typeClass: string | undefined
  try {
    typeClass = hierarchy.findAttribute(objectClass, updates.attrKey)?.type?._class
  } catch {
    typeClass = undefined
  }
  return isTextAttributeType(typeClass ?? updates.attrClass)
}

export function isCompactAttributeUpdates (updates: DocAttributeUpdates): boolean {
  return (
    updates.set.every((value) => value == null || value === '' || value === EMBEDDED_TEXT_PLACEHOLDER) &&
    (updates.prevValue == null || updates.prevValue === '' || updates.prevValue === EMBEDDED_TEXT_PLACEHOLDER)
  )
}

export function compactAttributeUpdates (updates: DocAttributeUpdates): DocAttributeUpdates {
  return {
    ...updates,
    set: updates.set.map((value) => (value == null || value === '' ? value : EMBEDDED_TEXT_PLACEHOLDER)),
    prevValue: updates.prevValue == null || updates.prevValue === '' ? updates.prevValue : EMBEDDED_TEXT_PLACEHOLDER
  }
}

/**
 * The copy of an activity message that is embedded into a notification context: without the
 * per-message state the card does not show (edits, replies, reactions, pin) and without the bodies
 * of text attribute updates.
 */
export function compactNotificationMessage (message: ActivityMessage, hierarchy: Hierarchy): NotificationMessage {
  const { editedOn, replies, repliedPersons, reactions, isPinned, lastReply, ...lite } = message
  if (hierarchy.isDerived(message._class, activity.class.DocUpdateMessage)) {
    const dum = lite as DocUpdateMessage
    if (dum.attributeUpdates != null && isTextAttributeUpdate(hierarchy, dum.objectClass, dum.attributeUpdates)) {
      const compacted: DocUpdateMessage = { ...dum, attributeUpdates: compactAttributeUpdates(dum.attributeUpdates) }
      return compacted as NotificationMessage
    }
  }
  if (isOversizedChatMessage(lite)) {
    const excerpt = { ...lite, message: excerptMarkup((lite as any).message) }
    return excerpt as NotificationMessage
  }
  return lite as NotificationMessage
}

/**
 * A chat message longer than this (markup JSON, in characters) is embedded as a plain-text excerpt:
 * the card shows one line of it, the full message lives in the chat.
 */
export const EMBEDDED_MARKUP_LIMIT = 4096
export const EMBEDDED_EXCERPT_LENGTH = 1024

/**
 * A shortened copy of a markup document that keeps its formatting: nodes are kept in document
 * order (paragraphs, lists, headings, marks, mentions) until the text budget runs out, the last
 * text node is cut and an ellipsis marks the cut. Markup that does not parse is treated as text.
 */
export function excerptMarkup (markup: Markup, length: number = EMBEDDED_EXCERPT_LENGTH): Markup {
  // markupToJSON never throws: plain text becomes one paragraph, broken JSON an empty document.
  const doc = markupToJSON(markup)
  const budget = { left: length, cut: false, ellipsis: false }
  const result = truncateNode(doc, budget)
  if (budget.cut && !budget.ellipsis) {
    result.content = [...(result.content ?? []), textParagraph('…')]
  }
  return jsonToMarkup(result)
}

function truncateNode (node: MarkupNode, budget: { left: number, cut: boolean, ellipsis: boolean }): MarkupNode {
  if (node.type === MarkupNodeType.text) {
    const text = node.text ?? ''
    if (text.length <= budget.left) {
      budget.left -= text.length
      return node
    }
    budget.cut = true
    budget.ellipsis = true
    const cut = text.slice(0, budget.left).trimEnd() + '…'
    budget.left = 0
    return { ...node, text: cut }
  }
  if (node.content === undefined) {
    // A leaf without text (mention, image, hard break) costs one character so the budget still ends.
    budget.left -= 1
    return node
  }
  const content: MarkupNode[] = []
  for (const child of node.content) {
    if (budget.left <= 0) {
      budget.cut = true
      break
    }
    content.push(truncateNode(child, budget))
  }
  return { ...node, content }
}

function textParagraph (text: string): MarkupNode {
  return { type: MarkupNodeType.paragraph, content: [{ type: MarkupNodeType.text, text }] }
}

export function isOversizedMarkup (markup: unknown): markup is Markup {
  return typeof markup === 'string' && markup.length > EMBEDDED_MARKUP_LIMIT
}

/** A chat message whose body is embedded as an excerpt (`truncated` on the notification). */
export function isOversizedChatMessage (message: Partial<ActivityMessage>): boolean {
  return isOversizedMarkup((message as { message?: unknown }).message)
}

function hasTextAttributeBodies (hierarchy: Hierarchy, message: Partial<ActivityMessage>): boolean {
  if (message._class == null || !hierarchy.isDerived(message._class, activity.class.DocUpdateMessage)) return false
  const dum = message as unknown as DocUpdateMessage
  if (dum.attributeUpdates == null) return false
  return (
    isTextAttributeUpdate(hierarchy, dum.objectClass, dum.attributeUpdates) &&
    !isCompactAttributeUpdates(dum.attributeUpdates)
  )
}

/**
 * True when an embedded message still carries something the card never shows: a whole markup
 * body of a text attribute update, or a chat message beyond the excerpt limit.
 */
export function needsMessageCompaction (hierarchy: Hierarchy, message: Partial<ActivityMessage> | undefined): boolean {
  if (message == null) return false
  return isOversizedChatMessage(message) || hasTextAttributeBodies(hierarchy, message)
}
