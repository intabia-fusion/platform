//
// Copyright © 2020, 2021 Anticrm Platform Contributors.
// Copyright © 2021, 2022 Hardcore Engineering Inc.
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

import activity, { ActivityMessage } from '@hcengineering/activity'
import contact, { Employee, type Person } from '@hcengineering/contact'
import core, {
  AccountUuid,
  AnyAttribute,
  AttachedDoc,
  Collaborator,
  Collection,
  Data,
  Doc,
  getClassCollaborators,
  Ref,
  SortingOrder,
  Tx,
  TxCreateDoc,
  TxCUD,
  TxMixin,
  TxProcessor,
  TxRemoveDoc,
  TxUpdateDoc
} from '@hcengineering/core'
import notification, { DocNotifyContext, MessageNotificationType, NotificationType } from '@hcengineering/notification'
import { type TriggerControl } from '@hcengineering/server-core'

import { PushNotificationsHandler } from './push'
import {
  IsUserFieldValueTypeMatch,
  MeAddedInCollaboratorsNotificationTypeMatch,
  MeRemovedFromCollaboratorsNotificationTypeMatch
} from './utils'

async function removeContexts (
  control: TriggerControl,
  contexts: DocNotifyContext[],
  unsubscribe: AccountUuid[]
): Promise<Tx[]> {
  if (contexts.length === 0) return []
  if (unsubscribe.length === 0) return []

  const res: Tx[] = []

  for (const context of contexts) {
    if (!unsubscribe.includes(context.user)) {
      continue
    }

    const removeTx = control.txFactory.createTxRemoveDoc(context._class, context.space, context._id)

    res.push(removeTx)
  }

  return res
}

async function removeContextNotifications (control: TriggerControl, contextId: Ref<DocNotifyContext>[]): Promise<Tx[]> {
  const inboxNotifications = await control.findAll(
    control.ctx,
    notification.class.InboxNotification,
    {
      docNotifyContext: { $in: contextId }
    },
    {
      projection: {
        _id: 1,
        _class: 1,
        space: 1
      }
    }
  )

  return inboxNotifications.map((it) => control.txFactory.createTxRemoveDoc(it._class, it.space, it._id))
}
async function removeCollaboratorDoc (tx: TxRemoveDoc<Doc>, control: TriggerControl): Promise<Tx[]> {
  const mixin = getClassCollaborators(control.modelDb, control.hierarchy, tx.objectClass)

  if (mixin === undefined) return []

  const res: Tx[] = []
  const contexts = await control.findAll(
    control.ctx,
    notification.class.DocNotifyContext,
    { objectId: tx.objectId },
    {
      projection: {
        _id: 1,
        _class: 1,
        space: 1
      }
    }
  )

  if (contexts.length === 0) return []

  const contextIds = contexts.map(({ _id }) => _id)
  const txes = await removeContextNotifications(control, contextIds)

  res.push(...txes)

  contexts.forEach((it) => res.push(control.txFactory.createTxRemoveDoc(it._class, it.space, it._id)))

  return res
}

async function OnAttributeCreate (txes: Tx[], control: TriggerControl): Promise<Tx[]> {
  const result: Tx[] = []
  for (const tx of txes) {
    const attribute = TxProcessor.createDoc2Doc(tx as TxCreateDoc<AnyAttribute>)
    const group = (
      await control.modelDb.findAll(notification.class.NotificationGroup, { objectClass: attribute.attributeOf })
    )[0]
    if (group === undefined) {
      continue
    }
    const isCollection: boolean = core.class.Collection === attribute.type._class
    const objectClass = !isCollection ? attribute.attributeOf : (attribute.type as Collection<AttachedDoc>).of
    const messageClass = control.hierarchy.isDerived(objectClass, activity.class.ActivityMessage)
      ? objectClass
      : activity.class.DocUpdateMessage

    const data: Data<MessageNotificationType> = {
      attribute: attribute._id,
      group: group._id,
      field: attribute.name,
      generated: true,
      objectClass,
      messageClass,
      hidden: false,
      defaultEnabled: false,
      attachedToClass: attribute.attributeOf,
      templates: {
        textTemplate: '{body}',
        htmlTemplate: '<p>{body}</p><p>{link}</p>',
        subjectTemplate: '{doc} updated'
      },
      label: attribute.label
    }
    const id =
      `${notification.class.MessageNotificationType}_${attribute.attributeOf}_${attribute.name}` as Ref<NotificationType>
    result.push(
      control.txFactory.createTxCreateDoc(notification.class.MessageNotificationType, core.space.Model, data, id)
    )
  }
  return result
}

async function OnAttributeUpdate (txes: Tx[], control: TriggerControl): Promise<Tx[]> {
  const result: Tx[] = []
  for (const tx of txes) {
    const ctx = tx as TxUpdateDoc<AnyAttribute>
    if (ctx.operations.hidden === undefined) {
      continue
    }
    const type = (
      await control.findAll(control.ctx, notification.class.MessageNotificationType, { attribute: ctx.objectId })
    )[0]
    if (type === undefined) {
      continue
    }
    result.push(
      control.txFactory.createTxUpdateDoc(type._class, type.space, type._id, {
        hidden: ctx.operations.hidden
      })
    )
  }
  return result
}

async function OnCollaboratorRemoved (txes: TxRemoveDoc<Collaborator>[], control: TriggerControl): Promise<Tx[]> {
  const res: Tx[] = []

  for (const tx of txes) {
    const collaborator = control.removedMap.get(tx._id) as Collaborator | undefined
    if (collaborator === undefined) continue

    const { attachedTo, attachedToClass } = collaborator

    const doc = (await control.findAll(control.ctx, attachedToClass, { _id: attachedTo }, { limit: 1 }))[0]
    if (doc === undefined) continue

    const contexts = await control.findAll(control.ctx, notification.class.DocNotifyContext, {
      objectId: attachedTo,
      user: collaborator.collaborator
    })

    res.push(...(await removeContexts(control, contexts, [collaborator.collaborator])))
  }

  return res
}

async function OnActivityMessageRemove (message: ActivityMessage, control: TriggerControl): Promise<Tx[]> {
  if (control.removedMap.has(message.attachedTo)) {
    return []
  }

  const res: Tx[] = []

  const reactionNotifications = await control.findAll(control.ctx, notification.class.ReactionInboxNotification, {
    attachedTo: message._id
  })
  const mentionNotifications = await control.findAll(control.ctx, notification.class.MentionInboxNotification, {
    mentionedIn: message._id
  })
  const activityNotifications = await control.findAll(control.ctx, notification.class.ActivityInboxNotification, {
    attachedTo: message._id
  })

  res.push(...activityNotifications.map((it) => control.txFactory.createTxRemoveDoc(it._class, it.space, it._id)))
  res.push(...reactionNotifications.map((it) => control.txFactory.createTxRemoveDoc(it._class, it.space, it._id)))
  res.push(...mentionNotifications.map((it) => control.txFactory.createTxRemoveDoc(it._class, it.space, it._id)))

  const contexts = await control.findAll(control.ctx, notification.class.DocNotifyContext, {
    objectId: message.attachedTo,
    lastUpdate: message.createdOn
  })
  if (contexts.length === 0) return res

  const lastMessage = (
    await control.findAll(
      control.ctx,
      activity.class.ActivityMessage,
      { attachedTo: message.attachedTo, space: message.space },
      { sort: { createdOn: SortingOrder.Descending }, limit: 1 }
    )
  )[0]
  if (lastMessage === undefined) return res

  for (const context of contexts) {
    res.push(
      control.txFactory.createTxUpdateDoc(context._class, context.space, context._id, {
        lastUpdate: lastMessage.createdOn ?? lastMessage.modifiedOn
      })
    )
  }

  return res
}

async function OnEmployeeDeactivate (txes: TxCUD<Doc>[], control: TriggerControl): Promise<Tx[]> {
  const result: Tx[] = []
  for (const tx of txes) {
    const actualTx = tx
    if (core.class.TxMixin !== actualTx._class) {
      return []
    }
    const ctx = actualTx as TxMixin<Person, Employee>
    if (ctx.mixin !== contact.mixin.Employee || ctx.attributes.active !== false) {
      return []
    }
    const person = (await control.findAll(control.ctx, contact.class.Person, { _id: ctx.objectId }))[0]
    if (person?.personUuid === undefined) return []

    const subscriptions = await control.findAll(control.ctx, notification.class.PushSubscription, {
      user: person.personUuid as AccountUuid
    })
    for (const sub of subscriptions) {
      result.push(control.txFactory.createTxRemoveDoc(sub._class, sub.space, sub._id))
    }
  }
  return result
}

async function OnDocRemove (txes: TxCUD<Doc>[], control: TriggerControl): Promise<Tx[]> {
  const ltxes = txes.filter((it) => it._class === core.class.TxRemoveDoc) as TxRemoveDoc<Doc>[]
  const res: Tx[] = []
  for (const tx of ltxes) {
    if (control.hierarchy.isDerived(tx.objectClass, activity.class.ActivityMessage)) {
      const message = control.removedMap.get(tx.objectId) as ActivityMessage | undefined

      if (message !== undefined) {
        const txes = await OnActivityMessageRemove(message, control)
        res.push(...txes)
      }
    } else if (control.hierarchy.isDerived(tx.objectClass, notification.class.DocNotifyContext)) {
      res.push(...(await removeContextNotifications(control, [tx.objectId as Ref<DocNotifyContext>])))
    }

    res.push(...(await removeCollaboratorDoc(tx, control)))
  }
  return res
}

export * from './push'
export * from './types'
export * from './utils'
export * from './text'

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export default async () => ({
  trigger: {
    OnAttributeCreate,
    OnAttributeUpdate,
    OnDocRemove,
    OnEmployeeDeactivate,
    PushNotificationsHandler,
    OnCollaboratorRemoved
  },
  function: {
    IsUserFieldValueTypeMatch,
    MeAddedInCollaboratorsNotificationTypeMatch,
    MeRemovedFromCollaboratorsNotificationTypeMatch
  }
})
