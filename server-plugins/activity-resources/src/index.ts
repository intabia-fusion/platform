//
// Copyright © 2023 Hardcore Engineering Inc.
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

import activity from '@hcengineering/activity'
import core, { type Doc, type Ref, type Tx, type TxCUD } from '@hcengineering/core'
import type { TriggerControl } from '@hcengineering/server-core'
import { type Card } from '@hcengineering/card'

import { ReferenceTrigger } from './references'
import { generateActivity } from './newActivity'

async function OnDocRemoved (txes: TxCUD<Doc>[], control: TriggerControl): Promise<Tx[]> {
  const result: Tx[] = []
  for (const tx of txes) {
    if (tx._class !== core.class.TxRemoveDoc) continue

    const activityDocMixin = control.hierarchy.classHierarchyMixin(tx.objectClass, activity.mixin.ActivityDoc)
    if (activityDocMixin === undefined) continue

    const messages = await control.findAll(
      control.ctx,
      activity.class.ActivityMessage,
      { attachedTo: tx.objectId },
      { projection: { _id: 1, _class: 1, space: 1 } }
    )

    result.push(
      ...messages.map((message) => control.txFactory.createTxRemoveDoc(message._class, message.space, message._id))
    )
  }
  return result
}

async function HandleCardActivity (txes: TxCUD<Card>[], control: TriggerControl): Promise<Tx[]> {
  const cache = new Map<Ref<Card>, Card>()
  for (const tx of txes) {
    await generateActivity(tx, control, cache)
  }

  return []
}

export * from './references'

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export default async () => ({
  trigger: {
    ReferenceTrigger,
    OnDocRemoved,
    HandleCardActivity
  }
})
