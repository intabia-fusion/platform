//
// Copyright © 2023 Hardcore Engineering Inc.
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

import { notEmpty } from '@hcengineering/core'
import core, { systemAccountUuid, type Ref } from '@hcengineering/core'
import notification, { PushSubscription, type PushData, QueueNotificationMessage } from '@hcengineering/notification'
import { getPlatformQueue } from '@hcengineering/kafka'
import { QueueTopic } from '@hcengineering/server-core'
import { setMetadata } from '@hcengineering/platform'
import serverClient, { getTransactorEndpoint } from '@hcengineering/server-client'
import serverToken, { generateToken } from '@hcengineering/server-token'
import { createRestClient } from '@hcengineering/api-client'
import webpush, { WebPushError } from 'web-push'

import config from './config'
import { getCtx } from './utils'

const errorMessages = ['expired', 'Unregistered', 'No such subscription']

export async function sendPushToSubscription (
  subscriptions: PushSubscription[],
  data: PushData
): Promise<Ref<PushSubscription>[]> {
  const promises = subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification(subscription, JSON.stringify(data), {
        TTL: config.TTL,
        headers: {
          Urgency: 'high'
        }
      })
      return null
    } catch (err: any) {
      console.error(`Failed to send push notification to subscription ${subscription._id}:`, err)
      if (err instanceof WebPushError) {
        const bodyStr = err.body != null ? JSON.stringify(err.body) : ''
        if (errorMessages.some((p) => bodyStr.includes(p))) {
          return subscription._id
        }
      }
      return null
    }
  })
  const results = await Promise.all(promises)
  return results.filter(notEmpty)
}

export const main = async (): Promise<void> => {
  if (config.PushPublicKey !== undefined && config.PushPrivateKey !== undefined) {
    try {
      const subj = config.PushSubject ?? 'mailto:hey@huly.io'
      console.log('Setting VAPID details', subj, config.PushPublicKey.length, config.PushPrivateKey.length)
      webpush.setVapidDetails(config.PushSubject ?? 'mailto:hey@huly.io', config.PushPublicKey, config.PushPrivateKey)
    } catch (err: any) {
      console.error(err)
    }
  }

  if (config.AccountsUrl !== undefined && config.ServerSecret !== undefined) {
    try {
      setMetadata(serverClient.metadata.Endpoint, config.AccountsUrl)
      setMetadata(serverToken.metadata.Secret, config.ServerSecret)
      setMetadata(serverToken.metadata.Service, config.ServiceId)
    } catch (err: any) {
      console.error('Failed to set platform metadata:', err)
    }
  }

  const ctx = getCtx()
  const queue = getPlatformQueue(config.ServiceId, config.QueueRegion)

  const consumer = queue.createConsumer<QueueNotificationMessage>(ctx, QueueTopic.UserNotifications, queue.getClientId(), async (ctx, queueMessage) => {
    try {
      const value = queueMessage.value
      const shouldPush = (value.providers[notification.providers.PushNotificationProvider]?.length ?? 0) > 0
      if (shouldPush) {
        const failedSubscriptionIds = await sendPushToSubscription(value.pushSubscriptions, {
          tag: value.id,
          title: value.title,
          body: value.body,
          domain: value.domain,
          url: value.url
        })

        if (failedSubscriptionIds.length > 0 && config.AccountsUrl !== undefined && config.ServerSecret !== undefined) {
          try {
            const token = generateToken(systemAccountUuid, queueMessage.workspace, { service: config.ServiceId })
            const endpoint = await getTransactorEndpoint(token)
            const restClient = createRestClient(endpoint, queueMessage.workspace, token)

            for (const subId of failedSubscriptionIds) {
              try {
                await restClient.removeDoc(notification.class.PushSubscription, core.space.Workspace, subId)
                ctx.info(`Successfully removed invalid push subscription ${subId} from workspace ${queueMessage.workspace}`)
              } catch (removeErr: any) {
                ctx.error(`Failed to remove expired subscription ${subId}:`, { removeErr })
              }
            }
          } catch (clientErr: any) {
            ctx.error('Failed to initialize RestClient or fetch transactor endpoint for cleanup:', { clientErr })
          }
        }
      }
    } catch (e) {
      ctx.error('Failed to process notification', { e })
      throw e
    }
  })

  const shutdown = async (): Promise<void> => {
    try {
      await consumer.close()
    } catch (e) {
      console.error('Error closing consumer during shutdown:', e)
    } finally {
      process.exit(0)
    }
  }

  process.on('SIGINT', () => { void shutdown() })
  process.on('SIGTERM', () => { void shutdown() })
  process.on('uncaughtException', (e) => {
    console.error('Uncaught Exception:', e)
    process.exit(1)
  })
  process.on('unhandledRejection', (e) => {
    console.error('Unhandled Rejection:', e)
    process.exit(1)
  })
}
