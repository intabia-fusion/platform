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
  Class,
  Doc,
  MeasureContext,
  Ref,
  Space,
  TxCUD,
  TxMixin,
  TxProcessor,
  TxRemoveDoc,
  TxUpdateDoc
} from '@hcengineering/core'


import { Client } from './types'

class WsCache {
  private readonly docs = new Map<Ref<Doc>, Doc>()
  constructor (
    private readonly ctx: MeasureContext,
    private readonly client: Client
  ) {}

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
  }

  private txRemoveDoc (tx: TxRemoveDoc<Doc>): void {
    this.docs.delete(tx.objectId)
    const { hierarchy } = this.client
  }

  private updateOrMixin<T extends Doc>(tx: TxUpdateDoc<Doc> | TxMixin<Doc, Doc>, doc: T): T {
    if (tx._class === core.class.TxUpdateDoc) {
      return TxProcessor.updateDoc2Doc(doc, tx as TxUpdateDoc<Doc>) as T
    }

    return TxProcessor.updateMixin4Doc(doc, tx as TxMixin<Doc, Doc>) as T
  }

  public async getDoc (_id: Ref<Doc>, _class: Ref<Class<Doc>>): Promise<Doc | undefined> {
    if (this.docs.has(_id)) return this.docs.get(_id)
    const doc = await this.client.findOne(_class, { _id })
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


  private clearLargeCaches (): void {
    const maxSize = 1000
    if (this.docs.size > maxSize) {
      this.docs.clear()
    }
  }
}

export default WsCache
