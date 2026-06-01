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

import notificationPlugin, {
  ContextNotification,
  DocNotifyContext,
  NotificationProvider,
  NotificationType,
  UnreadMessage,
  UnreadReaction,
  NotificationIntl,
  CommonNotification,
  UnreadMention,
  PushSubscription,
  getNotificationMessageId,
  translateNotification
} from '@hcengineering/notification'
import { Class, Doc, Ref, Space } from '@hcengineering/core'
import { Receiver } from '@hcengineering/server-notification'
import { ActivityMessage } from '@hcengineering/activity'

import { Client, ObjectDisplayData, NotifyProviders, Result } from '../types'
import {
  getCreateContextTx,
  getUpdateContextTx,
  getNotificationUrl,
  getDomain,
  getNotificationLocation
} from '../utils/utils'

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
  pushSubscriptions: PushSubscription[]
}

export async function pushNotification (
  client: Client,
  result: Result,
  context: DocNotifyContext | undefined,
  data: CreateNotificationData
): Promise<void> {
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
    objectDisplayData,
    pushSubscriptions
  } = data
  const { txFactory } = client
  const modifiedOn = Math.max(context?.lastNotify ?? 0, data.notification.createdOn)
  const providers: Record<Ref<NotificationProvider>, Ref<NotificationType>[]> = Object.fromEntries(
    Object.entries(notifyProviders).map(([provider, types]) => [provider, types.map((it) => it._id)])
  ) as Record<Ref<NotificationProvider>, Ref<NotificationType>[]>

  const { title, body } = await translateNotification(intl, receiver.language)
  const domain = getDomain(client)
  const url = getNotificationUrl(client, notification, objectId, objectClass)

  result.queueMessages.push({
    ...intl,
    id: notification.id,
    title,
    body,
    url,
    domain,
    pushSubscriptions,
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

  createAppPushNotification(client, result, data)
}

function createAppPushNotification (
  client: Client,
  result: Result,
  data: CreateNotificationData
): void {
  const { txFactory } = client
  const { notification, notifyProviders, objectId, objectClass, receiver, intl } = data
  const shouldPush = (notifyProviders[notificationPlugin.providers.PushNotificationProvider]?.length ?? 0) > 0

  if (shouldPush) {
    const messageId: Ref<ActivityMessage> | undefined = getNotificationMessageId(notification)
    const { path, query } = getNotificationLocation(client, notification, objectId, objectClass)

    const soundAlert = (notifyProviders[notificationPlugin.providers.SoundNotificationProvider]?.length ?? 0) > 0

    const appNotificationTx = txFactory.createTxCreateDoc(notificationPlugin.class.AppNotification, receiver.space, {
      account: receiver.account,
      title: intl.titleIntl,
      body: intl.bodyIntl,
      intlParams: intl.intlParams,
      intlParamsNotLocalized: intl.intlParamsNotLocalized,
      sender: notification.createdBy,
      tag: notification.id,
      objectId,
      objectClass,
      messageId,
      onClickLocation: {
        path,
        query
      },
      soundAlert
    })

    result.createAppNotificationTx.push(appNotificationTx)
  }
}
