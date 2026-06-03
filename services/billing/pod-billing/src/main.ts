//
// Copyright © 2025 Hardcore Engineering Inc.
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

import { Analytics } from '@hcengineering/analytics'
import { configureAnalytics, createOpenTelemetryMetricsContext, SplitLogger } from '@hcengineering/analytics-service'
import { newMetrics } from '@hcengineering/core'
import { getPlatformQueue } from '@hcengineering/kafka'
import { setMetadata } from '@hcengineering/platform'
import serverClient from '@hcengineering/server-client'
import {
  initStatisticsContext,
  LimitCategory,
  QueueTopic,
  QueueWorkspaceEvent,
  type QueueWorkspaceLimitsMessage,
  type QueueWorkspaceMessage,
  StorageConfig
} from '@hcengineering/server-core'
import serverToken from '@hcengineering/server-token'
import { join } from 'path'

import config from './config'
import { createDb } from './db/postgres'
import { LimitsEngine } from './limits'
import { createServer, listen } from './server'
import { type BillingUsageMessage } from './types'
import { UsageWorker } from './usage'
import { storageConfigFromEnv } from '@hcengineering/server-storage'

const setupMetadata = (): void => {
  setMetadata(serverToken.metadata.Secret, config.Secret)
  setMetadata(serverToken.metadata.Service, 'billing')
  setMetadata(serverClient.metadata.Endpoint, config.AccountsUrl)
}

export const main = async (): Promise<void> => {
  setupMetadata()

  configureAnalytics('billing', process.env.VERSION ?? '0.7.0')
  Analytics.setTag('application', 'billing')

  const metricsContext = initStatisticsContext('billing', {
    factory: () =>
      createOpenTelemetryMetricsContext(
        'billing',
        {},
        {},
        newMetrics(),
        new SplitLogger('billing', {
          root: join(process.cwd(), 'logs'),
          enableConsole: (process.env.ENABLE_CONSOLE ?? 'true') === 'true'
        })
      )
  })

  const db = await createDb(metricsContext, config.DbUrl)
  const storageConfigs: StorageConfig[] = storageConfigFromEnv().storages.filter((p) => p.kind === 'datalake')

  const queue = getPlatformQueue('billing')
  const workspaceProducer = queue.getProducer<QueueWorkspaceLimitsMessage>(metricsContext, QueueTopic.Workspace)
  const engine = new LimitsEngine(db, config.AccountsUrl, storageConfigs, workspaceProducer)

  const usageConsumer = queue.createBatchConsumer<BillingUsageMessage>(
    metricsContext,
    QueueTopic.BillingUsage,
    'billing-limits',
    async (ctx, msgs) => {
      for (const msg of msgs) {
        try {
          await engine.processUsageDelta(ctx, msg.value)
        } catch (err: any) {
          ctx.error('failed to process usage delta', { workspace: msg.value?.workspace, err })
        }
      }
    },
    { batchSize: 100, batchTimeout: 1000 }
  )

  // Plan changes (published by account-service) re-evaluate volume limits without a restart.
  const planConsumer = queue.createBatchConsumer<QueueWorkspaceMessage>(
    metricsContext,
    QueueTopic.Workspace,
    'billing-plan',
    async (ctx, msgs) => {
      for (const msg of msgs) {
        const value = msg.value
        if (value.type !== QueueWorkspaceEvent.LimitsChanged) continue
        if ((value as QueueWorkspaceLimitsMessage).category !== LimitCategory.Plan) continue
        await engine.recomputeWorkspace(ctx, msg.workspace)
      }
    },
    { batchSize: 50, batchTimeout: 500 }
  )

  // Publish already-exhausted states on startup (best-effort, non-blocking)
  void engine.startupScan(metricsContext).catch((err) => {
    metricsContext.error('startup limits scan failed', { err })
  })

  const worker = new UsageWorker(db, storageConfigs, config, async (ctx, workspace) => {
    await engine.recomputeWorkspace(ctx, workspace)
  })
  await worker.schedule(metricsContext)

  const { app, close } = await createServer(metricsContext, db, storageConfigs, config)
  const server = listen(app, config.Port)

  const shutdown = (): void => {
    void usageConsumer.close()
    void planConsumer.close()
    void workspaceProducer.close()
    void worker.close()
    close()
    server.close(() => process.exit())
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
  process.on('uncaughtException', (e) => {
    console.error(e)
  })
  process.on('unhandledRejection', (e) => {
    console.error(e)
  })
}
