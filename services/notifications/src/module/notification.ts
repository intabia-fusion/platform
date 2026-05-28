//
// Copyright © 2026 Intabia Fusion Inc.
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
  ContextNotification,
  DocNotifyContext,
  NotificationProvider,
  NotificationType,
  UnreadMessage,
  UnreadReaction,
  NotificationIntl,
  CommonNotification,
  UnreadMention
} from '@hcengineering/notification'
import { Class, Doc, Ref, Space } from '@hcengineering/core'
import { Receiver } from '@hcengineering/server-notification'

import { Client, ObjectDisplayData, NotifyProviders, Result } from '../types'
import { getCreateContextTx, getUpdateContextTx } from '../utils'

interface CreateNotificationData {
  objectId: Ref<Doc>
  objectClass: Ref<Class<Doc>>
  objectSpace: Ref<Space>

  objectDisplayData: ObjectDisplayData

  notifyProviders: NotifyProviders
  notification: ContextNotification
  intl: NotificationIntl

  unreadMessage?: UnreadMessage
  unreadReaction?: UnreadReaction
  unreadMention?: UnreadMention
  unreadCommon?: CommonNotification

  receiver: Receiver
}

export function pushNotification (
  client: Client,
  result: Result,
  context: DocNotifyContext | undefined,
  data: CreateNotificationData
): void {
  const {
    notification,
    unreadMessage,
    unreadReaction,
    unreadCommon,
    unreadMention,
    receiver,
    objectId,
    objectClass,
    objectSpace,
    notifyProviders,
    intl,
    objectDisplayData
  } = data
  const { txFactory } = client
  const modifiedOn = Math.max(context?.lastNotify ?? 0, data.notification.createdOn)
  const providers: Record<Ref<NotificationProvider>, Ref<NotificationType>[]> = Object.fromEntries(
    Object.entries(notifyProviders).map(([provider, types]) => [provider, types.map((it) => it._id)])
  ) as Record<Ref<NotificationProvider>, Ref<NotificationType>[]>

  result.queueMessages.push({
    ...intl,
    // TODO: fill
    title: '',
    body: '',
    language: receiver.language,
    account: receiver.account,
    providers,
    objectId,
    objectClass,
    objectSpace,
    createdOn: data.notification.createdOn
  })
  if (context != null) {
    const updateTx = getUpdateContextTx(context, result, txFactory)
    updateTx.operations.lastNotify = Math.max(modifiedOn, updateTx.operations.lastNotify ?? 0)

    const updateOpTx = txFactory.createTxUpdateDoc(context._class, context.space, context._id, {
      $push: { latestNotifications: { $each: [notification], $position: 0, $slice: 5 } },
      $inc: { unreadCount: 1 }
    })
    if (unreadMessage != null) {
      updateOpTx.operations.$push = {
        ...updateOpTx.operations.$push,
        unreadMessages: unreadMessage
      }
    } else if (unreadReaction != null) {
      updateOpTx.operations.$push = {
        ...updateOpTx.operations.$push,
        unreadReactions: unreadReaction
      }
    } else if (unreadMention != null) {
      updateOpTx.operations.$push = {
        ...updateOpTx.operations.$push,
        unreadMentions: unreadMention
      }
    } else if (unreadCommon != null) {
      updateOpTx.operations.$push = {
        ...updateOpTx.operations.$push,
        unreadCommons: unreadCommon
      }
    }

    result.updateOpContextTx.push(updateOpTx)
  } else {
    const createTx = getCreateContextTx(
      objectId,
      objectClass,
      objectSpace,
      receiver,
      result,
      client.txFactory,
      objectDisplayData
    )

    createTx.attributes.lastNotify = Math.max(createTx.attributes.lastNotify ?? 0, modifiedOn)
    createTx.attributes.latestNotifications = [notification, ...createTx.attributes.latestNotifications].slice(0, 5)
    createTx.attributes.unreadCount = (createTx.attributes.unreadCount ?? 0) + 1
    if (unreadMessage != null) {
      const currentUnread = createTx.attributes.unreadMessages ?? []
      createTx.attributes.unreadMessages = [...currentUnread, unreadMessage]
    } else if (unreadReaction != null) {
      createTx.attributes.unreadReactions = [...(createTx.attributes.unreadReactions ?? []), unreadReaction]
    } else if (unreadMention != null) {
      createTx.attributes.unreadMentions = [...(createTx.attributes.unreadMentions ?? []), unreadMention]
    } else if (unreadCommon != null) {
      createTx.attributes.unreadCommons = [...(createTx.attributes.unreadCommons ?? []), unreadCommon]
    }
  }
}
