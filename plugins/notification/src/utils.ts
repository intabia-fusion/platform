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

import { Hierarchy, Ref } from '@hcengineering/core'
import { ActivityMessage } from '@hcengineering/activity'

import {
  ContextNotification,
  DocNotifyContext,
  NotificationIntl,
  UnreadMessage,
  UnreadMessageChunk,
  UnreadMessageId
} from './types'
import { translate } from '@hcengineering/platform'

export function getUnreadMessageCount (
  _contexts?: Pick<DocNotifyContext, 'unreadMessages'> | Array<Pick<DocNotifyContext, 'unreadMessages'>>
): number {
  if (_contexts == null) return 0
  const contexts = Array.isArray(_contexts) ? _contexts : [_contexts]

  return contexts
    .flatMap((it) => it.unreadMessages)
    .reduce((acc, it) => acc + (isUnreadMessageChunk(it) ? it.count : 1), 0)
}

export function isUnreadMessageId (unread: UnreadMessage | undefined): unread is UnreadMessageId {
  if (unread == null) return false
  return 'id' in unread && 'createdOn' in unread
}

export function isUnreadMessageChunk (unread: UnreadMessage | undefined): unread is UnreadMessageChunk {
  if (unread == null) return false
  return 'from' in unread && 'to' in unread && 'count' in unread
}

export function getNotificationMessageId (inboxNotification: ContextNotification): Ref<ActivityMessage> | undefined {
  if (inboxNotification.type === 'common') return undefined
  return inboxNotification.messageId
}

export function getNotificationThreadId (
  inboxNotification: ContextNotification,
  hierarchy: Hierarchy
): Ref<ActivityMessage> | undefined {
  // TODO: FIXME

  // if (!hierarchy.isDerived(inboxNotification._class, notification.class.ActivityInboxNotification)) return undefined
  //
  // const activityNotification = inboxNotification as ActivityInboxNotification
  //
  // if (
  //   hierarchy.isDerived(activityNotification.attachedToClass, activity.class.ActivityMessage) &&
  //   hierarchy.isDerived(activityNotification.objectClass, activity.class.ActivityMessage)
  // ) {
  //   return activityNotification.objectId as Ref<ActivityMessage>
  // }
  return undefined
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
