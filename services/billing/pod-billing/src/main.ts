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

import { Analytics } from '@intabiafusion/analytics'
import { configureAnalytics, createOpenTelemetryMetricsContext, SplitLogger } from '@intabiafusion/analytics-service'
import { newMetrics } from '@intabiafusion/core'
import { setMetadata } from '@intabiafusion/platform'
import serverClient from '@intabiafusion/server-client'
import { initStatisticsContext, StorageConfig } from '@intabiafusion/server-core'
import serverToken from '@intabiafusion/server-token'
import { join } from 'path'

import config from './config'
import { createDb } from './db/postgres'
import { createServer, listen } from './server'
import { UsageWorker } from './usage'
import { storageConfigFromEnv } from '@intabiafusion/server-storage'

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

  const worker = new UsageWorker(db, storageConfigs, config)
  await worker.schedule(metricsContext)

  const { app, close } = await createServer(metricsContext, db, storageConfigs, config)
  const server = listen(app, config.Port)

  const shutdown = (): void => {
    void worker.close
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
