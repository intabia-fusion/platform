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
  AccountUuid,
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
  TxUpdateDoc,
  UserStatus,
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
  CreateNotificationAction,
  DocNotifyContext,
  UnreadReaction,
  UnreadMention,
  CommonNotification
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
import { Client, Result, TimeMachineMessage, TxCache } from './types'
import { emptyResult, getEmptyTxCache, getResultTxes, isEmptyResult } from './utils/utils'
import { setUnreadMessagesCounts } from './utils/context'
import { handleMessage } from './module/message'
import { handleTxNotification } from './module/tx'
import { handleReadState } from './module/read'
import { handleReadNotificationAction, handleCreateNotificationAction } from './module/action'
import { HeldPush, PendingPushHolder } from './pendingPush'
import { heldLetterId, type HeldLetterId } from './heldLetter'

const transientHttpStatuses = new Set([408, 425, 429, 500, 502, 503, 504])
// Attempts of one tx batch on a transient transactor error before the source tx goes back to the queue.
const applyAttempts = 4
const applyBackoff = DelayStrategyFactory.exponentialBackoff({
  initialDelayMs: 500,
  maxDelayMs: 5000,
  backoffFactor: 2,
  jitter: 0.2
})

// The context txes are applied by the time the queue messages go out, and a redelivered tx is
// recognised as already recorded, so a message that fails to publish is not retried later: push
// and email of that batch are lost. The producer is therefore retried for about a minute before
// giving up, longer than a broker leader change or a short outage takes.
const publishAttempts = 8
// How long a letter that went out is remembered, to drop the time machine firing it again.
const releasedMemoryMs = 10 * 60 * 1000
const publishBackoff = DelayStrategyFactory.exponentialBackoff({
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffFactor: 2,
  jitter: 0.2
})

// Network failures and transactor-side outages are worth a retry; a rejected batch (bad request,
// policy reject, forbidden) is not.
const READ_CHECK_CHUNK = 200

// Which held pushes were read meanwhile, one answer per push in order. From the DB, not the
// cache: a read the cache knows of already cancelled its hold. One query per chunk of documents.
export async function areHeldPushesRead (ctx: MeasureContext, pipeline: Pipeline, held: HeldPush[]): Promise<boolean[]> {
  const byPosition = held.filter((it) => it.readBy === 'position')
  const byList = held.filter((it) => it.readBy !== 'position')

  const states = new Map<Ref<Doc>, ReadState>()
  for (const ids of chunks(unique(byPosition.map((it) => it.objectId)))) {
    for (const state of await pipeline.findAll<ReadState>(ctx, notification.class.ReadState, {
      attachedTo: { $in: ids }
    })) {
      states.set(state.attachedTo, state)
    }
  }

  const contexts = new Map<string, DocNotifyContext>()
  for (const ids of chunks(unique(byList.map((it) => it.objectId)))) {
    for (const context of await pipeline.findAll<DocNotifyContext>(ctx, notification.class.DocNotifyContext, {
      objectId: { $in: ids },
      user: { $in: unique(byList.map((it) => it.account)) }
    })) {
      contexts.set(`${context.user}:${context.objectId}`, context)
    }
  }

  return held.map((it) => {
    if (it.readBy === 'position') {
      const position = states.get(it.objectId)?.[it.account]
      return position != null && position.timestamp >= it.createdOn
    }
    const context = contexts.get(`${it.account}:${it.objectId}`)
    if (context === undefined) return true
    const unread: ReadonlyArray<UnreadReaction | UnreadMention | CommonNotification> =
      it.readBy === 'reactions'
        ? (context.unreadReactions ?? [])
        : it.readBy === 'mentions'
          ? (context.unreadMentions ?? [])
          : (context.unreadCommons ?? [])
    return !unread.some((entry) => entry.id === it.notificationId)
  })
}

function unique<T> (values: T[]): T[] {
  return Array.from(new Set(values))
}

function chunks<T> (values: T[]): T[][] {
  const result: T[][] = []
  for (let i = 0; i < values.length; i += READ_CHECK_CHUNK) result.push(values.slice(i, i + READ_CHECK_CHUNK))
  return result
}

export function isTransientError (e: unknown): boolean {
  if (retryNetworkErrors(e)) return true
  const httpStatus = (e as any)?.httpStatus
  return typeof httpStatus === 'number' && transientHttpStatuses.has(httpStatus)
}

class Workspace {
  public readonly cache: WorkspaceCache

  private readonly inProgress = new Set<Promise<void>>()
  // When each letter went out: the time machine delivers at least once, a repeat is dropped.
  private readonly released = new Map<HeldLetterId, Timestamp>()
  private lastUpdate: Timestamp | undefined = Date.now()

  private readonly txFactory = new TxFactory(core.account.System, true)
  readonly client: Client
  readonly pendingPush: PendingPushHolder

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
    private readonly producer: PlatformQueueProducer<QueueNotificationMessage>,
    private readonly timeMachine: PlatformQueueProducer<TimeMachineMessage>,
    getAiBotAccount: () => Promise<AccountUuid | undefined>
  ) {
    this.pendingPush = new PendingPushHolder({
      holdMs: config.PushHoldMs,
      publish: async (message) => {
        await this.publish([message])
      },
      areRead: async (held) => await areHeldPushesRead(this.ctx, this.pipeline, held),
      onError: (err, held) => {
        this.ctx.error('Failed to release a held push, it is lost', {
          error: err instanceof Error ? err.message : String(err),
          notificationId: held.notificationId,
          account: held.account
        })
      },
      onCheckFailed: (err, held, attempt) => {
        this.ctx.warn('Failed to check whether a held push was read, retrying', {
          error: err instanceof Error ? err.message : String(err),
          notificationId: held.notificationId,
          account: held.account,
          attempt
        })
      }
    })
    this.client = this.getClient()
    this.cache = new WorkspaceCache(this.ctx, this.client, getAiBotAccount)
  }

  async tx (tx: TxCUD<Doc>): Promise<void> {
    await this.track(this.processTx(tx))
  }

  // A letter the time machine fired: out unless read meanwhile (heldLetter.ts).
  async releaseHeld (held: HeldPush): Promise<void> {
    await this.track(
      (async () => {
        const key = heldLetterId(held)
        const now = Date.now()
        // Oldest first (a Map keeps insertion order), so the sweep stops at the first fresh one.
        for (const [id, at] of this.released) {
          if (now - at <= releasedMemoryMs) break
          this.released.delete(id)
        }
        if (this.released.has(key)) {
          this.ctx.warn('held letter fired again, dropped', { notificationId: held.notificationId })
          return
        }
        const [read] = await areHeldPushesRead(this.ctx, this.pipeline, [held])
        if (read) return
        await this.publish([held.message])
        this.released.set(key, now)
      })()
    )
  }

  private async track (run: Promise<void>): Promise<void> {
    this.lastUpdate = Date.now()
    this.inProgress.add(run)
    try {
      await run
    } finally {
      this.inProgress.delete(run)
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

    // The status before this tx: a removal takes it out of the cache, and only this copy names the account.
    const isUserStatus = this.hierarchy.isDerived(tx.objectClass, core.class.UserStatus)
    const statusBefore = isUserStatus ? this.cache.getCachedUserStatus(tx.objectId as Ref<UserStatus>) : undefined

    try {
      this.cache.tx(tx)
    } catch (e: any) {
      // A cache that failed half way through an update cannot be trusted; the DB can.
      this.ctx.error('Failed to apply tx to the cache, cache is reset', { error: e?.message ?? String(e), tx: tx._id })
      this.cache.reset()
    }

    if (isUserStatus) {
      await this.releaseHeldPushes(tx, statusBefore)
      return
    }
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

    if (tx.meta?.silent !== true) {
      await handleTxNotification(this.client, this.cache, txCache, result, tx, this.txTypes)

      if (this.hierarchy.isDerived(tx.objectClass, activity.class.ActivityMessage)) {
        await handleMessage(this.client, this.cache, txCache, result, tx as TxCUD<ActivityMessage>)
      }
    }

    if (!isEmptyResult(result)) {
      if (tx.meta?.inboxOnly === true) this.keepInboxProviderOnly(result)
      // Derived counters are filled once here, after every handler had its say on the context txes.
      await setUnreadMessagesCounts(result, this.cache, this.client)
      await this.applyResult(result)
    }
  }

  // Push/sound/email/telegram senders filter by allowedProviders, so trimming them leaves the inbox entry alone.
  private keepInboxProviderOnly (res: Result): void {
    res.queueMessages = []
    res.createAppPushNotificationTx = []
    res.heldPushes = []
    res.timeMachine = res.timeMachine.filter((it) => it.type !== 'schedule')
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
        this.mirrorToCache(batch)
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

    // The inbox entries are in; now the native pushes about them wait.
    for (const held of result.heldPushes) this.pendingPush.hold(held)

    if (result.queueMessages.length > 0) {
      try {
        await this.publish(result.queueMessages)
      } catch (e: any) {
        // Known limitation, see docs/features/notifications.md: the inbox entries exist, the
        // push and email of this batch do not. The line is the alert hook.
        this.ctx.error('Failed to publish user notifications, push and email of this batch are lost', {
          error: e?.message ?? String(e),
          count: result.queueMessages.length,
          notificationIds: result.queueMessages.map((it) => it.id),
          accounts: Array.from(new Set(result.queueMessages.map((it) => it.account)))
        })
      }
    }
    if (result.timeMachine.length > 0) {
      try {
        await withRetry(() => this.timeMachine.send(this.ctx, this.ws.uuid, result.timeMachine), {
          maxRetries: publishAttempts,
          isRetryable: () => true,
          delayStrategy: publishBackoff
        })
      } catch (e: unknown) {
        // A lost cancel is harmless: the check when the letter fires drops it if read.
        this.ctx.error('Failed to send held letters to the time machine, they are lost', {
          error: e instanceof Error ? e.message : String(e),
          count: result.timeMachine.length,
          ids: result.timeMachine.map((it) => it.id)
        })
      }
    }
  }

  private async publish (messages: QueueNotificationMessage[]): Promise<void> {
    await withRetry(() => this.producer.send(this.ctx, this.ws.uuid, messages), {
      maxRetries: publishAttempts,
      isRetryable: () => true,
      delayStrategy: publishBackoff
    })
  }

  // The receiver left (away, offline): what waited for them goes out. A status the cache never
  // saw names no account; the cap releases those pushes instead.
  private async releaseHeldPushes (tx: TxCUD<Doc>, status: UserStatus | undefined): Promise<void> {
    if (this.pendingPush.size === 0) return
    if (status === undefined) return
    const gone =
      tx._class === core.class.TxRemoveDoc ||
      (tx._class === core.class.TxUpdateDoc &&
        ((tx as TxUpdateDoc<UserStatus>).operations.away === true ||
          (tx as TxUpdateDoc<UserStatus>).operations.online === false))
    if (gone) await this.pendingPush.flushByAccount(status.user)
  }

  // The batch is applied by now: a failure here is a cache problem, not a rejected batch.
  private mirrorToCache (batch: TxCUD<Doc>[]): void {
    try {
      for (const tx of batch) {
        this.cache.tx(tx, true)
      }
    } catch (e: any) {
      this.ctx.error('Failed to mirror applied txes to the cache, cache is reset', { error: e?.message ?? String(e) })
      this.cache.reset()
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
      pendingPush: this.pendingPush,
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
    return this.inProgress.size > 0
  }

  public getLastTxDate (): Timestamp | undefined {
    return this.lastUpdate
  }

  static async create (
    ctx: MeasureContext,
    ws: WorkspaceInfoWithStatus,
    sharedHierarchy: Hierarchy | undefined,
    sharedModel: ModelDb | undefined,
    sysModel: Tx[],
    storage: StorageAdapter,
    rest: RestClient,
    branding: Branding | undefined,
    txTypes: TxNotificationType[],
    producer: PlatformQueueProducer<QueueNotificationMessage>,
    timeMachine: PlatformQueueProducer<TimeMachineMessage>,
    getAiBotAccount: () => Promise<AccountUuid | undefined> = async () => undefined
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
      // The system part already sits in the shared model, only this workspace's txes are applied here.
      ModelMiddleware.create(sysModel, undefined, sharedModel !== undefined, false),
      DBAdapterMiddleware.create(dbConf)
    ]

    const hierarchy = new Hierarchy(sharedHierarchy)
    const modelDb = new ModelDb(hierarchy, sharedModel)

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

    return new Workspace(
      ctx,
      ws,
      pipeline,
      hierarchy,
      modelDb,
      rest,
      storage,
      branding,
      txTypes,
      producer,
      timeMachine,
      getAiBotAccount
    )
  }

  async close (): Promise<void> {
    // A restore event can drop the workspace mid-tx; the pipeline has to outlive that tx.
    await Promise.allSettled(Array.from(this.inProgress))
    // Before the pipeline closes: the read check runs through it.
    await this.pendingPush.flushAll()
    try {
      await this.pipeline.close()
    } catch (e) {
      this.ctx.error('Error during close workspace', { e })
    }
  }
}

export default Workspace
