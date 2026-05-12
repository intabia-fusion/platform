import notification, { ContextNotification, DocNotifyContext, UnreadMessage } from '@hcengineering/notification'
import { Class, Doc, Ref, Space, Timestamp } from '@hcengineering/core'
import { Receiver } from '@hcengineering/server-notification'

import { Client, Result } from '../types'

interface CreateNotificationData {
  objectId: Ref<Doc>
  objectClass: Ref<Class<Doc>>
  objectSpace: Ref<Space>

  notification: ContextNotification

  unreadMessage?: UnreadMessage
  reaction?: any
  mention?: any
  common?: any

  receiver: Receiver
  modifiedOn: Timestamp
}

export function pushNotification (
  client: Client,
  result: Result,
  context: DocNotifyContext | undefined,
  data: CreateNotificationData
): void {
  const {
    unreadMessage,
    notification: _notification,
    reaction,
    common,
    mention,
    receiver,
    objectId,
    objectClass,
    objectSpace
  } = data
  const { txFactory } = client
  const modifiedOn = Math.max(context?.lastNotify ?? 0, data.modifiedOn)

  if (context != null) {
    const updateTx = result.updateContextTx.find((it) => it.objectId === context._id)
    if (updateTx != null) {
      updateTx.operations.unread = true
      updateTx.operations.lastNotify = modifiedOn
      updateTx.operations.archived = false
    } else {
      result.updateContextTx.push(
        txFactory.createTxUpdateDoc(context._class, context.space, context._id, {
          unread: true,
          archived: false,
          lastNotify: modifiedOn
        })
      )
    }

    const updateOpTx = txFactory.createTxUpdateDoc(context._class, context.space, context._id, {
      $push: { latestNotifications: { $each: [_notification], $position: 0, $slice: 5 } }
    })
    if (unreadMessage != null) {
      updateOpTx.operations.$push = {
        ...updateOpTx.operations.$push,
        unreadMessages: unreadMessage
      }
      updateOpTx.operations.$inc = {
        ...updateOpTx.operations.$inc,
        unreadMessagesCount: 1
      }
    } else if (reaction != null) {
      updateOpTx.operations.$push = {
        ...updateOpTx.operations.$push,
        unreadReactions: reaction
      }
    } else if (mention != null) {
      updateOpTx.operations.$push = {
        ...updateOpTx.operations.$push,
        unreadMentions: mention
      }
    } else if (common != null) {
      updateOpTx.operations.$push = {
        ...updateOpTx.operations.$push,
        unreadCommons: common
      }
    }

    result.updateContextOpTx.push(updateOpTx)
  } else {
    const currentCreateTx = result.createContextTx.find((it) => it.attributes.user === receiver.account)
    const createContextTx =
      currentCreateTx ??
      client.txFactory.createTxCreateDoc(notification.class.DocNotifyContext, receiver.space, {
        user: receiver.account,
        objectId,
        objectClass,
        objectSpace,
        unread: true,
        archived: false,
        unreadMessagesCount: 0,
        latestNotifications: [],
        unreadReactions: [],
        unreadMentions: [],
        unreadCommons: [],
        unreadMessages: [],
        lastNotify: modifiedOn
      })

    const attrs = createContextTx.attributes
    attrs.unread = true
    attrs.lastNotify = Math.max(attrs.lastNotify ?? 0, modifiedOn)
    if (unreadMessage != null) {
      const currentUnread = attrs.unreadMessages ?? []
      attrs.unreadMessages = [...currentUnread, unreadMessage]
      attrs.unreadMessagesCount = (attrs.unreadMessagesCount ?? 0) + 1
    } else if (reaction != null) {
      attrs.unreadReactions = [...(attrs.unreadReactions ?? []), reaction]
    } else if (mention != null) {
      attrs.unreadMentions = [...(attrs.unreadMentions ?? []), mention]
    } else if (common != null) {
      attrs.unreadCommons = [...(attrs.unreadCommons ?? []), common]
    }

    if (currentCreateTx == null) {
      result.createContextTx.push(createContextTx)
    }
  }
}
