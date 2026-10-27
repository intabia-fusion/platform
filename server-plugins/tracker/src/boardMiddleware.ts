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
  clone,
  type Doc,
  type MeasureContext,
  type Ref,
  type SessionData,
  type Tx,
  type TxCreateDoc,
  type TxCUD,
  TxProcessor,
  type TxUpdateDoc,
  systemAccountUuid
} from '@hcengineering/core'
import contact from '@hcengineering/contact'
import { ForbiddenKind } from '@hcengineering/platform'
import {
  BaseMiddleware,
  createBroadcastEvent,
  type Middleware,
  type PipelineContext,
  type TxMiddlewareResult
} from '@hcengineering/server-core'
import tracker, { type Board, canEditBoard } from '@hcengineering/tracker'

/**
 * Board write rights: only the author or an editor changes a board.
 * Reads need no check: a personal board lives in its author's private PersonSpace.
 * @public
 */
export class BoardMiddleware extends BaseMiddleware {
  static async create (ctx: MeasureContext, context: PipelineContext, next?: Middleware): Promise<Middleware> {
    return new BoardMiddleware(context, next)
  }

  async tx (ctx: MeasureContext<SessionData>, txes: Tx[]): Promise<TxMiddlewareResult> {
    const trusted = ctx.contextData.account.uuid === systemAccountUuid || ctx.contextData.isTriggerCtx === true
    // Boards of this batch as the batch leaves them: a later tx checks against the earlier ones.
    const batch = new Map<Ref<Board>, Board | null>()
    let moved = false
    for (const tx of txes) {
      if (!TxProcessor.isExtendsCUD(tx._class)) continue
      const cud = tx as TxCUD<Doc>
      if (this.context.hierarchy.isDerived(cud.objectClass, tracker.class.Board)) {
        moved = (await this.checkBoardTx(ctx, cud as TxCUD<Board>, batch, trusted)) || moved
      }
    }
    const result = await this.provideTx(ctx, txes)
    // A moved board is broadcast by its old space only: the others reload their boards and get it by the new one
    if (moved) ctx.contextData.broadcast.txes.push(createBroadcastEvent([tracker.class.Board]))
    return result
  }

  private async checkBoardTx (
    ctx: MeasureContext<SessionData>,
    tx: TxCUD<Board>,
    batch: Map<Ref<Board>, Board | null>,
    trusted: boolean
  ): Promise<boolean> {
    const account = ctx.contextData.account.uuid

    if (tx._class === core.class.TxCreateDoc) {
      const board = TxProcessor.createDoc2Doc(tx as TxCreateDoc<Board>)
      if (!trusted && board.author !== account) {
        throw this.forbiddenTx(ctx, ForbiddenKind.AuthorOnly, 'A board is created in the name of its author only', tx)
      }
      if (!trusted) await this.checkPlacement(ctx, board, tx)
      batch.set(board._id, board)
      return false
    }

    const before = batch.has(tx.objectId)
      ? (batch.get(tx.objectId) ?? undefined)
      : (await this.provideFindAll(ctx, tracker.class.Board, { _id: tx.objectId }, { limit: 1 }))[0]
    // Nothing stored, nothing to protect
    if (before === undefined) return false

    if (!trusted && !canEditBoard(before, account)) {
      throw this.forbiddenTx(ctx, ForbiddenKind.AuthorOnly, 'Only the author or an editor changes a board', tx)
    }

    let after: Board = before
    if (tx._class === core.class.TxUpdateDoc) {
      after = TxProcessor.updateDoc2Doc(clone(before), tx as TxUpdateDoc<Board>)
      // A visibility switch moves the board between the workspace and the author's PersonSpace
      const moved = after.visibility !== before.visibility || after.space !== before.space
      if (!trusted && (after.author !== before.author || moved) && before.author !== account) {
        throw this.forbiddenTx(
          ctx,
          ForbiddenKind.AuthorOnly,
          'Only the author hands a board over or changes its visibility',
          tx
        )
      }
      if (!trusted && (moved || after.author !== before.author)) await this.checkPlacement(ctx, after, tx)
    }
    batch.set(tx.objectId, tx._class === core.class.TxRemoveDoc ? null : after)
    return after.space !== before.space
  }

  // A team board lives in the workspace, a personal one only in its author's own PersonSpace
  private async checkPlacement (ctx: MeasureContext<SessionData>, board: Board, tx: TxCUD<Board>): Promise<void> {
    if (board.visibility !== 'me') {
      if (board.space === core.space.Workspace) return
      throw this.forbiddenTx(ctx, ForbiddenKind.AuthorOnly, 'A team board lives in the workspace', tx)
    }
    const space = (
      await this.provideFindAll(ctx, contact.class.PersonSpace, { _id: board.space as any }, { limit: 1 })
    )[0]
    if (space?.account !== board.author) {
      throw this.forbiddenTx(ctx, ForbiddenKind.AuthorOnly, "A personal board lives in its author's PersonSpace", tx)
    }
  }
}
