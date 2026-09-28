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
  // Ids of the notified messages read, plus the reactions, mentions and commons read: the tags
  // of the pushes to take down.
  tags: string[]
  // The newest timestamp covered by the read of messages, chunks included; zero when no
  // notified message was read, and then only the tags are dismissed.
  readUpTo: Timestamp
}

/**
 * Chunks carry no ids, only a range, so a read that clears them is described by its timestamp;
 * the devices take down every push about the document up to it.
 */
export function dismissScopeOf (read: UnreadMessage[], readPosition: Timestamp): DismissScope {
  const tags: string[] = []
  let notified = false
  for (const unread of read) {
    if (isUnreadMessageId(unread)) {
      if (unread.notified === true) tags.push(unread.id)
    } else if ((unread.notifiedCount ?? 0) > 0) {
      notified = true
    }
  }
  return { tags, readUpTo: tags.length > 0 || notified ? readPosition : 0 }
}

/**
 * The person read the document up to `readUpTo` and the listed notifications: pushes and letters
 * still waiting for that are not needed. A letter is cancelled by id only (chunks name none;
 * the check when it fires covers those).
 */
export function cancelHeldPushes (
  client: Client,
  result: Result,
  context: DocNotifyContext,
  readUpTo: Timestamp,
  notificationIds: string[] = []
): void {
  if (readUpTo > 0) client.pendingPush?.cancelByObject(context.user, context.objectId, readUpTo)
  for (const id of notificationIds) client.pendingPush?.cancel(context.user, id)
  cancelLetters(result, context.user, notificationIds)
}

/**
 * The person read the document elsewhere: tell the native apps to take down what was pushed.
 * One message per context and read; nothing for an account without a native subscription,
 * and nothing when the read touched no notified message and named nothing (no push went out).
 */
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

  const message: QueueDismissMessage = {
    kind: 'dismiss',
    id: `dismiss:${context._id}:${read.readUpTo > 0 ? read.readUpTo : read.tags[0]}`,
    account: context.user,
    objectId: context.objectId,
    objectClass: context.objectClass,
    objectSpace: context.objectSpace,
    pushSubscriptions: subscriptions,
    tags: read.tags,
    readUpTo: read.readUpTo
  }
  result.queueMessages.push(message)
}
