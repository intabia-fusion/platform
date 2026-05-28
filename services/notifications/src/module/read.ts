// async processReadState (_tx: TxCUD<ReadState>): Promise<TxCUD<Doc>[]> {
//   if (_tx._class !== core.class.TxUpdateDoc) return []
//
//   const tx = _tx as TxUpdateDoc<ReadState>
//   if (tx.attachedTo == null) return []
//
//   const res: TxCUD<Doc>[] = []
//   const contexts = await this.cache.getContexts(tx.attachedTo)
//
//   for (const [key, value] of Object.entries(tx.operations)) {
//     const ctx = contexts.filter((it) => it.user === key)
//     if (ctx.length === 0) continue
//     const ts = (value as ReadPosition)?.timestamp ?? 0
//     if (ts === 0) continue
//
//     for (const context of ctx) {
//       const current = context.lastView ?? 0
//       if (current === ts) continue
//       context.lastView = ts
//       res.push(
//         this.txFactory.createTxUpdateDoc(context._class, context.space, context._id, {
//           lastView: ts
//         })
//       )
//     }
//   }
//
//   return res
// }

// import activity, { ActivityMessage } from '@hcengineering/activity/lib'
// import type { TriggerControl } from '@hcengineering/server-core/lib'
// import { SortingOrder, Tx } from '@hcengineering/core'
// import notification from '@hcengineering/notification/lib'
//
// async function OnActivityMessageRemove(message: ActivityMessage, control: TriggerControl): Promise<Tx[]> {
//   if (control.removedMap.has(message.attachedTo)) return []
//
//   const readState = (
//     await control.findAll(control.ctx, notification.class.ReadState, {
//       objectId: message.attachedTo,
//       lastMessageId: message._id
//     })
//   )[0]
//   if (readState == null) return []
//
//   const res: Tx[] = []
//
//   const lastMessage = (
//     await control.findAll(
//       control.ctx,
//       activity.class.ActivityMessage,
//       { attachedTo: message.attachedTo },
//       { sort: { createdOn: SortingOrder.Descending }, limit: 1 }
//     )
//   )[0]
//   if (lastMessage === undefined) return res
//
//   res.push(
//     control.txFactory.createTxUpdateDoc(readState._class, readState.space, readState._id, {
//       lastUpdate: lastMessage.createdOn ?? lastMessage.modifiedOn
//     })
//   )
//
//   return res
// }
