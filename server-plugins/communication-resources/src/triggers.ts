//
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
//

import { Tx, TxDomainEvent } from '@hcengineering/core'
import { TriggerControl } from '@hcengineering/server-core'
import { CreateMessageEvent, RemovePatchEvent } from '@hcengineering/communication-sdk-types'
import { MessageType } from '@hcengineering/communication-types'

export async function OnMessageCreate (
  txes: TxDomainEvent<CreateMessageEvent>[],
  control: TriggerControl
): Promise<Tx[]> {
  const res: Tx[] = []
  for (const tx of txes) {
    const { event } = tx
    if (event.messageType === MessageType.Activity) {
      res.push(
        control.txFactory.createTxUpdateDoc(event.docClass, tx.objectSpace, event.docId, {
          $inc: {
            activity: 1
          }
        } as any)
      )
    } else if (event.messageType === MessageType.Text) {
      res.push(
        control.txFactory.createTxUpdateDoc(event.docClass, tx.objectSpace, event.docId, {
          $inc: {
            comments: 1
          }
        } as any)
      )
    }
  }
  return res
}

export async function OnMessageRemove (txes: TxDomainEvent<RemovePatchEvent>[], control: TriggerControl): Promise<Tx[]> {
  const res: Tx[] = []
  for (const tx of txes) {
    const { event } = tx
    if (event.messageType === MessageType.Activity) {
      res.push(
        control.txFactory.createTxUpdateDoc(event.docClass, tx.objectSpace, event.docId, {
          $inc: {
            activity: -1
          }
        } as any)
      )
    } else if (event.messageType === MessageType.Text) {
      res.push(
        control.txFactory.createTxUpdateDoc(event.docClass, tx.objectSpace, event.docId, {
          $inc: {
            comments: -1
          }
        } as any)
      )
    }
  }
  return res
}
