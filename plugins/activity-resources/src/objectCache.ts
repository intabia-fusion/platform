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
// share the same object. Lookups of one class issued in the same tick go out as a single `$in`
// query, found objects are kept until a tx touches them. A miss is not kept: the object may simply
// not have arrived yet.
const found = new Map<Ref<Doc>, Doc>()
const inflight = new Map<Ref<Doc>, Promise<Doc | undefined>>()
const maxSize = 50

interface Batch {
  ids: Set<Ref<Doc>>
  promise: Promise<Map<Ref<Doc>, Doc>>
}
const batches = new Map<Ref<Class<Doc>>, Batch>()

function batchOf (_class: Ref<Class<Doc>>): Batch {
  let batch = batches.get(_class)
  if (batch === undefined) {
    const ids = new Set<Ref<Doc>>()
    const promise = Promise.resolve().then(async () => {
      batches.delete(_class)
      const docs = await getClient().findAll(_class, { _id: { $in: Array.from(ids) } })
      return new Map(docs.map((doc) => [doc._id, doc]))
    })
    batch = { ids, promise }
    batches.set(_class, batch)
  }
  return batch
}

export async function getObjectById (_class: Ref<Class<Doc>>, _id: Ref<Doc>): Promise<Doc | undefined> {
  const cached = found.get(_id)
  if (cached !== undefined) return cached

  let pending = inflight.get(_id)
  if (pending === undefined) {
    const batch = batchOf(_class)
    batch.ids.add(_id)
    pending = batch.promise
      .then((docs) => {
        const doc = docs.get(_id)
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
