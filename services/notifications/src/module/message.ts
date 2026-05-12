import core, { AccountUuid, TxCreateDoc, TxCUD, TxRemoveDoc, TxUpdateDoc, TxProcessor } from '@hcengineering/core'
import activity, { ActivityMessage, DocUpdateMessage } from '@hcengineering/activity'
import notification, { UnreadMessage } from '@hcengineering/notification'

import { getCollaboratorAccounts, getMessageNotifyResult } from '../utils'
import { Client, Result } from '../types'
import Cache from '../cache'
import { pushNotification } from './notification'

export async function handleMessage (
  client: Client,
  cache: Cache,
  result: Result,
  tx: TxCUD<ActivityMessage>
): Promise<void> {
  if (tx._class === core.class.TxCreateDoc) {
    await handleCreateMessage(client, cache, result, tx as TxCreateDoc<ActivityMessage>)
  } else if (tx._class === core.class.TxRemoveDoc) {
    await handleRemoveMessage(client, cache, result, tx as TxRemoveDoc<ActivityMessage>)
  } else if (tx._class === core.class.TxUpdateDoc) {
    await handleUpdateMessage(client, cache, result, tx as TxUpdateDoc<ActivityMessage>)
  }
}

export async function handleCreateMessage (
  client: Client,
  cache: Cache,
  result: Result,
  tx: TxCreateDoc<ActivityMessage>
): Promise<void> {
  const message = TxProcessor.createDoc2Doc(tx)

  const doc = await cache.getDoc(message.attachedTo, message.attachedToClass)
  if (doc === undefined) return

  const space = await cache.getDocSpace(doc)
  if (space === undefined) return

  const collaborators = await getCollaboratorAccounts(client, cache, doc, space)

  if (client.hierarchy.isDerived(message._class, activity.class.DocUpdateMessage)) {
    const dum = message as DocUpdateMessage

    if (dum.objectClass === core.class.Collaborator) {
      const acc = dum.objectAttributes?.collaborator as AccountUuid | undefined
      if (acc != null && !collaborators.includes(acc)) collaborators.push(acc)
    }
  }

  if (collaborators.length === 0) return

  const receivers = await cache.getReceivers(collaborators)
  if (receivers.length === 0) return

  const settings = await cache.getSettings()
  const contexts = await cache.getContexts(doc._id)
  const docSettings = await cache.getDocSettings(doc._id)
  const sender = await cache.getSender(message.modifiedBy)

  const unreadMessage: UnreadMessage = {
    _id: message._id,
    createdOn: message.createdOn ?? message.modifiedOn
  }

  for (const receiver of receivers) {
    if (receiver.account === sender.account) continue

    const settingDoc = docSettings.find((it) => it.account === receiver.account)
    const mode = settingDoc?.mode ?? 'all'
    if (mode === 'mute') continue

    const notifyResult = await getMessageNotifyResult(client, message, doc, receiver, settings, mode)

    const types = notifyResult[notification.providers.InboxNotificationProvider] ?? []
    const type = types[0]
    if (type == null) continue

    const context = contexts.find((it) => it.user === receiver.account)

    pushNotification(client, result, context, {
      unreadMessage,
      receiver,
      modifiedOn: message.createdOn ?? message.modifiedOn,
      objectId: doc._id,
      objectClass: doc._class,
      objectSpace: doc.space,
      notification: {
        id: message._id,
        type: 'message',
        message,
        createdOn: message.createdOn ?? message.modifiedOn,
        createdBy: message.createdBy ?? message.modifiedBy
      }
    })
  }
}

export async function handleRemoveMessage (
  client: Client,
  cache: Cache,
  result: Result,
  tx: TxRemoveDoc<ActivityMessage>
): Promise<void> {
  if (tx.attachedTo == null) {
    client.ctx.error('Cannot remove message notification for null attachedTo')
    return
  }

  const contexts = await cache.getContexts(tx.attachedTo)

  for (const context of contexts) {
    // TODO: update last notify
    const operations = {
      $pull: {
        latestNotifications: { id: tx.objectId },
        // unreadReactions: { messageId: tx.objectId },
        // unreadMentions: { messageId: tx.objectId },
        unreadMessages: { _id: tx.objectId }
      },
      $inc: {}
    }

    const hasUnreadId = context.unreadMessages?.some((m) => '_id' in m && m._id === tx.objectId) ?? false
    if (hasUnreadId) {
      operations.$inc = { unreadMessagesCount: -1 }
    }

    result.updateContextOpTx.push(
      client.txFactory.createTxUpdateDoc(context._class, context.space, context._id, operations)
    )
  }
}

export async function handleUpdateMessage (
  client: Client,
  cache: Cache,
  result: Result,
  tx: TxUpdateDoc<ActivityMessage>
): Promise<void> {
  if (!client.hierarchy.isDerived(tx.objectClass, activity.class.DocUpdateMessage)) return

  const updateTx = tx as TxUpdateDoc<DocUpdateMessage>
  const ops = updateTx.operations ?? {}
  const historyChanged =
    ops.history !== undefined || ops.$push?.history !== undefined || ops.$pull?.history !== undefined

  const isCombine = ops.$push?.history !== undefined && Object.keys(ops).length === 1

  if (!historyChanged || isCombine) {
    return
  }

  const _message = await cache.getDoc(tx.objectId, tx.objectClass)
  if (_message === undefined) return

  const message = TxProcessor.updateDoc2Doc(_message, tx)

  const doc = await cache.getDoc(message.attachedTo, message.attachedToClass)
  if (doc === undefined) return

  const contexts = await cache.getContexts(doc._id)

  for (const context of contexts) {
    // Check if the notification exists in this context before emitting update
    const exists = context.latestNotifications?.some((n) => n.id === tx.objectId)

    if (exists) {
      const operations = {
        $update: {
          latestNotifications: {
            $query: { id: tx.objectId },
            $update: {
              message,
              createdOn: message.createdOn ?? message.modifiedOn,
              createdBy: message.createdBy ?? message.modifiedBy
            }
          }
        }
      }

      result.updateContextOpTx.push(
        client.txFactory.createTxUpdateDoc(context._class, context.space, context._id, operations)
      )
    }
  }
}
