//
// Copyright © 2024 Hardcore Engineering Inc.
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

import { setMetadata } from '@intabiafusion/platform'
import serverClient from '@intabiafusion/server-client'
import serverToken from '@intabiafusion/server-token'

import { Analytics } from '@intabiafusion/analytics'
import { SplitLogger, configureAnalytics, createOpenTelemetryMetricsContext } from '@intabiafusion/analytics-service'
import { newMetrics } from '@intabiafusion/core'
import { join } from 'path'

import { initStatisticsContext } from '@intabiafusion/server-core'
import config from './config'
import { createServer, listen } from './server'
import { setGeoipLogContext } from './geoip'

configureAnalytics('analytics-collector', process.env.VERSION ?? '0.7.0')
const ctx = initStatisticsContext('analytics-collector', {
  factory: () =>
    createOpenTelemetryMetricsContext(
      'analytics-collector-service',
      {},
      {},
      newMetrics(),
      new SplitLogger('analytics-collector-service', {
        root: join(process.cwd(), 'logs'),
        enableConsole: (process.env.ENABLE_CONSOLE ?? 'true') === 'true'
      })
    )
})

Analytics.setTag('application', 'analytics-collector-service')

export const main = async (): Promise<void> => {
  setMetadata(serverToken.metadata.Secret, config.Secret)
  setMetadata(serverClient.metadata.Endpoint, config.AccountsUrl)
  setMetadata(serverClient.metadata.UserAgent, config.ServiceID)

  // Set context for geoip logging
  setGeoipLogContext(ctx)

  ctx.info('Analytics service started', {
    accountsUrl: config.AccountsUrl
  })

  const app = createServer(ctx)
  const server = listen(app, config.Port)

  const shutdown = (): void => {
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
