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
  QueueTopic,
  QueueWorkspaceEvent,
  type QueueWorkspaceMessage,
  type QueueSubscriptionMessage,
  subscriptionEvents
} from '@hcengineering/server-core'
import { type SubscriptionData } from '@hcengineering/account-client'
import { isFinalizedUserCancel } from './utils'
import type { SubscriptionPublisher } from './providers'
import serverToken from '@hcengineering/server-token'
import { join } from 'path'
import config from './config'
import { createServer, listen } from './server'

const setupMetadata = (): void => {
  setMetadata(serverToken.metadata.Secret, config.Secret)
  setMetadata(serverToken.metadata.Service, 'payment')
  setMetadata(serverClient.metadata.Endpoint, config.AccountsUrl)
}

export const main = async (): Promise<void> => {
  setupMetadata()

  configureAnalytics('payment', process.env.VERSION ?? '0.7.0')
  Analytics.setTag('application', 'payment')

  const metricsContext = initStatisticsContext('payment', {
    factory: () =>
      createOpenTelemetryMetricsContext(
        'payment',
        {},
        {},
        newMetrics(),
        new SplitLogger('payment', {
          root: join(process.cwd(), 'logs'),
          enableConsole: (process.env.ENABLE_CONSOLE ?? 'true') === 'true'
        })
      )
  })

  // The queue is REQUIRED: provider events are durable through it and pod-payment is the single writer.
  const queue = getPlatformQueue('payment')
  const producer = queue.getProducer<QueueSubscriptionMessage>(metricsContext, QueueTopic.Subscription)
  const publish: SubscriptionPublisher = async (ctx, data, trigger, canceled) => {
    const msg =
      canceled === true
        ? subscriptionEvents.canceled(data, data.provider, trigger)
        : subscriptionEvents.upserted(data, data.provider, trigger)
    await producer.send(ctx, data.workspaceUuid, [msg])
  }

  const { app, ensureInitialSubscription, createFreeIfNoActiveTier, persistSubscription, close } = await createServer(
    metricsContext,
    config,
    publish
  )
  const server = listen(app, config.Port)

  let queueClose: (() => Promise<void>) | undefined
  {
    // 1) Workspace creation -> provision the initial tier (trial when configured, else free).
    const wsConsumer = queue.createBatchConsumer<QueueWorkspaceMessage>(
      metricsContext,
      QueueTopic.Workspace,
      'payment-free-tier',
      async (ctx, msgs) => {
        for (const msg of msgs) {
          if (msg.value.type !== QueueWorkspaceEvent.Created) continue
          await ensureInitialSubscription(msg.workspace)
        }
      },
      { batchSize: 20, batchTimeout: 500 }
    )
    // 2) Provider subscription events (stripe/polar/tbank webhook+reconcile+scheduler). This is the
    // SINGLE writer to the account DB for async provider events: bake limits + upsert via persistSubscription.
    // Idempotent (account dedups by provider+id), so redeliveries/replays are safe.
    const subConsumer = queue.createBatchConsumer<QueueSubscriptionMessage>(
      metricsContext,
      QueueTopic.Subscription,
      'payment-subscription-writer',
      async (ctx, msgs) => {
        for (const msg of msgs) {
          try {
            const sub = msg.value.subscription as SubscriptionData
            await persistSubscription(sub)
            // After a user initiated canceling finalized, we create free subscription.
            if (isFinalizedUserCancel(sub)) {
              await createFreeIfNoActiveTier(sub.workspaceUuid)
            }
          } catch (err: any) {
            ctx.error('failed to persist subscription event', {
              provider: msg.value.provider,
              trigger: msg.value.trigger,
              err
            })
            throw err // let the consumer retry rather than silently drop the event
          }
        }
      },
      { batchSize: 20, batchTimeout: 500 }
    )
    queueClose = async () => {
      await wsConsumer.close()
      await subConsumer.close()
      await producer.close()
    }
  }

  const shutdown = (): void => {
    void queueClose?.()
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
