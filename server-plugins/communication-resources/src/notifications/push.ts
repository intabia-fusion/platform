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

// async function OnEmployeeDeactivate (txes: TxCUD<Doc>[], control: TriggerControl): Promise<Tx[]> {
//   const result: Tx[] = []
//   for (const tx of txes) {
//     const actualTx = tx
//     if (core.class.TxMixin !== actualTx._class) {
//       return []
//     }
//     const ctx = actualTx as TxMixin<Person, Employee>
//     if (ctx.mixin !== contact.mixin.Employee || ctx.attributes.active !== false) {
//       return []
//     }
//     const person = (await control.findAll(control.ctx, contact.class.Person, { _id: ctx.objectId }))[0]
//     if (person?.personUuid === undefined) return []
//
//     const res: Tx[] = []
//     const subscriptions = await control.findAll(control.ctx, notification.class.PushSubscription, {
//       user: person.personUuid as AccountUuid
//     })
//     for (const sub of subscriptions) {
//       res.push(control.txFactory.createTxRemoveDoc(sub._class, sub.space, sub._id))
//     }
//   }
//   return result
// }
