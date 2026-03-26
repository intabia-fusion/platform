//
// Copyright © 2026 Intabia Fusion Inc.
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

import core, {
  type Class,
  type Doc,
  type MeasureContext,
  type Ref,
  type Space,
  type TxCUD,
  type TxMixin,
  TxProcessor,
  type TxRemoveDoc,
  type TxUpdateDoc
} from '@hcengineering/core'
import activity, { type DocUpdateMessage } from '@hcengineering/activity'

import { type Client } from './types'

class WsCache {
  private readonly docs = new Map<Ref<Doc>, Doc>()
  private readonly recentMessages = new Map<Ref<DocUpdateMessage>, DocUpdateMessage>()
  private readonly interval: NodeJS.Timeout | undefined

  constructor (
    private readonly ctx: MeasureContext,
    private readonly client: Client,
    recentMessages: DocUpdateMessage[]
  ) {
    this.recentMessages = new Map(recentMessages.map((msg) => [msg._id, msg]))
    this.interval = setInterval(
      () => {
        this.cleanRecentMessages()
      },
      10 * 60 * 1000
    )
  }

  public tx (tx: TxCUD<Doc>): void {
    this.clearLargeCaches()

    if ([core.class.TxUpdateDoc, core.class.TxMixin].includes(tx._class)) {
      this.txUpdateDoc(tx as TxUpdateDoc<Doc> | TxMixin<Doc, Doc>)
    }

    if (tx._class === core.class.TxRemoveDoc) {
      this.txRemoveDoc(tx as TxRemoveDoc<Doc>)
    }
  }

  private txUpdateDoc (tx: TxUpdateDoc<Doc> | TxMixin<Doc, Doc>): void {
    const doc = this.docs.get(tx.objectId)
    const { hierarchy } = this.client

    if (doc != null) {
      const updated = this.updateOrMixin(tx, doc)
      this.docs.set(updated._id, updated)
    }

    if (hierarchy.isDerived(tx.objectClass, activity.class.ActivityMessage)) {
      const message = this.recentMessages.get(tx.objectId as Ref<DocUpdateMessage>)
      if (message != null) {
        const updated = this.updateOrMixin(tx, message)
        this.recentMessages.set(updated._id, updated)
      }
    }
  }

  private txRemoveDoc (tx: TxRemoveDoc<Doc>): void {
    this.docs.delete(tx.objectId)

    const { hierarchy } = this.client

    if (hierarchy.isDerived(tx.objectClass, activity.class.ActivityMessage)) {
      this.recentMessages.delete(tx.objectId as Ref<DocUpdateMessage>)
    }
  }

  private updateOrMixin<T extends Doc>(tx: TxUpdateDoc<Doc> | TxMixin<Doc, Doc>, doc: T): T {
    if (tx._class === core.class.TxUpdateDoc) {
      return TxProcessor.updateDoc2Doc(doc, tx as TxUpdateDoc<Doc>) as T
    }

    return TxProcessor.updateMixin4Doc(doc, tx as TxMixin<Doc, Doc>) as T
  }

  public async getDoc (_id: Ref<Doc>, _class: Ref<Class<Doc>>): Promise<Doc | undefined> {
    if (this.docs.has(_id)) return this.docs.get(_id)

    let doc = await this.client.findOne(_class, { _id })

    if (doc === undefined) {
      const createTx = (await this.client.findAll(core.class.TxCreateDoc, { objectId: _id }, { limit: 1 }))[0]

      doc = createTx !== undefined ? TxProcessor.createDoc2Doc(createTx) : undefined
    }
    if (doc !== undefined) {
      this.docs.set(_id, doc)
    } else {
      this.docs.delete(_id)
    }
    return doc
  }

  public async getDocSpace (doc: Doc): Promise<Space | undefined> {
    if (this.client.hierarchy.isDerived(doc._class, core.class.Space)) return doc as Space
    if (this.docs.has(doc.space)) return doc as Space

    const space = await this.client.findOne<Space>(core.class.Space, { _id: doc.space }, { limit: 1 })

    if (space !== undefined) {
      this.docs.set(doc.space, space)
    }

    return space
  }

  public addRecentMessage (msg: DocUpdateMessage): void {
    this.recentMessages.set(msg._id, msg)
  }

  public getRecentMessages (attachedTo: Ref<Doc>): DocUpdateMessage[] {
    const array = Array.from(this.recentMessages.values())
    return array
      .filter((msg) => msg.attachedTo === attachedTo)
      .sort((a, b) => (b.createdOn ?? b.modifiedOn ?? 0) - (a.createdOn ?? a.modifiedOn ?? 0))
  }

  private cleanRecentMessages (): void {
    const now = Date.now()
    const cutoff = now - 10 * 60 * 1000

    for (const [_id, message] of Array.from(this.recentMessages.entries())) {
      const date = message.createdOn ?? message.modifiedOn ?? 0
      if (date < cutoff) {
        this.recentMessages.delete(_id)
      }
    }
  }

  private clearLargeCaches (): void {
    const maxSize = 1000
    if (this.docs.size > maxSize) {
      this.docs.clear()
    }
  }

  public close (): void {
    if (this.interval != null) {
      clearInterval(this.interval)
    }
  }
}

export default WsCache
