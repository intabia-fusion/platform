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

import core, {
  type MeasureContext,
  type Ref,
  type SessionData,
  type Tx,
  type TxCreateDoc,
  type TxUpdateDoc
} from '@hcengineering/core'
import drive, { type Resource } from '@hcengineering/drive'
import {
  BaseMiddleware,
  type Middleware,
  type PipelineContext,
  type TxMiddlewareResult
} from '@hcengineering/server-core'

type MoveTx = TxUpdateDoc<Resource> & { operations: { parent: Ref<Resource> } }

/**
 * Puts the folder a move leaves on `meta.fromParent`, for the count trigger that runs once the move is stored.
 * @public
 */
export class DriveMiddleware extends BaseMiddleware implements Middleware {
  static async create (ctx: MeasureContext, context: PipelineContext, next?: Middleware): Promise<Middleware> {
    return new DriveMiddleware(context, next)
  }

  async tx (ctx: MeasureContext<SessionData>, txes: Tx[]): Promise<TxMiddlewareResult> {
    const moves = txes.filter((tx): tx is MoveTx => this.isMove(tx))
    if (moves.length > 0) await this.markMoves(ctx, txes, moves)
    return await this.provideTx(ctx, txes)
  }

  private isMove (tx: Tx): tx is MoveTx {
    return (
      tx._class === core.class.TxUpdateDoc &&
      (tx as TxUpdateDoc<Resource>).operations.parent !== undefined &&
      this.context.hierarchy.isDerived((tx as TxUpdateDoc<Resource>).objectClass, drive.class.Resource)
    )
  }

  private async markMoves (ctx: MeasureContext<SessionData>, txes: Tx[], moves: MoveTx[]): Promise<void> {
    const docs = await this.provideFindAll(
      ctx,
      drive.class.Resource,
      { _id: { $in: Array.from(new Set(moves.map((it) => it.objectId))) } },
      { projection: { _id: 1, parent: 1 } }
    )
    const parents = new Map<Ref<Resource>, Ref<Resource>>(docs.map((it) => [it._id, it.parent]))
    // In order: a file created or moved earlier in the batch leaves where that put it.
    for (const tx of txes) {
      if (tx._class === core.class.TxCreateDoc) {
        const create = tx as TxCreateDoc<Resource>
        if (create.attributes.parent !== undefined) parents.set(create.objectId, create.attributes.parent)
      } else if (this.isMove(tx)) {
        const from = parents.get(tx.objectId)
        tx.meta ??= {}
        // Never what a client sent: a wrong one would skew the counts.
        if (from !== undefined) tx.meta.fromParent = from
        else delete tx.meta.fromParent
        parents.set(tx.objectId, tx.operations.parent)
      }
    }
  }
}
