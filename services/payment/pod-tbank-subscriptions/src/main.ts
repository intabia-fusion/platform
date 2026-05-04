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

import { Analytics } from '@hcengineering/analytics'
import { configureAnalytics, createOpenTelemetryMetricsContext, SplitLogger } from '@hcengineering/analytics-service'
import { newMetrics, systemAccountUuid } from '@hcengineering/core'
import { setMetadata } from '@hcengineering/platform'
import serverClient from '@hcengineering/server-client'
import serverToken, { generateToken } from '@hcengineering/server-token'
import { getClient } from '@hcengineering/account-client'
import { join } from 'path'
import TbankPayments from 'tbank-payments'

import config from './config'
import { createServer } from './server'
import { SubscriptionStorage } from './storage'
import { startScheduler } from './scheduler'

const setupMetadata = (): void => {
  setMetadata(serverToken.metadata.Secret, config.Secret)
  setMetadata(serverToken.metadata.Service, 'tbank-subscriptions')
  setMetadata(serverClient.metadata.Endpoint, config.AccountsUrl)
}

export const main = async (): Promise<void> => {
  setupMetadata()

  configureAnalytics('tbank-subscriptions', process.env.VERSION ?? '0.7.0')
  Analytics.setTag('application', 'tbank-subscriptions')

  const metricsContext = createOpenTelemetryMetricsContext(
    'tbank-subscriptions',
    {},
    {},
    newMetrics(),
    new SplitLogger('tbank-subscriptions', {
      root: join(process.cwd(), 'logs'),
      enableConsole: (process.env.ENABLE_CONSOLE ?? 'true') === 'true'
    })
  )

  // Initialize TBank client
  const tbank = new TbankPayments({
    merchantId: config.TbankTerminalKey,
    secret: config.TbankPassword,
    apiUrl: config.TbankUrl
  })

  // Initialize storage (uses AccountClient to talk to central account server)
  const serviceToken = generateToken(systemAccountUuid, undefined, { service: 'payment' })
  const accountClient = getClient(config.AccountsUrl, serviceToken)
  const storage = new SubscriptionStorage(accountClient)

  const { app, close } = await createServer(metricsContext, config, tbank, storage)

  const server = app.listen(config.Port, () => {
    console.log(`TBank subscriptions service listening on port ${config.Port}`)
  })

  // Start subscription renewal scheduler
  const scheduler = startScheduler(metricsContext, tbank, storage, config.SchedulerIntervalMinutes)

  const shutdown = (): void => {
    scheduler.close()
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
