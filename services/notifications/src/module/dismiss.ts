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

/** What a read takes out of `unreadMessages`, in the terms a dismiss needs. */
export interface ReadUnread {
  // Ids of the notified messages read: the tags of the pushes to take down.
  tags: string[]
  // The newest timestamp covered by the read, chunks included; zero when nothing notified was read.
  readUpTo: Timestamp
}

/**
 * Chunks carry no ids, only a range, so a read that clears them is described by its timestamp;
 * the devices take down every push about the document up to it.
 */
export function readUnread (read: UnreadMessage[], readPosition: Timestamp): ReadUnread {
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

/** The person read the document up to `readUpTo`: pushes still waiting for that are not needed. */
export function cancelHeldPushes (client: Client, context: DocNotifyContext, readUpTo: Timestamp): void {
  client.pendingPush?.cancelByObject(context.user, context.objectId, readUpTo)
}

/**
 * The person read the document elsewhere: tell the native apps to take down what was pushed.
 * One message per context and read; nothing for an account without a native subscription,
 * and nothing when the read touched no notified message (no push went out for it).
 */
export async function pushDismissMessage (
  cache: Cache,
  result: Result,
  context: DocNotifyContext,
  read: ReadUnread
): Promise<void> {
  if (read.readUpTo === 0) return
  const subscriptions = (await cache.getPushSubscriptions(context.user)).filter((it) =>
    isNativePushEndpoint(it.endpoint)
  )
  if (subscriptions.length === 0) return

  const message: QueueDismissMessage = {
    kind: 'dismiss',
    id: `dismiss:${context._id}:${read.readUpTo}`,
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
