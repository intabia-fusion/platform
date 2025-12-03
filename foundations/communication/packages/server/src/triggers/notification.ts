//
// Copyright © 2025 Hardcore Engineering Inc.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
//  you may not use this file except in compliance with the License. You may
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
  MessageEventType,
  NotificationEventType,
  type Event,
  UpdateNotificationContextEvent,
  RemovePatchEvent
} from '@hcengineering/communication-sdk-types'
import {
  NotificationType
} from '@hcengineering/communication-types'
import { groupByArray } from '@hcengineering/core'

import type { TriggerCtx, TriggerFn, Triggers } from '../types'

async function onNotificationContextUpdated (ctx: TriggerCtx, event: UpdateNotificationContextEvent): Promise<Event[]> {
  const { contextId, updates } = event
  const { lastView } = updates
  if (lastView == null) return []

  const context = (await ctx.client.db.findNotificationContexts({ id: contextId }))[0]
  if (context == null) return []
  const result: Event[] = []

  result.push({
    type: NotificationEventType.UpdateNotification,
    account: context.account,
    contextId: context.id,
    query: {
      type: NotificationType.Message,
      untilDate: context.lastView
    },
    updates: {
      read: true
    },
    date: event.date,
    socialId: event.socialId
  })

  return result
}

async function onMessagesRemoved (ctx: TriggerCtx, event: RemovePatchEvent): Promise<Event[]> {
  const notifications = await ctx.client.db.findNotifications({
    docClass: event.docClass,
    docId: event.docId,
    messageId: event.messageId
  })

  if (notifications.length === 0) return []

  const result: Event[] = []

  const byContextId = groupByArray(notifications, (it) => it.contextId)
  for (const [context, ns] of byContextId.entries()) {
    result.push({
      type: NotificationEventType.RemoveNotifications,
      contextId: context,
      account: ns[0].account,
      ids: notifications.map((it) => it.id),
      socialId: event.socialId,
      date: event.date
    })
  }

  return result
}

const triggers: Triggers = [
  [
    'on_notification_context_updated',
    NotificationEventType.UpdateNotificationContext,
    onNotificationContextUpdated as TriggerFn
  ],
  ['remove_notifications_on_messages_removed', MessageEventType.RemovePatch, onMessagesRemoved as TriggerFn]
]

export default triggers
