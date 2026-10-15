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
  AccountRole,
  type Client,
  type Doc,
  type DomainParams,
  type DomainResult,
  hasAccountRole,
  type MeasureContext,
  type OperationDomain,
  type SessionData,
  systemAccount,
  TxOperations,
  type Tx,
  type TxCreateDoc,
  type TxCUD,
  TxProcessor,
  type TxUpdateDoc
} from '@hcengineering/core'
import platform, { PlatformError, Severity, Status } from '@hcengineering/platform'
import {
  BaseMiddleware,
  SessionDataImpl,
  type Middleware,
  type PipelineContext,
  type TxMiddlewareResult
} from '@hcengineering/server-core'
import task, {
  type MergeStatusesParams,
  type MergeStatusesResult,
  statusMergeDomain,
  type Task,
  type TaskType
} from '@hcengineering/task'
import { mergeStatuses } from './statusMergeOps'

/**
 * @public
 */
export class TaskMiddleware extends BaseMiddleware {
  static async create (ctx: MeasureContext, context: PipelineContext, next?: Middleware): Promise<Middleware> {
    return new TaskMiddleware(context, next)
  }

  async domainRequest (ctx: MeasureContext, domain: OperationDomain, params: DomainParams): Promise<DomainResult> {
    if (domain !== statusMergeDomain) return await this.provideDomainRequest(ctx, domain, params)

    const account = (ctx as MeasureContext<SessionData>).contextData.account
    if (!hasAccountRole(account, AccountRole.Maintainer)) {
      throw new PlatformError(new Status(Severity.ERROR, platform.status.Forbidden, {}))
    }
    return { domain, value: await this.runMerge(ctx, params as MergeStatusesParams) }
  }

  // Runs as the system account below the whole pipeline head: model docs are stored as txes and broadcast,
  // and the caller's spaces do not limit what is moved.
  private async runMerge (ctx: MeasureContext, params: MergeStatusesParams): Promise<MergeStatusesResult> {
    const head = this.context.head
    if (head === undefined) throw new PlatformError(new Status(Severity.ERROR, platform.status.BadRequest, {}))
    const sctx = ctx.newChild('status-merge', {}) as MeasureContext<SessionData>
    sctx.contextData = new SessionDataImpl(
      systemAccount,
      (ctx as MeasureContext<SessionData>).contextData.sessionId,
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
    let buffer: Tx[] = []
    let written = false
    const flush = async (): Promise<void> => {
      const batch = buffer
      buffer = []
      if (batch.length > 0) {
        await head.tx(sctx, batch)
        written = true
      }
    }
    // The lookup middleware drops the query fields from the docs it returns; give them back like wrapPipeline does.
    const restoreQueryFields = <T extends Doc>(docs: T[], query: Record<string, any>): T[] => {
      for (const doc of docs) {
        for (const [k, v] of Object.entries(query)) {
          if ((typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') && (doc as any)[k] == null) {
            ;(doc as any)[k] = v
          }
        }
      }
      return docs
    }
    const client: Client = {
      getHierarchy: () => this.context.hierarchy,
      getModel: () => this.context.modelDb,
      findAll: async (_class, query, options) => {
        const res = await head.findAll(sctx, _class, query, options)
        restoreQueryFields(res, query)
        return res
      },
      findOne: async (_class, query, options) => {
        const res = await head.findAll(sctx, _class, query, { ...options, limit: 1 })
        return restoreQueryFields(res, query)[0]
      },
      tx: async (tx) => {
        buffer.push(tx)
        if (buffer.length >= 100) await flush()
        return {}
      },
      close: async () => {},
      domainRequest: async (d) => ({ domain: d as any, value: null as any }),
      searchFulltext: async () => ({ docs: [] })
    }
    try {
      const result = await mergeStatuses({ client: new TxOperations(client, core.account.System), flush }, params)
      if (result.ok) await this.finish(head, sctx)
      return result
    } catch (err: any) {
      ctx.error('status merge failed', { err, projectType: params.projectType })
      const reason = err?.status?.code ?? err?.message ?? String(err)
      const note = written
        ? ' Part of the changes is already saved; run the merge again to finish it.'
        : ' Nothing was changed.'
      return {
        ok: false,
        merged: [],
        tasksMoved: 0,
        removed: [],
        kept: [],
        conflicts: [{ kind: 'conflict', message: `merge failed: ${String(reason)}.${note}` }]
      } satisfies MergeStatusesResult
    }
  }

  // Same sequence as a client request: broadcast, then the async triggers, then what they produced.
  private async finish (head: Middleware, sctx: MeasureContext<SessionData>): Promise<void> {
    await head.handleBroadcast(sctx)
    const asyncs = sctx.contextData.asyncRequests ?? []
    if (asyncs.length === 0) return
    sctx.contextData.broadcast.queue = []
    sctx.contextData.broadcast.txes = []
    sctx.contextData.broadcast.sessions = {}
    for (const r of asyncs) await r(sctx)
    await head.handleBroadcast(sctx)
  }

  async tx (ctx: MeasureContext, txes: Tx[]): Promise<TxMiddlewareResult> {
    for (const _tx of txes) {
      if (!TxProcessor.isExtendsCUD(_tx._class)) continue
      const tx = _tx as TxCUD<Doc>
      if (tx._class === core.class.TxCreateDoc && this.context.hierarchy.isDerived(tx.objectClass, task.class.Task)) {
        const createTx = tx as TxCreateDoc<Task>
        const kind = createTx.attributes.kind
        if (kind != null) {
          const taskType = this.context.modelDb.findAllSync<TaskType>(task.class.TaskType, { _id: kind })[0]
          if (taskType == null) {
            throw new PlatformError(
              new Status(Severity.ERROR, platform.status.BadRequest, {
                message: `TaskType '${kind}' not found`
              })
            )
          }
          if (!this.context.hierarchy.isDerived(tx.objectClass, taskType.targetClass)) {
            createTx.objectClass = taskType.targetClass
          }
        }
      } else if (
        tx._class === core.class.TxUpdateDoc &&
        this.context.hierarchy.isDerived(tx.objectClass, task.class.Task)
      ) {
        const updateTx = tx as TxUpdateDoc<Task>
        const newKind = updateTx.operations.kind
        if (newKind != null) {
          const taskType = this.context.modelDb.findAllSync<TaskType>(task.class.TaskType, { _id: newKind })[0]
          if (taskType == null) {
            throw new PlatformError(
              new Status(Severity.ERROR, platform.status.BadRequest, {
                message: `TaskType '${newKind}' not found`
              })
            )
          }
          ;(updateTx.operations as any)._class = taskType.targetClass
        }
      }
    }
    return await this.provideTx(ctx, txes)
  }
}
