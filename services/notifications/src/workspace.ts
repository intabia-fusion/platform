/* eslint-disable @typescript-eslint/unbound-method */
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
  Branding,
  Class,
  Doc,
  type DocumentQuery,
  type FindOptions,
  FindResult,
  Hierarchy,
  MeasureContext,
  ModelDb,
  Ref,
  Timestamp,
  Tx,
  TxCUD,
  TxFactory,
  type WithLookup,
  WorkspaceInfoWithStatus
} from '@hcengineering/core'
import activity, { ActivityMessage } from '@hcengineering/activity'
import { RestClient } from '@hcengineering/api-client'
import notification, {
  TxNotificationType,
  QueueNotificationMessage,
  ReadState,
  ReadNotificationAction,
  CreateNotificationAction
} from '@hcengineering/notification'
import { StorageAdapter } from '@hcengineering/storage'
import { PlatformError, unknownError } from '@hcengineering/platform'
import { DelayStrategyFactory, retryNetworkErrors, withRetry } from '@hcengineering/retry'
import {
  createPipeline,
  MiddlewareCreator,
  Pipeline,
  PipelineContext,
  PlatformQueueProducer
} from '@hcengineering/server-core'
import { getConfig } from '@hcengineering/server-pipeline'
import {
  ContextNameMiddleware,
  DBAdapterInitMiddleware,
  DBAdapterMiddleware,
  DomainFindMiddleware,
  DomainTxMiddleware,
  LowLevelMiddleware,
  ModelMiddleware
} from '@hcengineering/middleware'

import config from './config'
import WorkspaceCache from './cache'
import { Client, Result, TxCache } from './types'
import { emptyResult, getEmptyTxCache, getResultTxes, isEmptyResult } from './utils/utils'
import { setUnreadMessagesCounts } from './utils/context'
import { handleMessage } from './module/message'
import { handleTxNotification } from './module/tx'
import { handleReadState } from './module/read'
import { handleReadNotificationAction, handleCreateNotificationAction } from './module/action'

const transientHttpStatuses = new Set([408, 425, 429, 500, 502, 503, 504])
// Attempts of one tx batch on a transient transactor error before the source tx goes back to the queue.
const applyAttempts = 4
const applyBackoff = DelayStrategyFactory.exponentialBackoff({
  initialDelayMs: 500,
  maxDelayMs: 5000,
  backoffFactor: 2,
  jitter: 0.2
})

// Network failures and transactor-side outages are worth a retry; a rejected batch (bad request,
// policy reject, forbidden) is not.
export function isTransientError (e: unknown): boolean {
  if (retryNetworkErrors(e)) return true
  const httpStatus = (e as any)?.httpStatus
  return typeof httpStatus === 'number' && transientHttpStatuses.has(httpStatus)
}

class Workspace {
  public readonly cache: WorkspaceCache

  private inProgress = false
  private lastUpdate: Timestamp | undefined = Date.now()

  private readonly txFactory = new TxFactory(core.account.System, true)
  readonly client: Client

  private constructor (
    private readonly ctx: MeasureContext,
    private readonly ws: WorkspaceInfoWithStatus,
    private readonly pipeline: Pipeline,
    private readonly hierarchy: Hierarchy,
    private readonly model: ModelDb,
    private readonly rest: RestClient,
    private readonly storage: StorageAdapter,
    private readonly branding: Branding | undefined,
    private readonly txTypes: TxNotificationType[],
    private readonly producer: PlatformQueueProducer<QueueNotificationMessage>
  ) {
    this.client = this.getClient()
    this.cache = new WorkspaceCache(this.ctx, this.client)
  }

  async tx (tx: TxCUD<Doc>): Promise<void> {
    this.inProgress = true
    try {
      await this.processTx(tx)
    } finally {
      this.inProgress = false
    }
  }

  private async processTx (tx: TxCUD<Doc>): Promise<void> {
    const domain = this.hierarchy.findDomain(tx.objectClass)
    if (domain == null) {
      return
    }

    if (domain === 'model') {
      // addTxes keeps the hierarchy in step, applying it here too would double $push/$inc.
      this.model.addTxes(this.ctx, [tx], true)
    }

    this.cache.tx(tx)

    if (this.hierarchy.isDerived(tx.objectClass, notification.class.DocNotifyContext)) return
    if (this.hierarchy.isDerived(tx.objectClass, notification.class.AppPushNotification)) return
    if (this.hierarchy.isDerived(tx.objectClass, activity.class.ActivityReference)) return

    const result: Result = emptyResult()
    const txCache: TxCache = getEmptyTxCache()

    if (this.hierarchy.isDerived(tx.objectClass, notification.class.ReadNotificationAction)) {
      await handleReadNotificationAction(this.client, this.cache, result, tx as TxCUD<ReadNotificationAction>)
    } else if (this.hierarchy.isDerived(tx.objectClass, notification.class.CreateNotificationAction)) {
      await handleCreateNotificationAction(
        this.client,
        this.cache,
        txCache,
        result,
        tx as TxCUD<CreateNotificationAction>
      )
    } else if (this.hierarchy.isDerived(tx.objectClass, notification.class.ReadState)) {
      await handleReadState(this.client, this.cache, result, tx as TxCUD<ReadState>)
    }

    if (tx.meta?.silent === true) return

    await handleTxNotification(this.client, this.cache, txCache, result, tx, this.txTypes)

    if (this.hierarchy.isDerived(tx.objectClass, activity.class.ActivityMessage)) {
      await handleMessage(this.client, this.cache, txCache, result, tx as TxCUD<ActivityMessage>)
    }

    if (!isEmptyResult(result)) {
      if (tx.meta?.inboxOnly === true) this.keepInboxProviderOnly(result)
      // Derived counters are filled once here, after every handler had its say on the context txes.
      await setUnreadMessagesCounts(result, this.cache, this.client)
      this.lastUpdate = tx.createdOn ?? tx.modifiedOn
      await this.applyResult(result)
    }
  }

  // Push/sound/email/telegram senders filter by allowedProviders, so trimming them leaves the inbox entry alone.
  private keepInboxProviderOnly (res: Result): void {
    res.queueMessages = []
    res.createAppPushNotificationTx = []
  }

  private async applyResult (result: Result): Promise<void> {
    const txes = getResultTxes(result)
    for (let i = 0; i < txes.length; i += config.ApplyTxBatchSize) {
      const batch = txes.slice(i, i + config.ApplyTxBatchSize)
      const txApply = this.txFactory.createTxApplyIf(
        core.space.DerivedTx,
        'notifications',
        [],
        [],
        batch,
        undefined,
        true
      )
      try {
        await withRetry(() => this.rest.tx(txApply), {
          maxRetries: applyAttempts,
          isRetryable: isTransientError,
          delayStrategy: applyBackoff
        })
        for (const tx of batch) {
          this.cache.tx(tx, true)
        }
      } catch (e: any) {
        this.cache.resetContexts()
        const transient = isTransientError(e)
        this.ctx.error(transient ? 'Failed to apply tx batch, tx will be redelivered' : 'Tx batch rejected, dropped', {
          error: e?.message ?? String(e),
          status: e instanceof PlatformError ? e.status : undefined,
          batchSize: batch.length,
          txIds: batch.map((it) => it._id)
        })
        if (transient) {
          throw e
        }
      }
    }

    if (result.queueMessages.length > 0) {
      try {
        await withRetry(() => this.producer.send(this.ctx, this.ws.uuid, result.queueMessages), {
          maxRetries: applyAttempts,
          isRetryable: () => true,
          delayStrategy: applyBackoff
        })
      } catch (e: any) {
        this.ctx.error('Failed to publish user notifications', {
          error: e?.message ?? String(e),
          count: result.queueMessages.length
        })
      }
    }
  }

  private getClient (): Client {
    return {
      ctx: this.ctx,
      txFactory: this.txFactory,
      workspace: this.ws,
      storage: this.storage,
      hierarchy: this.hierarchy,
      model: this.model,
      branding: this.branding,
      findAll: async <T extends Doc>(
        _class: Ref<Class<T>>,
        query: DocumentQuery<T>,
        options?: FindOptions<T>
      ): Promise<FindResult<T>> => {
        return await this.pipeline.findAll(this.ctx, _class, query, options)
      },
      findOne: async <T extends Doc>(
        _class: Ref<Class<T>>,
        query: DocumentQuery<T>,
        options?: FindOptions<T>
      ): Promise<WithLookup<T> | undefined> => {
        return (await this.pipeline.findAll(this.ctx, _class, query, { ...options, limit: 1 }))[0]
      }
    }
  }

  public isInProgress (): boolean {
    return this.inProgress
  }

  public getLastTxDate (): Timestamp | undefined {
    return this.lastUpdate
  }

  static async create (
    ctx: MeasureContext,
    ws: WorkspaceInfoWithStatus,
    hierarchy: Hierarchy,
    modelDb: ModelDb,
    sysModel: Tx[],
    storage: StorageAdapter,
    rest: RestClient,
    branding: Branding | undefined,
    txTypes: TxNotificationType[],
    producer: PlatformQueueProducer<QueueNotificationMessage>
  ): Promise<Workspace> {
    const dbConf = getConfig(ctx, config.DbUrl, ctx, {
      disableTriggers: true,
      externalStorage: storage
    })

    const middlewares: MiddlewareCreator[] = [
      LowLevelMiddleware.create,
      ContextNameMiddleware.create,
      DomainFindMiddleware.create,
      DomainTxMiddleware.create,
      DBAdapterInitMiddleware.create,
      ModelMiddleware.create(sysModel),
      DBAdapterMiddleware.create(dbConf)
    ]

    const context: PipelineContext = {
      workspace: {
        uuid: ws.uuid,
        url: ws.url
      },
      branding: branding ?? null,
      modelDb,
      hierarchy,
      storageAdapter: storage,
      contextVars: {}
    }
    const pipeline = await createPipeline(ctx, middlewares, context)

    const defaultAdapter = pipeline.context.adapterManager?.getDefaultAdapter()
    if (defaultAdapter === undefined) {
      throw new PlatformError(unknownError('Default adapter should be set'))
    }

    if (pipeline.context.lowLevelStorage === undefined) {
      throw new Error('Low level storage is not defined')
    }

    return new Workspace(ctx, ws, pipeline, hierarchy, modelDb, rest, storage, branding, txTypes, producer)
  }

  async close (): Promise<void> {
    try {
      await this.pipeline.close()
    } catch (e) {
      this.ctx.error('Error during close workspace', { e })
    }
  }
}

export default Workspace
