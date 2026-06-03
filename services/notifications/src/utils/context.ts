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

import {
  AccountUuid,
  type Class,
  Doc,
  Ref,
  Space,
  Timestamp,
  TxCreateDoc,
  TxFactory,
  TxUpdateDoc
} from '@hcengineering/core'
import { ActivityMessage, Reaction } from '@hcengineering/activity'
import notification, {
  ContextNotification,
  DocNotificationMode,
  DocNotificationSetting,
  DocNotifyContext,
  MentionNotification,
  isUnreadMessageId
} from '@hcengineering/notification'
import { Receiver } from '@hcengineering/server-notification'

import { ObjectDisplayData, Result } from '../types'

// ---- Notification presence checks ----

export function hasMessageNotification (context: DocNotifyContext, messageId: Ref<ActivityMessage>): boolean {
  return context.latestNotifications.some((it) => it.type === 'message' && it.messageId === messageId)
}

export function hasReactionNotificationByMessage (context: DocNotifyContext, messageId: Ref<ActivityMessage>): boolean {
  return context.latestNotifications.some((it) => it.type === 'reaction' && it.messageId === messageId)
}

export function hasMentionNotificationByMessage (context: DocNotifyContext, messageId: Ref<ActivityMessage>): boolean {
  return context.latestNotifications.some((it) => it.type === 'mention' && it.messageId === messageId)
}

export function hasReactionNotification (context: DocNotifyContext, reactionId: Ref<Reaction>): boolean {
  return context.latestNotifications.some((it) => it.type === 'reaction' && it.id === reactionId)
}

// ---- Unread state checks ----

export function hasUnreadReactionByMessage (context: DocNotifyContext, messageId: Ref<ActivityMessage>): boolean {
  return context.unreadReactions.some((it) => it.attachedTo === messageId)
}

export function hasUnreadReaction (context: DocNotifyContext, reactionId: Ref<Reaction>): boolean {
  return context.unreadReactions.some((it) => it.id === reactionId)
}

export function hasUnreadMentionByMessage (context: DocNotifyContext, messageId: Ref<ActivityMessage>): boolean {
  return context.unreadMentions.some((it) => it.messageId === messageId)
}

export function hasUnreadMessage (context: DocNotifyContext, messageId: Ref<ActivityMessage>): boolean {
  return context.unreadMessages.some((it) => isUnreadMessageId(it) && it.id === messageId)
}

// ---- Notification queries ----

export function getNotificationsByMessage (
  context: DocNotifyContext,
  messageId: Ref<ActivityMessage>
 ): ContextNotification[] {
  return context.latestNotifications.filter((it) => it.type !== 'common' && it.messageId === messageId)
}

export function getMentionNotification (
  context: DocNotifyContext,
  messageId: Ref<ActivityMessage> | null
): MentionNotification | undefined {
  return context.latestNotifications.find(
    (it) => it.type === 'mention' && (messageId != null ? it.messageId === messageId : it.messageId == null)
  ) as MentionNotification | undefined
}

// ---- Context state helpers ----

export function getLastNotify (context: DocNotifyContext): Timestamp {
  return Math.max(...context.latestNotifications.map((it) => it.createdOn), 0)
}

export function getMode (docSettings: DocNotificationSetting[], account: AccountUuid): DocNotificationMode {
  return docSettings.find((it) => it.account === account)?.mode ?? 'all'
}

export function isMuted (mode: DocNotificationMode): boolean {
  return mode === 'mute'
}

// ---- Context transaction builders ----

/**
 * Returns (or creates) a plain update tx for a context in the result set.
 * Used for scalar field updates (e.g. lastNotify).
 */
export function getUpdateContextTx (
  context: DocNotifyContext,
  result: Result,
  factory: TxFactory
): TxUpdateDoc<DocNotifyContext> {
  const existing = result.updateContextTx.find((it) => it.objectId === context._id)
  if (existing != null) return existing

  const tx = factory.createTxUpdateDoc(context._class, context.space, context._id, {})
  result.updateContextTx.push(tx)

  return tx
}

/**
 * Returns (or creates) an operator update tx for a context in the result set.
 * Used for $push/$pull/$inc operations (e.g. latestNotifications, unreadCount).
 */
export function getUpdateOpContextTx (
  context: DocNotifyContext,
  result: Result,
  factory: TxFactory
): TxUpdateDoc<DocNotifyContext> {
  const existing = result.updateOpContextTx.find((it) => it.objectId === context._id)
  if (existing != null) return existing

  const tx = factory.createTxUpdateDoc(context._class, context.space, context._id, {})
  result.updateOpContextTx.push(tx)

  return tx
}

/**
 * Returns (or creates) a create tx for a new context in the result set.
 * Deduplicates by receiver account.
 */
export function getCreateContextTx (
  objectId: Ref<Doc>,
  objectClass: Ref<Class<Doc>>,
  objectSpace: Ref<Space>,
  receiver: Receiver,
  result: Result,
  factory: TxFactory,
  display: ObjectDisplayData
): TxCreateDoc<DocNotifyContext> {
  const existing = result.createContextTx.find((it) => it.attributes.user === receiver.account)
  if (existing != null) return existing

  const tx = factory.createTxCreateDoc(notification.class.DocNotifyContext, receiver.space, {
    ...display,
    user: receiver.account,
    objectId,
    objectClass,
    objectSpace,
    latestNotifications: [],
    unreadReactions: [],
    unreadMentions: [],
    unreadCommons: [],
    unreadMessages: [],
    unreadCount: 0,
    lastNotify: 0
  })

  result.createContextTx.push(tx)
  return tx
}
