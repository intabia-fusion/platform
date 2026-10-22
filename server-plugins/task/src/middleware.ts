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
  type Class,
  type Client,
  type Doc,
  type DomainParams,
  type DomainResult,
  hasAccountRole,
  type MeasureContext,
  type OperationDomain,
  type Ref,
  type SessionData,
  systemAccount,
  TxOperations,
  type Tx,
  type TxCreateDoc,
  type TxCUD,
  TxProcessor,
  type TxUpdateDoc
} from '@hcengineering/core'
import platform, { ForbiddenKind, forbiddenError, PlatformError, Severity, Status } from '@hcengineering/platform'
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
  type ProjectType,
  statusMergeDomain,
  type StatusUsageParams,
  type StatusUsageResult,
  statusUsageDomain,
  type Task,
  type TaskType
} from '@hcengineering/task'
import { checkMergeParams, checkUsageParams, countStatusUsage, mergeStatuses } from './statusMergeOps'

const badRequest = (message: string): PlatformError<any> =>
  new PlatformError(new Status(Severity.ERROR, platform.status.BadRequest, { message }))

// The merge writes as the system account, below the guards that look at tx only, so the limits
// of the caller are checked here with the status the tx path uses for each of them.
function assertCanWrite (data: SessionData): void {
  if (data.readOnly === true) {
    throw new PlatformError(new Status(Severity.ERROR, platform.status.WorkspaceReadOnly, {}))
  }
  // As ApiKeyPermissionsMiddleware: the merge is raw CUD and reaches the model space
  const key = data.apiKey
  if (key !== undefined && (!key.canWrite || (key.opsOnly && data.opsApi !== true) || key.spaces.length > 0)) {
    throw forbiddenError(ForbiddenKind.ApiKey, 'The API key may not merge statuses', { account: data.account.uuid })
  }
  if (data.seatReadOnly === true) {
    throw forbiddenError(ForbiddenKind.SeatLimit, 'No seat on the plan: the account is read-only', {
      account: data.account.uuid
    })
  }
}

interface SystemContext {
  head: Middleware
  sctx: MeasureContext<SessionData>
  data: SessionDataImpl
}

/**
 * @public
 */
export class TaskMiddleware extends BaseMiddleware {
  static async create (ctx: MeasureContext, context: PipelineContext, next?: Middleware): Promise<Middleware> {
    return new TaskMiddleware(context, next)
  }

  async domainRequest (ctx: MeasureContext, domain: OperationDomain, params: DomainParams): Promise<DomainResult> {
    if (domain !== statusMergeDomain && domain !== statusUsageDomain) {
      return await this.provideDomainRequest(ctx, domain, params)
    }

    const data = (ctx as MeasureContext<SessionData>).contextData
    if (!hasAccountRole(data.account, AccountRole.Maintainer)) {
      throw forbiddenError(ForbiddenKind.WorkspaceRole, 'Only Maintainer or higher can merge or count statuses', {
        account: data.account.uuid
      })
    }

    if (domain === statusUsageDomain) {
      const reason = checkUsageParams(params)
      if (reason !== undefined) throw badRequest(reason)
      return { domain, value: await this.statusUsage(ctx, params as unknown as StatusUsageParams) }
    }
    assertCanWrite(data)
    const reason = checkMergeParams(params)
    if (reason !== undefined) throw badRequest(reason)
    return { domain, value: await this.runMerge(ctx, params as unknown as MergeStatusesParams) }
  }

  // The system account below the whole pipeline head: model docs are stored as txes and broadcast,
  // and the caller's spaces limit neither what is read nor what is moved.
  private systemContext (ctx: MeasureContext, name: string): SystemContext {
    const head = this.context.head
    if (head === undefined) throw new PlatformError(new Status(Severity.ERROR, platform.status.BadRequest, {}))
    const sctx = ctx.newChild(name, {}) as MeasureContext<SessionData>
    const data = new SessionDataImpl(
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
    sctx.contextData = data
    return { head, sctx, data }
  }

  private async statusUsage (ctx: MeasureContext, params: StatusUsageParams): Promise<StatusUsageResult> {
    const projectType = this.context.modelDb.findAllSync<ProjectType>(task.class.ProjectType, {
      _id: params.projectType
    })[0]
    if (projectType === undefined) throw badRequest(`project type ${params.projectType} not found`)
    const { head, sctx } = this.systemContext(ctx, 'status-usage')
    // Whole workspace: the system account sees private spaces, archived ones are asked for
    const count = async (_class: Ref<Class<Doc>>, query: Record<string, unknown>): Promise<number> =>
      (await head.findAll(sctx, _class, query as any, { limit: 1, total: true, showArchived: true })).total
    return await countStatusUsage(count, projectType, params)
  }

  private async runMerge (ctx: MeasureContext, params: MergeStatusesParams): Promise<MergeStatusesResult> {
    const { head, sctx, data } = this.systemContext(ctx, 'status-merge')
    let buffer: Tx[] = []
    let written = false
    const clearBroadcast = (): void => {
      data.broadcast.txes = []
      data.broadcast.queue = []
      data.broadcast.sessions = {}
    }
    // One broadcast per flush: past 10000 txes a broadcast collapses into a bulk update that
    // lacks the model txes, and a failed merge would never announce what it saved.
    const announce = async (): Promise<void> => {
      // processAsyncTriggers swaps its own session data into the context it ran in
      sctx.contextData = data
      // Same sequence as a client request: broadcast, then the async triggers, then what they produced.
      await head.handleBroadcast(sctx)
      clearBroadcast()
      const asyncs = data.asyncRequests ?? []
      data.asyncRequests = []
      if (asyncs.length === 0) return
      for (const r of asyncs) await r(sctx)
      sctx.contextData = data
      await head.handleBroadcast(sctx)
      clearBroadcast()
    }
    const flush = async (): Promise<void> => {
      const batch = buffer
      buffer = []
      if (batch.length === 0) return
      // A pipeline that fails halfway through a batch may have stored a part of it
      written = true
      try {
        await head.tx(sctx, batch)
      } finally {
        sctx.contextData = data
      }
      await announce()
    }
    // The lookup middleware drops the query fields from the docs it returns; give them back like wrapPipeline does.
    const restoreQueryFields = <T extends Doc>(docs: T[], query: Record<string, any>): T[] => {
      for (const doc of docs) {
        for (const [k, v] of Object.entries(query)) {
          const scalar = typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
          // A dotted key is a path into the doc, not a field of it
          if (scalar && !k.includes('.') && (doc as any)[k] == null) (doc as any)[k] = v
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
      return await mergeStatuses(
        {
          client: new TxOperations(client, core.account.System),
          derived: new TxOperations(client, core.account.System, true),
          flush
        },
        params
      )
    } catch (err: any) {
      ctx.error('status merge failed', { err, projectType: params.projectType })
      // The pipeline may have stored a batch and failed after that: its txes still have to go out
      if (data.broadcast.txes.length > 0 || data.broadcast.queue.length > 0) {
        await announce().catch((e: any) => {
          ctx.error('status merge broadcast failed', { err: e })
        })
      }
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
