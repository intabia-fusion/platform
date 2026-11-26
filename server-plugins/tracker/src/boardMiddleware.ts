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

import { AsyncLocalStorage } from 'node:async_hooks'
import core, {
  clone,
  type Doc,
  type MeasureContext,
  type Ref,
  type SessionData,
  type Status as CoreStatus,
  type Tx,
  type TxCreateDoc,
  type TxCUD,
  TxProcessor,
  type TxUpdateDoc,
  systemAccount,
  systemAccountUuid
} from '@hcengineering/core'
import contact from '@hcengineering/contact'
import { ForbiddenKind, PlatformError, Severity, Status } from '@hcengineering/platform'
import {
  BaseMiddleware,
  createBroadcastEvent,
  SessionDataImpl,
  type Middleware,
  type PipelineContext,
  type TxMiddlewareResult
} from '@hcengineering/server-core'
import tracker, {
  type Board,
  type Project,
  canEditBoard,
  duplicateColumnIds,
  pruneStatusCondition
} from '@hcengineering/tracker'

/**
 * Board write rights: only the author or an editor changes a board, only the author removes it.
 * Reads need no check: a personal board lives in its author's private PersonSpace.
 * @public
 */
export class BoardMiddleware extends BaseMiddleware {
  static async create (ctx: MeasureContext, context: PipelineContext, next?: Middleware): Promise<Middleware> {
    return new BoardMiddleware(context, next)
  }

  private pendingBoard: Promise<void> | undefined
  private readonly boardScope = new AsyncLocalStorage<{ active: boolean }>()

  async tx (ctx: MeasureContext<SessionData>, txes: Tx[]): Promise<TxMiddlewareResult> {
    const hasBoard = txes.some(
      (tx) =>
        TxProcessor.isExtendsCUD(tx._class) &&
        this.context.hierarchy.isDerived((tx as TxCUD<Doc>).objectClass, tracker.class.Board)
    )
    // Derived writes can re-enter this middleware while the parent request holds its queue entry.
    if (!hasBoard || this.boardScope.getStore()?.active === true) return await this.processTxes(ctx, txes)
    // Validation must read the state left by earlier requests, including a concurrent policy switch.
    const previous = this.pendingBoard
    let release: () => void = () => {}
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    this.pendingBoard = pending
    await previous
    const scope = { active: true }
    try {
      return await this.boardScope.run(scope, async () => await this.processTxes(ctx, txes))
    } finally {
      scope.active = false
      release()
      if (this.pendingBoard === pending) this.pendingBoard = undefined
    }
  }

  private async processTxes (ctx: MeasureContext<SessionData>, txes: Tx[]): Promise<TxMiddlewareResult> {
    const trusted = ctx.contextData.account.uuid === systemAccountUuid || ctx.contextData.isTriggerCtx === true
    let batchBoards: Map<Ref<Board>, Board> | undefined
    let batchProjects: Map<Ref<Project>, Project> | undefined
    const markers = txes.filter(
      (tx): tx is TxUpdateDoc<Board> =>
        tx._class === core.class.TxUpdateDoc &&
        tx.meta?.boardStatusCleanup !== undefined &&
        this.context.hierarchy.isDerived((tx as TxCUD<Doc>).objectClass, tracker.class.Board)
    )
    if (markers.length > 0 && markers.length === txes.length && ctx.contextData.isTriggerCtx === true) {
      const systemCtx = this.systemContext(ctx)
      const ids = [...new Set(markers.map((tx) => tx.objectId))]
      const boards = await this.provideFindAll(systemCtx, tracker.class.Board, { _id: { $in: ids } })
      batchBoards = new Map(boards.map((board) => [board._id, board]))
      const projectIds = [...new Set(boards.flatMap((board) => board.projects))]
      const projects =
        projectIds.length === 0
          ? []
          : await this.provideFindAll(
            systemCtx,
            tracker.class.Project,
            { _id: { $in: projectIds } },
            { showArchived: true }
          )
      batchProjects = new Map(projects.map((project) => [project._id, project]))
    }
    const staged = new Map<Ref<Board>, Board | null>()
    const refreshed: Tx[] = []
    for (const tx of txes) {
      if (tx._class !== core.class.TxUpdateDoc || tx.meta?.boardStatusCleanup === undefined) {
        refreshed.push(tx)
        if (markers.length === 0 || !TxProcessor.isExtendsCUD(tx._class)) continue
        const cud = tx as TxCUD<Board>
        if (!this.context.hierarchy.isDerived(cud.objectClass, tracker.class.Board)) continue
        if (tx._class === core.class.TxCreateDoc) {
          staged.set(cud.objectId, TxProcessor.createDoc2Doc(tx as TxCreateDoc<Board>))
        } else if (tx._class === core.class.TxRemoveDoc) {
          staged.set(cud.objectId, null)
        } else if (tx._class === core.class.TxUpdateDoc) {
          const previous = staged.has(cud.objectId)
            ? staged.get(cud.objectId)
            : (
                await this.provideFindAll(
                  this.systemContext(ctx),
                  tracker.class.Board,
                  { _id: cud.objectId },
                  { limit: 1 }
                )
              )[0]
          if (previous != null) {
            staged.set(cud.objectId, TxProcessor.updateDoc2Doc(clone(previous), tx as TxUpdateDoc<Board>))
          }
        }
        continue
      }
      const update = tx as TxUpdateDoc<Board>
      if (
        ctx.contextData.isTriggerCtx !== true ||
        !this.context.hierarchy.isDerived(update.objectClass, tracker.class.Board)
      ) {
        throw this.forbiddenTx(ctx, ForbiddenKind.AuthorOnly, 'Board status cleanup is managed by the system', update)
      }
      const systemCtx = this.systemContext(ctx)
      const board = staged.has(update.objectId)
        ? staged.get(update.objectId)
        : batchBoards === undefined
          ? (await this.provideFindAll(systemCtx, tracker.class.Board, { _id: update.objectId }, { limit: 1 }))[0]
          : batchBoards.get(update.objectId)
      if (board == null) continue
      const projects =
        batchProjects === undefined
          ? await this.provideFindAll(
            systemCtx,
            tracker.class.Project,
            { _id: { $in: board.projects } },
            { showArchived: true }
          )
          : []
      const byId = batchProjects ?? new Map(projects.map((project: Project) => [project._id, project]))
      const types = board.projects.map((id) => {
        const project = byId.get(id)
        return project === undefined ? undefined : this.context.modelDb.findObject(project.type)
      })
      // Incomplete scope must never erase another project's settings.
      if (types.some((type) => type === undefined)) continue
      const allowed = new Set<Ref<CoreStatus>>(
        types.flatMap((type) =>
          (type?.statuses ?? []).filter((entry) => entry.taskType !== undefined).map((entry) => entry._id)
        )
      )
      const patch = {
        filter: pruneStatusCondition(board.filter, allowed),
        quickFilters: board.quickFilters.map((rule) => ({
          ...rule,
          condition: pruneStatusCondition(rule.condition, allowed)
        })),
        swimlanes: board.swimlanes.map((rule) => ({
          ...rule,
          condition: pruneStatusCondition(rule.condition, allowed)
        })),
        colorRules: board.colorRules.map((rule) => ({
          ...rule,
          condition: pruneStatusCondition(rule.condition, allowed)
        }))
      }
      const operations: Partial<Board> = {}
      if (patch.filter !== board.filter) operations.filter = patch.filter
      if (JSON.stringify(patch.quickFilters) !== JSON.stringify(board.quickFilters)) {
        operations.quickFilters = patch.quickFilters
      }
      if (JSON.stringify(patch.swimlanes) !== JSON.stringify(board.swimlanes)) operations.swimlanes = patch.swimlanes
      if (JSON.stringify(patch.colorRules) !== JSON.stringify(board.colorRules)) {
        operations.colorRules = patch.colorRules
      }
      if (Object.keys(operations).length === 0) {
        staged.set(update.objectId, board)
        continue
      }
      const meta = { ...update.meta }
      delete meta.boardStatusCleanup
      const refreshedUpdate: TxUpdateDoc<Board> = {
        ...update,
        objectClass: board._class,
        objectSpace: board.space,
        operations,
        meta
      }
      refreshed.push(refreshedUpdate)
      staged.set(update.objectId, TxProcessor.updateDoc2Doc(clone(board), refreshedUpdate))
    }
    txes = refreshed
    if (txes.length === 0) return {}
    // Boards of this batch as the batch leaves them: a later tx checks against the earlier ones.
    const batch = new Map<Ref<Board>, Board | null>()
    // Read past the caller's rights: a board hidden from the caller, or one named by another class of
    // its domain, would otherwise pass as "nothing stored"
    const stored = trusted ? batchBoards : await this.storedBoards(ctx, txes)
    let moved = false
    for (const tx of txes) {
      if (!TxProcessor.isExtendsCUD(tx._class)) continue
      const cud = tx as TxCUD<Doc>
      if (this.context.hierarchy.isDerived(cud.objectClass, tracker.class.Board)) {
        moved = (await this.checkBoardTx(ctx, cud as TxCUD<Board>, batch, stored, trusted)) || moved
      } else if (stored?.has(cud.objectId as Ref<Board>) === true) {
        throw this.forbiddenTx(ctx, ForbiddenKind.AuthorOnly, 'A board changes only as a board', cud)
      }
    }
    const result = await this.provideTx(ctx, txes)
    // A moved board is broadcast by its old space only: the others reload their boards and get it by the new one
    if (moved) ctx.contextData.broadcast.txes.push(createBroadcastEvent([tracker.class.Board]))
    return result
  }

  // Stored boards with the ids of the updates and removals of the board domain, one query per batch
  private async storedBoards (ctx: MeasureContext<SessionData>, txes: Tx[]): Promise<Map<Ref<Board>, Board>> {
    const h = this.context.hierarchy
    const domain = h.findDomain(tracker.class.Board)
    const ids = new Set<Ref<Board>>()
    for (const tx of txes) {
      if (!TxProcessor.isExtendsCUD(tx._class) || tx._class === core.class.TxCreateDoc) continue
      const cud = tx as TxCUD<Doc>
      if (h.findDomain(cud.objectClass) === domain) ids.add(cud.objectId as Ref<Board>)
    }
    if (ids.size === 0) return new Map()
    const found = await this.provideFindAll(this.systemContext(ctx), tracker.class.Board, { _id: { $in: [...ids] } })
    return new Map(found.map((it) => [it._id, it]))
  }

  // The system account: the storage hides private spaces of others from the caller
  private systemContext (ctx: MeasureContext<SessionData>): MeasureContext<SessionData> {
    const sctx = ctx.newChild('board-lookup', {}) as MeasureContext<SessionData>
    sctx.contextData = new SessionDataImpl(
      systemAccount,
      ctx.contextData.sessionId,
      true,
      { targets: {}, txes: [], queue: [], sessions: {} },
      this.context.workspace,
      true,
      undefined,
      undefined,
      this.context.modelDb,
      new Map(),
      'transactor'
    )
    return sctx
  }

  private async checkBoardTx (
    ctx: MeasureContext<SessionData>,
    tx: TxCUD<Board>,
    batch: Map<Ref<Board>, Board | null>,
    stored: Map<Ref<Board>, Board> | undefined,
    trusted: boolean
  ): Promise<boolean> {
    const account = ctx.contextData.account.uuid

    if (tx._class === core.class.TxCreateDoc) {
      const board = TxProcessor.createDoc2Doc(tx as TxCreateDoc<Board>)
      if (!trusted && board.author !== account) {
        throw this.forbiddenTx(ctx, ForbiddenKind.AuthorOnly, 'A board is created in the name of its author only', tx)
      }
      if (!trusted) await this.checkPlacement(ctx, board, tx)
      this.checkColumnTitles(board)
      batch.set(board._id, board)
      return false
    }

    const before = batch.has(tx.objectId)
      ? (batch.get(tx.objectId) ?? undefined)
      : stored !== undefined
        ? stored.get(tx.objectId)
        : (await this.provideFindAll(ctx, tracker.class.Board, { _id: tx.objectId }, { limit: 1 }))[0]
    // Nothing stored, nothing to protect
    if (before === undefined) return false

    if (!trusted && !canEditBoard(before, account)) {
      throw this.forbiddenTx(ctx, ForbiddenKind.AuthorOnly, 'Only the author or an editor changes a board', tx)
    }
    if (!trusted && tx._class === core.class.TxRemoveDoc && before.author !== account) {
      throw this.forbiddenTx(ctx, ForbiddenKind.AuthorOnly, 'Only the author removes a board', tx)
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
      this.checkColumnTitles(after)
    }
    batch.set(tx.objectId, tx._class === core.class.TxRemoveDoc ? null : after)
    return after.space !== before.space
  }

  private checkColumnTitles (board: Board): void {
    if (board.preventDuplicateColumnTitles === true && duplicateColumnIds(board.columns).size > 0) {
      throw new PlatformError(
        new Status(Severity.ERROR, tracker.status.DuplicateColumnTitle, {}, undefined, { propagate: true })
      )
    }
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
