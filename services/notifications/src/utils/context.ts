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
  TxProcessor
} from '@hcengineering/core'
import { ActivityMessage, Reaction } from '@hcengineering/activity'
import notification, {
  CommonNotification,
  ContextNotification,
  DocNotificationMode,
  DocNotificationSetting,
  DocNotifyContext,
  MentionNotification,
  UnreadMention,
  UnreadMessage,
  UnreadReaction,
  getNotifiedMessagesTotal,
  getUnreadMessagesTotal,
  isUnreadMessageChunk,
  isUnreadMessageId
} from '@hcengineering/notification'
import { Receiver } from '@hcengineering/server-notification'

import { Client, ObjectDisplayData, Result } from '../types'
import type Cache from '../cache'

// ---- Notification presence checks ----

export function hasMessageNotification (context: DocNotifyContext, messageId: Ref<ActivityMessage>): boolean {
  return (context.latestNotifications ?? []).some((it) => it.type === 'message' && it.messageId === messageId)
}

export function hasReactionNotificationByMessage (context: DocNotifyContext, messageId: Ref<ActivityMessage>): boolean {
  return (context.latestNotifications ?? []).some((it) => it.type === 'reaction' && it.messageId === messageId)
}

export function hasMentionNotificationByMessage (context: DocNotifyContext, messageId: Ref<ActivityMessage>): boolean {
  return (context.latestNotifications ?? []).some((it) => it.type === 'mention' && it.messageId === messageId)
}

export function hasReactionNotification (context: DocNotifyContext, reactionId: Ref<Reaction>): boolean {
  return (context.latestNotifications ?? []).some((it) => it.type === 'reaction' && it.id === reactionId)
}

// ---- Unread state checks ----

export function hasUnreadReactionByMessage (context: DocNotifyContext, messageId: Ref<ActivityMessage>): boolean {
  return (context.unreadReactions ?? []).some((it) => it.attachedTo === messageId)
}

export function hasUnreadReaction (context: DocNotifyContext, reactionId: Ref<Reaction>): boolean {
  return (context.unreadReactions ?? []).some((it) => it.id === reactionId)
}

export function hasUnreadMentionByMessage (context: DocNotifyContext, messageId: Ref<ActivityMessage>): boolean {
  return (context.unreadMessages ?? []).some(
    (it) => isUnreadMessageId(it) && it.id === messageId && it.mentioned === true
  )
}

// A message is counted either by its own entry or, once collapsed, by a chunk covering its time.
export function hasUnreadMessage (
  context: DocNotifyContext,
  message: Ref<ActivityMessage> | { id: Ref<ActivityMessage>, createdOn: Timestamp }
): boolean {
  const messageId = typeof message === 'string' ? message : message.id
  const createdOn = typeof message === 'string' ? undefined : message.createdOn
  return (context.unreadMessages ?? []).some((it) =>
    isUnreadMessageId(it)
      ? String(it.id) === messageId
      : createdOn !== undefined && isUnreadMessageChunk(it) && it.from <= createdOn && createdOn <= it.to
  )
}

export function isNotificationRecorded (
  context: DocNotifyContext,
  data: {
    notification: ContextNotification
    unreadMessage?: UnreadMessage
    unreadReaction?: UnreadReaction
    unreadMention?: UnreadMention
    unreadCommon?: CommonNotification
  }
): boolean {
  const { notification, unreadMessage, unreadReaction, unreadMention, unreadCommon } = data
  if ((context.latestNotifications ?? []).some((it) => it.id === notification.id)) return true
  if (notification.type === 'mention') {
    if (notification.messageId != null) {
      if (hasMentionNotificationByMessage(context, notification.messageId)) return true
    } else if (
      // A document-level mention gets a fresh id on every pass; the tx time tells a redelivery apart.
      (context.latestNotifications ?? []).some(
        (it) => it.type === 'mention' && it.messageId == null && it.createdOn === notification.createdOn
      )
    ) {
      return true
    }
  }
  if (unreadMessage != null && isUnreadMessageId(unreadMessage) && hasUnreadMessage(context, unreadMessage)) return true
  if (unreadReaction != null && hasUnreadReaction(context, unreadReaction.id)) return true
  if (unreadMention != null && (context.unreadMentions ?? []).some((it) => it.id === unreadMention.id)) return true
  if (unreadCommon != null && (context.unreadCommons ?? []).some((it) => it.id === unreadCommon.id)) return true
  return false
}

// ---- Notification queries ----

export function getNotificationsByMessage (
  context: DocNotifyContext,
  messageId: Ref<ActivityMessage>
): ContextNotification[] {
  return (context.latestNotifications ?? []).filter((it) => it.type !== 'common' && it.messageId === messageId)
}

export function getMentionNotification (
  context: DocNotifyContext,
  messageId: Ref<ActivityMessage> | null
): MentionNotification | undefined {
  return (context.latestNotifications ?? []).find(
    (it) => it.type === 'mention' && (messageId != null ? it.messageId === messageId : it.messageId == null)
  ) as MentionNotification | undefined
}

// ---- Context state helpers ----

export function getLastNotify (context: DocNotifyContext): Timestamp {
  return Math.max(...(context.latestNotifications ?? []).map((it) => it.createdOn), 0)
}

export function getMode (docSettings: DocNotificationSetting[], account: AccountUuid): DocNotificationMode {
  return docSettings.find((it) => it.account === account)?.mode ?? 'all'
}

export function isMuted (mode: DocNotificationMode): boolean {
  return mode === 'mute'
}

// ---- Context transaction builders ----

/**
 * Creates a create tx for a new context in the result set.
 * Deduplicates by receiver account.
 */
export function getCreateContextTx (
  _id: Ref<DocNotifyContext>,
  objectId: Ref<Doc>,
  objectClass: Ref<Class<Doc>>,
  objectSpace: Ref<Space>,
  receiver: Receiver,
  result: Result,
  factory: TxFactory,
  display: ObjectDisplayData
): TxCreateDoc<DocNotifyContext> {
  const tx = factory.createTxCreateDoc(
    notification.class.DocNotifyContext,
    receiver.space,
    {
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
      unreadMessagesCount: 0,
      notifiedMessagesCount: 0,
      lastNotify: 0
    },
    _id
  )

  result.createContextTx.push(tx)
  return tx
}

// ---- Derived counters ----

/**
 * Keeps `unreadMessagesCount` and `notifiedMessagesCount` equal to the totals of `unreadMessages`
 * on every context write.
 * Called once per result, so every path that touches the array (push, collapse, read, remove) is
 * covered, and the value is absolute, so a redelivered tx cannot skew it.
 *
 * Also keeps `unreadCount` from going below zero: the column has a CHECK, and one drifted counter
 * would make the transactor reject the whole batch with everybody's notifications in it.
 */
export async function setUnreadMessagesCounts (result: Result, cache: Cache, client: Client): Promise<void> {
  for (const tx of result.createContextTx) {
    tx.attributes.unreadMessagesCount = getUnreadMessagesTotal(tx.attributes.unreadMessages ?? [])
    tx.attributes.notifiedMessagesCount = getNotifiedMessagesTotal(tx.attributes.unreadMessages ?? [])
  }

  const working = new Map<Ref<DocNotifyContext>, DocNotifyContext>()
  for (const tx of result.updateContextTx) {
    const ops = tx.operations
    const touched =
      ops.unreadMessages !== undefined ||
      ops.$push?.unreadMessages !== undefined ||
      ops.$pull?.unreadMessages !== undefined
    const decrements = (ops.$inc?.unreadCount ?? 0) < 0
    if (!touched && !decrements) continue

    let context = working.get(tx.objectId)
    if (context === undefined) {
      const current =
        cache.getCachedContext(tx.objectId) ??
        (await client.findOne(notification.class.DocNotifyContext, { _id: tx.objectId }))
      if (current === undefined) {
        client.ctx.warn('context not found, unreadMessagesCount left as is', { context: tx.objectId })
        continue
      }
      // A deep copy: the operations are replayed on it below, and the cached context must not see
      // them here (applyResult applies them once more, so shared arrays ended up with duplicates).
      context = structuredClone(current)
      working.set(tx.objectId, context)
    }
    TxProcessor.updateDoc2Doc(context, tx)
    if (touched) {
      ops.unreadMessagesCount = getUnreadMessagesTotal(context.unreadMessages ?? [])
      ops.notifiedMessagesCount = getNotifiedMessagesTotal(context.unreadMessages ?? [])
    }
    if (decrements && context.unreadCount < 0) {
      client.ctx.warn('unreadCount would go below zero, set to 0', { context: tx.objectId, value: context.unreadCount })
      const { unreadCount, ...inc } = ops.$inc ?? {}
      if (Object.keys(inc).length > 0) {
        ops.$inc = inc
      } else {
        delete ops.$inc
      }
      ops.unreadCount = 0
      context.unreadCount = 0
    }
  }
}
