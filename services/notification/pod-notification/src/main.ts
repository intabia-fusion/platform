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
import core, { type MeasureContext, systemAccountUuid, type Ref, type WorkspaceUuid } from '@hcengineering/core'
import notification, {
  PushSubscription,
  type PushCallData,
  type PushData,
  type PushDismissAllData,
  type PushDismissData,
  QueueNotificationMessage,
  PUSH_NOTIFICATION_TITLE_SIZE,
  PUSH_NOTIFICATION_BODY_SIZE,
  isQueueDismissAllMessage,
  isQueueDismissMessage,
  truncate
} from '@hcengineering/notification'
import { getPlatformQueue } from '@hcengineering/kafka'
import { QueueTopic } from '@hcengineering/server-core'
import { setMetadata } from '@hcengineering/platform'
import { withRetry, DelayStrategyFactory } from '@hcengineering/retry'
import serverClient, { getTransactorEndpoint } from '@hcengineering/server-client'
import serverToken, { generateToken } from '@hcengineering/server-token'
import { createRestClient } from '@hcengineering/api-client'
import webpush, { WebPushError } from 'web-push'

import config from './config'
import {
  apnsConfigured,
  Delivery,
  fcmConfigured,
  PushKind,
  pushTarget,
  rustoreConfigured,
  sendApns,
  sendApnsCallCancel,
  sendApnsDismiss,
  sendApnsVoip,
  sendFcm,
  sendFcmCall,
  sendFcmCallCancel,
  sendFcmDismiss,
  sendRustore,
  sendRustoreCall,
  sendRustoreCallCancel,
  sendRustoreDismiss,
  sendTimeoutMs
} from './mobile'
import { getCtx } from './utils'

const errorMessages = ['expired', 'Unregistered', 'No such subscription', 'VapidPkHashMismatch']

/** The push service host only: the path half of a Web Push endpoint is the subscription secret. */
function pushHost (endpoint: string): string {
  try {
    return new URL(endpoint).host
  } catch {
    return 'invalid'
  }
}

/** What a queue message asks for, as a span attribute: a push, a dismiss or a call end. */
function deliveryKind (value: QueueNotificationMessage): string {
  if (isQueueDismissAllMessage(value)) return 'dismiss-all'
  if (isQueueDismissMessage(value)) return 'dismiss'
  if (value.kind === 'call-cancel') return 'call-cancel'
  return 'notify'
}

/**
 * Native clients subscribe with a device token instead of a Web Push endpoint,
 * so the transport is chosen per subscription. The caller is unaware of the
 * split: it still posts one list and deletes whatever comes back dead.
 */
export async function sendPushToSubscription (
  ctx: MeasureContext,
  subscriptions: PushSubscription[],
  data: PushData,
  call?: PushCallData
): Promise<Ref<PushSubscription>[]> {
  const st = Date.now()
  // The one line that pins "we are about to send": same `notification` key as the planning service,
  // so the whole path can be grepped by it.
  ctx.info('push send start', {
    notification: data.tag,
    createdOn: data.createdOn,
    age: data.createdOn !== undefined ? st - data.createdOn : 0,
    subscriptions: subscriptions.length
  })
  // A call nobody can answer any more rings no phone: it goes out as an ordinary banner, a missed call.
  const ringing = call !== undefined && call.expiresAt > Date.now() ? call : undefined
  // Never anything but a live call on VoIP: iOS kills an app that does not turn a VoIP push into a call.
  const voip =
    ringing !== undefined && apnsConfigured()
      ? subscriptions.flatMap((sub) => {
          const target = pushTarget(sub.endpoint)
          return target.kind === PushKind.ApnsVoip ? [{ sub, token: target.token }] : []
        })
      : []
  const voipSent = Promise.all(voip.map(async (it) => await sendApnsVoip(it.token, data, ringing as PushCallData)))
  const promises = subscriptions.map(async (subscription) => {
    const target = pushTarget(subscription.endpoint)
    if (target.kind === PushKind.ApnsVoip) {
      const i = voip.findIndex((it) => it.sub === subscription)
      return i >= 0 && (await voipSent)[i] === Delivery.Gone ? subscription._id : null
    }
    if (target.kind === PushKind.Apns) {
      // A phone that rang through CallKit needs no banner; a failed VoIP delivery falls back to it,
      // or the call is lost without a trace. Decided per account, not per device: an old app on a
      // second iPhone of the same person gets nothing once any of its phones rang.
      if ((await voipSent).includes(Delivery.Ok)) return null
      if (apnsConfigured() && (await sendApns(target.token, data)) === Delivery.Gone) {
        return subscription._id
      }
      return null
    }
    if (target.kind === PushKind.Fcm) {
      if (!fcmConfigured()) return null
      const delivery =
        ringing !== undefined ? await sendFcmCall(target.token, data, ringing) : await sendFcm(target.token, data)
      return delivery === Delivery.Gone ? subscription._id : null
    }
    if (target.kind === PushKind.RuStore) {
      if (!rustoreConfigured()) {
        console.warn(`RuStore is not configured, skipping subscription ${subscription._id}`)
        return null
      }
      const delivery =
        ringing !== undefined
          ? await sendRustoreCall(target.token, data, ringing)
          : await sendRustore(target.token, data)
      return delivery === Delivery.Gone ? subscription._id : null
    }
    const host = pushHost(subscription.endpoint)
    const payload = JSON.stringify(data)
    const sentAt = Date.now()
    // `web-push` goes through `https.request` and the auto instrumentation reports no client span
    // for it, so the call to the push service is only visible through this one.
    try {
      await ctx.with('webpush.send', { host }, async () => {
        await webpush.sendNotification(subscription, payload, {
          TTL: config.TTL,
          timeout: sendTimeoutMs,
          headers: {
            Urgency: 'high'
          }
        })
      })
      // Accepted by the push service - the last point we can observe ourselves.
      ctx.info('push accepted by push service', { notification: data.tag, host, ms: Date.now() - sentAt })
      return null
    } catch (err: any) {
      console.error(`Failed to send push notification to subscription ${subscription._id}:`, err)
      if (err instanceof WebPushError) {
        // 404/410 is how a push service says the subscription is gone; some send no body with it.
        const bodyStr = err.body != null ? JSON.stringify(err.body) : ''
        if (err.statusCode === 404 || err.statusCode === 410 || errorMessages.some((p) => bodyStr.includes(p))) {
          return subscription._id
        }
      }
      return null
    }
  })
  const results = await Promise.all(promises)
  const dead = results.filter(notEmpty)
  ctx.info('push send done', { notification: data.tag, duration: Date.now() - st, dead: dead.length })
  return dead
}

/**
 * A dismiss goes to the native apps only. A web push has to show something, so there is
 * nothing to send a browser; the tab drops the in-app record itself.
 */
export async function sendDismissToSubscription (
  subscriptions: PushSubscription[],
  data: PushDismissData | PushDismissAllData
): Promise<Ref<PushSubscription>[]> {
  const promises = subscriptions.map(async (subscription) => {
    const target = pushTarget(subscription.endpoint)
    if (target.kind === PushKind.Apns) {
      if (apnsConfigured() && (await sendApnsDismiss(target.token, data)) === Delivery.Gone) {
        return subscription._id
      }
      return null
    }
    if (target.kind === PushKind.Fcm) {
      if (fcmConfigured() && (await sendFcmDismiss(target.token, data)) === Delivery.Gone) {
        return subscription._id
      }
      return null
    }
    if (target.kind === PushKind.RuStore) {
      if (rustoreConfigured() && (await sendRustoreDismiss(target.token, data)) === Delivery.Gone) {
        return subscription._id
      }
      return null
    }
    return null
  })
  const results = await Promise.all(promises)
  return results.filter(notEmpty)
}

/** Stops the ringing on the native apps; a VoIP token gets nothing, it may only carry calls. */
export async function sendCallCancelToSubscription (
  subscriptions: PushSubscription[],
  inviteId: string
): Promise<Ref<PushSubscription>[]> {
  const promises = subscriptions.map(async (subscription) => {
    const target = pushTarget(subscription.endpoint)
    let delivery: Delivery | undefined
    if (target.kind === PushKind.Apns && apnsConfigured()) {
      delivery = await sendApnsCallCancel(target.token, inviteId)
    } else if (target.kind === PushKind.Fcm && fcmConfigured()) {
      delivery = await sendFcmCallCancel(target.token, inviteId)
    } else if (target.kind === PushKind.RuStore && rustoreConfigured()) {
      delivery = await sendRustoreCallCancel(target.token, inviteId)
    }
    return delivery === Delivery.Gone ? subscription._id : null
  })
  const results = await Promise.all(promises)
  return results.filter(notEmpty)
}

async function removeDeadSubscriptions (
  ctx: MeasureContext,
  workspace: WorkspaceUuid,
  failedSubscriptionIds: Ref<PushSubscription>[]
): Promise<void> {
  try {
    const token = generateToken(systemAccountUuid, workspace, { service: config.ServiceId })
    const endpoint = await getTransactorEndpoint(token)
    const restClient = createRestClient(endpoint, workspace, token)

    for (const subId of failedSubscriptionIds) {
      try {
        await restClient.removeDoc(notification.class.PushSubscription, core.space.Workspace, subId)
        ctx.info(`Successfully removed invalid push subscription ${subId} from workspace ${workspace}`)
      } catch (removeErr: any) {
        ctx.error(`Failed to remove expired subscription ${subId}:`, { removeErr })
      }
    }
  } catch (clientErr: any) {
    ctx.error('Failed to initialize RestClient or fetch transactor endpoint for cleanup:', { clientErr })
  }
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

  setMetadata(serverClient.metadata.Endpoint, config.AccountsUrl)
  setMetadata(serverToken.metadata.Secret, config.Secret)
  setMetadata(serverToken.metadata.Service, config.ServiceId)

  const ctx = getCtx()
  const queue = getPlatformQueue(config.ServiceId, config.QueueRegion)

  const consumer = queue.createConsumer<QueueNotificationMessage>(
    ctx,
    QueueTopic.UserNotifications,
    queue.getClientId(),
    async (ctx, queueMessage) => {
      try {
        const value = queueMessage.value
        // `createdOn` is the transaction stamp the notification was planned from, so `age` is the
        // whole path an architect asks about: transaction applied -> push handed to the provider.
        const createdOn = 'createdOn' in value ? value.createdOn : undefined
        const kinds = Array.from(new Set(value.pushSubscriptions.map((it) => pushTarget(it.endpoint).kind))).join(',')
        // End of the queued part: `ageFromAwareness` tells for how long it waited.
        ctx.info('push received', {
          notification: value.id,
          kind: deliveryKind(value),
          ageFromAwareness: createdOn !== undefined ? Date.now() - createdOn : 0,
          subscriptions: value.pushSubscriptions.length,
          kinds
        })
        await ctx.with(
          // The trace continues from the notifications service: its `extractMeta` travels in the Kafka
          // headers, so this span is a child of `notification.publish` there.
          'notification.deliver',
          {
            // The id ties every stage of one message together: Uptrace filters and groups by it.
            notification: value.id,
            kind: deliveryKind(value),
            workspace: queueMessage.workspace,
            subscriptions: value.pushSubscriptions.length,
            kinds,
            // Milliseconds as a number on purpose: Uptrace sorts and aggregates by it
            // (`max(ageFromAwareness::int)`); a string attribute makes every aggregate "none".
            ...(createdOn !== undefined ? { ageFromAwareness: Date.now() - createdOn } : {})
          },
          async (deliver) => {
            await withRetry(
              async () => {
                let failedSubscriptionIds: Ref<PushSubscription>[] = []
                if (isQueueDismissAllMessage(value)) {
                  failedSubscriptionIds = await sendDismissToSubscription(value.pushSubscriptions, {
                    kind: value.kind,
                    workspace: queueMessage.workspace,
                    readUpTo: value.readUpTo
                  })
                } else if (isQueueDismissMessage(value)) {
                  failedSubscriptionIds = await sendDismissToSubscription(value.pushSubscriptions, {
                    kind: value.kind,
                    objectId: value.objectId,
                    objectClass: value.objectClass,
                    tags: value.tags,
                    readUpTo: value.readUpTo
                  })
                } else if (value.kind === 'call-cancel') {
                  failedSubscriptionIds = await sendCallCancelToSubscription(value.pushSubscriptions, value.objectId)
                } else if ((value.providers[notification.providers.PushNotificationProvider]?.length ?? 0) > 0) {
                  failedSubscriptionIds = await sendPushToSubscription(
                    // The delivery span's own context: a child of `notification.deliver`, not a sibling.
                    deliver,
                    value.pushSubscriptions,
                    {
                      tag: value.id,
                      title: truncate(value.title, PUSH_NOTIFICATION_TITLE_SIZE),
                      body: truncate(value.body, PUSH_NOTIFICATION_BODY_SIZE),
                      domain: value.domain,
                      url: value.url,
                      group: value.group,
                      objectId: value.objectId,
                      objectClass: value.objectClass,
                      createdOn: value.createdOn,
                      workspace: queueMessage.workspace
                    },
                    value.call
                  )
                }

                if (failedSubscriptionIds.length > 0) {
                  await removeDeadSubscriptions(deliver, queueMessage.workspace, failedSubscriptionIds)
                }
              },
              {
                maxRetries: 3,
                isRetryable: () => true,
                delayStrategy: DelayStrategyFactory.exponentialBackoff({
                  initialDelayMs: 1000,
                  maxDelayMs: 5000,
                  backoffFactor: 2.0
                })
              },
              'process-notification'
            )
          }
        )
      } catch (e: any) {
        ctx.error('Failed to process notification after retries, acknowledging poison message:', { e })
      }
    }
  )

  const shutdown = async (): Promise<void> => {
    try {
      await consumer.close()
    } catch (e) {
      console.error('Error closing consumer during shutdown:', e)
    } finally {
      process.exit(0)
    }
  }

  process.on('SIGINT', () => {
    void shutdown()
  })
  process.on('SIGTERM', () => {
    void shutdown()
  })
  process.on('uncaughtException', (e) => {
    console.error('Uncaught Exception:', e)
    process.exit(1)
  })
  process.on('unhandledRejection', (e) => {
    console.error('Unhandled Rejection:', e)
    process.exit(1)
  })
}
