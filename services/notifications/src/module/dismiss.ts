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

import { Timestamp } from '@hcengineering/core'
import {
  DocNotifyContext,
  isNativePushEndpoint,
  isUnreadMessageId,
  QueueDismissMessage,
  UnreadMessage
} from '@hcengineering/notification'

import Cache from '../cache'
import { Client, Result } from '../types'
import { cancelLetters } from '../heldLetter'

/** What a read takes down from the phone: the pushes a dismiss names. */
export interface DismissScope {
  // The tags of the pushes to take down: notified messages, reactions, mentions, commons read.
  tags: string[]
  // The newest moment the read of messages covers (chunks have no ids); zero: only the tags.
  readUpTo: Timestamp
}

export function dismissScopeOf (
  read: UnreadMessage[],
  readPosition: Timestamp,
  // Notifications whose push was still held and is cancelled now: it never reached the phone.
  cancelled: ReadonlySet<string> = new Set()
): DismissScope {
  const tags: string[] = []
  let notified = false
  for (const unread of read) {
    if (isUnreadMessageId(unread)) {
      if (unread.notified === true && !cancelled.has(unread.id)) tags.push(unread.id)
    } else if ((unread.notifiedCount ?? 0) > 0) {
      notified = true
    }
  }
  return { tags, readUpTo: tags.length > 0 || notified ? readPosition : 0 }
}

/** The mention cards about these messages: a mention in a message is a notification of its own. */
export function mentionIdsOf (context: DocNotifyContext, messageIds: string[]): string[] {
  return (context.latestNotifications ?? [])
    .filter((it) => it.type === 'mention' && it.messageId != null && messageIds.includes(it.messageId))
    .map((it) => it.id)
}

/** Drops the pushes and letters still waiting for what was read; returns the ids of the pushes dropped. */
export function cancelHeldPushes (
  client: Client,
  result: Result,
  context: DocNotifyContext,
  readUpTo: Timestamp,
  notificationIds: string[] = []
): Set<string> {
  const cancelled = new Set<string>()
  if (readUpTo > 0) {
    for (const id of client.pendingPush?.cancelByObject(context.user, context.objectId, readUpTo) ?? []) {
      cancelled.add(id)
    }
  }
  for (const id of notificationIds) {
    if (client.pendingPush?.cancel(context.user, id) === true) cancelled.add(id)
  }
  cancelLetters(result, context.user, notificationIds)
  return cancelled
}

/** Tells the native apps to take down what was pushed; nothing without a native subscription or without a push out. */
export async function pushDismissMessage (
  cache: Cache,
  result: Result,
  context: DocNotifyContext,
  read: DismissScope
): Promise<void> {
  if (read.readUpTo === 0 && read.tags.length === 0) return
  const subscriptions = (await cache.getPushSubscriptions(context.user)).filter((it) =>
    isNativePushEndpoint(it.endpoint)
  )
  if (subscriptions.length === 0) return

  // A push payload is 4 KB: a long list of tags goes in several messages, each with the same readUpTo.
  const chunks: string[][] = []
  for (let i = 0; i < Math.max(read.tags.length, 1); i += DISMISS_TAGS_PER_MESSAGE) {
    chunks.push(read.tags.slice(i, i + DISMISS_TAGS_PER_MESSAGE))
  }
  for (const tags of chunks) {
    const message: QueueDismissMessage = {
      kind: 'dismiss',
      id:
        read.readUpTo > 0
          ? `dismiss:${context._id}:${read.readUpTo}${tags === chunks[0] ? '' : `:${tags[0]}`}`
          : `dismiss:${context._id}:${tags[0]}`,
      account: context.user,
      objectId: context.objectId,
      objectClass: context.objectClass,
      objectSpace: context.objectSpace,
      pushSubscriptions: subscriptions,
      tags,
      readUpTo: read.readUpTo
    }
    result.queueMessages.push(message)
  }
}

export const DISMISS_TAGS_PER_MESSAGE = 50
