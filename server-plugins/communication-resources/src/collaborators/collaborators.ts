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

import core, { AccountUuid, Tx, TxDomainEvent } from '@hcengineering/core'
import { type TriggerControl } from '@hcengineering/server-core'
import { CreateMessageEvent } from '@hcengineering/communication-sdk-types'
import { MessageType } from '@hcengineering/communication-types'
import { getAccountBySocialId, getAddCollaboratorsTxes } from '@hcengineering/server-contact'

// TODO: add collaborators from mentions or from ui?
export async function AddCollaboratorsOnMessageCreate (
  txes: TxDomainEvent<CreateMessageEvent>[],
  control: TriggerControl
): Promise<Tx[]> {
  const res: Tx[] = []

  for (const tx of txes) {
    const { event } = tx

    const { messageType, socialId, docClass, docId } = event
    if (messageType !== MessageType.Text) continue
    const account = await getAccountBySocialId(control, socialId)
    const collaborators = new Set<AccountUuid>()
    if (account == null) continue

    const currentCollaborator = (
      await control.findAll(control.ctx, core.class.Collaborator, {
        attachedTo: docId,
        collaborator: account
      })
    )[0]

    if (currentCollaborator == null) {
      collaborators.add(account)
    }

    if (collaborators.size === 0) continue

    const doc = (await control.findAll(control.ctx, docClass, { _id: docId }))[0]
    if (doc == null) continue

    res.push(...getAddCollaboratorsTxes(doc._id, doc._class, doc.space, control, Array.from(collaborators)))
  }

  return res
}
