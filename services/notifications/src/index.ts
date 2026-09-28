//
// Copyright © 2026 Hardcore Engineering Inc.
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

import { generateId, MeasureContext, newMetrics, Tx, WorkspaceUuid } from '@hcengineering/core'
import { getPlatformQueue } from '@hcengineering/kafka'
import { setMetadata } from '@hcengineering/platform'
import serverClient from '@hcengineering/server-client'
import serverCore, {
  initStatisticsContext,
  QueueTopic,
  QueueWorkspaceEvent,
  type QueueWorkspaceMessage
} from '@hcengineering/server-core'
import serverToken from '@hcengineering/server-token'
import { configureAnalytics, createOpenTelemetryMetricsContext, SplitLogger } from '@hcengineering/analytics-service'
import { Analytics } from '@hcengineering/analytics'
import { join } from 'path'
import { readFileSync } from 'fs'
import {
  registerAdapterFactory,
  registerDestroyFactory,
  registerTxAdapterFactory,
  registerServerPlugins,
  registerStringLoaders
} from '@hcengineering/server-pipeline'
import {
  createPostgreeDestroyAdapter,
  createPostgresAdapter,
  createPostgresTxAdapter,
  shutdownPostgres
} from '@hcengineering/postgres'

import { Worker } from './worker'
import { WorkspaceBreaker } from './breaker'
import type { HeldPush } from './pendingPush'
import config from './config'

void main().catch((err) => {
  getCtx().error('Service initialization failed', { err })
})

process.on('exit', () => {
  shutdownPostgres().catch((err) => {
    getCtx().error('Failed to shutdown postgres properly', { err })
  })
})
async function main (): Promise<void> {
  registerServerPlugins()
  registerStringLoaders()
  setMetadata(serverToken.metadata.Secret, config.Secret)
  setMetadata(serverToken.metadata.Service, config.ServiceId)
  setMetadata(serverClient.metadata.Endpoint, config.AccountsUrl)
  setMetadata(serverCore.metadata.FrontUrl, config.FrontUrl)

  registerTxAdapterFactory('postgresql', createPostgresTxAdapter, true)
  registerAdapterFactory('postgresql', createPostgresAdapter, true)
  registerDestroyFactory('postgresql', createPostgreeDestroyAdapter, true)

  const ctx = getCtx()
  const queue = getPlatformQueue(config.ServiceId, config.QueueRegion)

  const model = JSON.parse(readFileSync(process.env.MODEL_JSON ?? 'model.json').toString()) as Tx[]
  const worker = new Worker(ctx, model, queue)

  // The queue retries a failing message forever, and a partition is consumed in order: one tx that
  // can never succeed (a batch the transactor keeps rejecting with 500, a broken workspace) would
  // stop the notifications of every workspace. It is retried for a while, outages pass, then
  // dropped, and the workspace is skipped for a cooldown so that its next txes do not each spend
  // the same budget on the partition (see WorkspaceBreaker).
  const breaker = new WorkspaceBreaker({
    giveUpAfterMs: 5 * 60 * 1000,
    cooldownMs: 5 * 60 * 1000,
    probeGiveUpAfterMs: 30 * 1000
  })

  // Letters fire on their own topic and fail for their own reasons (the broker, the DB): they
  // must not open the txes' breaker, nor be dropped because the txes did.
  const heldBreaker = new WorkspaceBreaker({
    giveUpAfterMs: 5 * 60 * 1000,
    cooldownMs: 5 * 60 * 1000,
    probeGiveUpAfterMs: 30 * 1000
  })

  // One message of a workspace, under a breaker: retried while the failure lasts, dropped after.
  async function guarded (
    breaker: WorkspaceBreaker,
    ctx: MeasureContext,
    ws: WorkspaceUuid,
    id: string,
    what: string,
    payload: Record<string, unknown>,
    run: () => Promise<void>
  ): Promise<void> {
    if (breaker.shouldSkip(ws)) return
    try {
      await run()
      const skipped = breaker.succeeded(ws, id)
      if (skipped !== undefined) {
        ctx.warn('Workspace recovered, tx processing resumed', { wsUuid: ws, skippedTxes: skipped })
      }
    } catch (e) {
      const verdict = breaker.failed(ws, id)
      if (verdict.action === 'drop') {
        ctx.error(
          verdict.opened
            ? `${what} dropped after repeated failures, workspace txes are skipped for a cooldown`
            : `${what} dropped after repeated failures`,
          { e, wsUuid: ws, ...payload, failingForMs: verdict.failingForMs }
        )
        return
      }
      ctx.error(`Failed to process ${what.toLowerCase()}`, { e, wsUuid: ws, ...payload })
      throw e
    }
  }

  const txConsumer = queue.createConsumer<Tx>(ctx, QueueTopic.Tx, queue.getClientId(), async (ctx, queueMessage) => {
    const ws = queueMessage.workspace
    const tx = queueMessage.value
    await guarded(breaker, ctx, ws, tx._id, 'Tx message', { tx }, async () => {
      await worker.tx(ctx, ws, tx)
    })
  })

  // A letter the time machine fired at its due time (see heldLetter.ts). Its own consumer group;
  // the replica that gets it opens the workspace if it has to.
  const heldConsumer = queue.createConsumer<HeldPush>(
    ctx,
    QueueTopic.HeldNotifications,
    queue.getClientId(),
    async (ctx, queueMessage) => {
      const ws = queueMessage.workspace
      const held = queueMessage.value
      await guarded(
        heldBreaker,
        ctx,
        ws,
        held.notificationId,
        'Held letter',
        { notificationId: held.notificationId },
        async () => {
          await worker.heldNotification(ctx, ws, held)
        }
      )
    }
  )

  // Own group per process, like the transactor: every replica holds its own workspace cache.
  const wsConsumer = queue.createConsumer<QueueWorkspaceMessage>(
    ctx,
    QueueTopic.Workspace,
    `${queue.getClientId()}-${generateId()}`,
    async (ctx, queueMessage) => {
      const type = queueMessage.value.type
      if (
        type === QueueWorkspaceEvent.Restored ||
        type === QueueWorkspaceEvent.Upgraded ||
        type === QueueWorkspaceEvent.Deleted
      ) {
        ctx.info('dropping cached workspace', { workspace: queueMessage.workspace, type })
        await worker.dropWorkspace(queueMessage.workspace)
      }
    }
  )

  // Intake stops first, then the worker publishes what it still holds (pending pushes) while
  // the producer is up, then the queue goes. A hard deadline guards against a hung close.
  const shutdown = (): void => {
    const deadline = setTimeout(() => {
      ctx.error('Shutdown did not finish in time, exiting')
      process.exit(1)
    }, 30_000)
    deadline.unref()
    void (async () => {
      try {
        await Promise.allSettled([txConsumer.close(), heldConsumer.close(), wsConsumer.close()])
        await worker.close()
        await queue.shutdown()
      } catch (err: any) {
        ctx.error('Shutdown failed', { error: err?.message ?? String(err) })
      } finally {
        process.exit()
      }
    })()
  }

  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
  process.on('uncaughtException', (error: any) => {
    ctx.error('Uncaught exception', { error })
  })
  process.on('unhandledRejection', (error: any) => {
    ctx.error('Unhandled rejection', { error })
  })
}

function getCtx (): MeasureContext {
  configureAnalytics(config.ServiceId, process.env.VERSION ?? '0.7.0')
  Analytics.setTag('application', config.ServiceId)
  return initStatisticsContext(config.ServiceId, {
    factory: () =>
      createOpenTelemetryMetricsContext(
        config.ServiceId,
        {},
        {},
        newMetrics(),
        new SplitLogger(config.ServiceId, {
          root: join(process.cwd(), 'logs'),
          enableConsole: (process.env.ENABLE_CONSOLE ?? 'true') === 'true'
        })
      )
  })
}
