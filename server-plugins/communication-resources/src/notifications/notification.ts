// Copyright © 2025 Hardcore Engineering Inc.
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



// import core, {
//   AnyAttribute,
//   AttachedDoc,
//   Collection,
//   Data,
//   Ref,
//   Tx,
//   TxCreateDoc,
//   TxProcessor,
//   TxUpdateDoc
// } from '@hcengineering/core'
// import { TriggerControl } from '@hcengineering/server-core'
//
// export async function OnAttributeCreate (txes: Tx[], control: TriggerControl): Promise<Tx[]> {
//   const result: Tx[] = []
//   for (const tx of txes) {
//     const attribute = TxProcessor.createDoc2Doc(tx as TxCreateDoc<AnyAttribute>)
//     const group = (
//       await control.modelDb.findAll(notification.class.NotificationGroup, { objectClass: attribute.attributeOf })
//     )[0]
//     if (group === undefined) {
//       continue
//     }
//     const isCollection: boolean = core.class.Collection === attribute.type._class
//     const objectClass = !isCollection ? attribute.attributeOf : (attribute.type as Collection<AttachedDoc>).of
//     const txClasses = !isCollection
//       ? [control.hierarchy.isMixin(attribute.attributeOf) ? core.class.TxMixin : core.class.TxUpdateDoc]
//       : [core.class.TxCreateDoc, core.class.TxRemoveDoc]
//     const data: Data<NotificationType> = {
//       attribute: attribute._id,
//       group: group._id,
//       field: attribute.name,
//       generated: true,
//       objectClass,
//       txClasses,
//       hidden: false,
//       defaultEnabled: false,
//       templates: {
//         textTemplate: '{body}',
//         htmlTemplate: '<p>{body}</p><p>{link}</p>',
//         subjectTemplate: '{doc} updated'
//       },
//       label: attribute.label
//     }
//     if (isCollection) {
//       data.attachedToClass = attribute.attributeOf
//     }
//     const id =
//       `${notification.class.NotificationType}_${attribute.attributeOf}_${attribute.name}` as Ref<NotificationType>
//     result.push(control.txFactory.createTxCreateDoc(notification.class.NotificationType, core.space.Model, data, id))
//   }
//   return result
// }
//
// /**
//  * @public
//  */
// export async function OnAttributeUpdate (txes: Tx[], control: TriggerControl): Promise<Tx[]> {
//   const result: Tx[] = []
//   for (const tx of txes) {
//     const ctx = tx as TxUpdateDoc<AnyAttribute>
//     if (ctx.operations.hidden === undefined) {
//       continue
//     }
//     const type = (
//       await control.findAll(control.ctx, notification.class.NotificationType, { attribute: ctx.objectId })
//     )[0]
//     if (type === undefined) {
//       continue
//     }
//     result.push(
//       control.txFactory.createTxUpdateDoc(type._class, type.space, type._id, {
//         hidden: ctx.operations.hidden
//       })
//     )
//   }
//   return result
// }

//
//
// async function OnDocRemove (txes: TxCUD<Doc>[], control: TriggerControl): Promise<Tx[]> {
//   const ltxes = txes.filter((it) => it._class === core.class.TxRemoveDoc) as TxRemoveDoc<Doc>[]
//   const res: Tx[] = []
//   for (const tx of ltxes) {
//     if (control.hierarchy.isDerived(tx.objectClass, activity.class.ActivityMessage)) {
//       const message = control.removedMap.get(tx.objectId) as ActivityMessage | undefined
//
//       if (message !== undefined) {
//         const txes = await OnActivityMessageRemove(message, control)
//         res.push(...txes)
//       }
//     } else if (control.hierarchy.isDerived(tx.objectClass, notification.class.DocNotifyContext)) {
//       const contextsCache: ContextsCache | undefined = control.cache.get(ContextsCacheKey)
//       if (contextsCache !== undefined) {
//         for (const [key, value] of contextsCache.contexts.entries()) {
//           if (value === tx.objectId) {
//             contextsCache.contexts.delete(key)
//           }
//         }
//       }
//
//       res.push(...(await removeContextNotifications(control, [tx.objectId as Ref<DocNotifyContext>])))
//     }
//
//     res.push(...(await removeCollaboratorDoc(tx, control)))
//   }
//   return res
// }


// import type { TriggerControl } from '@hcengineering/server-core'
// import { SortingOrder, Tx } from '@hcengineering/core'
//
// async function OnActivityMessageRemove (message: ActivityMessage, control: TriggerControl): Promise<Tx[]> {
//   if (control.removedMap.has(message.attachedTo)) {
//     return []
//   }
//
//   const contexts = await control.findAll(control.ctx, notification.class.DocNotifyContext, {
//     objectId: message.attachedTo,
//     lastUpdateTimestamp: message.createdOn
//   })
//   if (contexts.length === 0) return []
//
//   const lastMessage = (
//     await control.findAll(
//       control.ctx,
//       activity.class.ActivityMessage,
//       { attachedTo: message.attachedTo, space: message.space },
//       { sort: { createdOn: SortingOrder.Descending }, limit: 1 }
//     )
//   )[0]
//   if (lastMessage === undefined) return []
//
//   const res: Tx[] = []
//
//   for (const context of contexts) {
//     const tx = control.txFactory.createTxUpdateDoc(context._class, context.space, context._id, {
//       lastUpdateTimestamp: lastMessage.createdOn ?? lastMessage.modifiedOn
//     })
//
//     res.push(tx)
//   }
//
//   return res
// }


// /**
//  * @public
//  */
// export async function removeDocInboxNotifications (_id: Ref<ActivityMessage>, control: TriggerControl): Promise<Tx[]> {
//   const inboxNotifications = await control.findAll(control.ctx, notification.class.InboxNotification, {
//     attachedTo: _id
//   })
//
//   return inboxNotifications.map((inboxNotification) =>
//     control.txFactory.createTxRemoveDoc(
//       notification.class.InboxNotification,
//       inboxNotification.space,
//       inboxNotification._id
//     )
//   )
// }
