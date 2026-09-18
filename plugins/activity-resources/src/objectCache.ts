//
// Copyright © 2026 Intabia Fusion.
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

import core, { type Class, type Doc, type Ref, type Tx, type TxCUD } from '@hcengineering/core'
import { addTxListener, getClient } from '@hcengineering/presentation'

// Activity cards look up their header object (a channel, a document) one per card, and many cards
// share the same object. Concurrent lookups share one findOne, found objects are kept until a tx
// touches them. A miss is not kept: the object may simply not have arrived yet.
const found = new Map<Ref<Doc>, Doc>()
const inflight = new Map<Ref<Doc>, Promise<Doc | undefined>>()
const maxSize = 50

export async function getObjectById (_class: Ref<Class<Doc>>, _id: Ref<Doc>): Promise<Doc | undefined> {
  const cached = found.get(_id)
  if (cached !== undefined) return cached

  let pending = inflight.get(_id)
  if (pending === undefined) {
    pending = getClient()
      .findOne(_class, { _id })
      .then((doc) => {
        if (doc !== undefined) {
          if (found.size >= maxSize) found.clear()
          found.set(_id, doc)
        }
        return doc
      })
      .finally(() => inflight.delete(_id))
    inflight.set(_id, pending)
  }
  return await pending
}

addTxListener((txes: Tx[]) => {
  for (const tx of txes) {
    if (tx._class !== core.class.TxCreateDoc) {
      found.delete((tx as TxCUD<Doc>).objectId)
    }
  }
})
