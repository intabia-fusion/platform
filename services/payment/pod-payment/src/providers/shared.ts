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

import type { MeasureContext } from '@hcengineering/core'
import {
  AccountClient,
  SubscriptionStatus,
  type Subscription,
  type SubscriptionData
} from '@hcengineering/account-client'
import type { SubscriptionPublisher } from './index'

/**
 * Check if a subscription has changed by comparing modifiedAt timestamps
 * Returns true if the provider's version is newer than what we have stored
 */
export function hasSubscriptionChanged (ourSub: SubscriptionData, newData: SubscriptionData): boolean {
  const ourModifiedAt = ourSub.providerData?.modifiedAt
  const newModifiedAt = newData.providerData?.modifiedAt

  if (newModifiedAt === undefined) {
    return false
  }

  if (ourModifiedAt === undefined) {
    return true
  }

  return newModifiedAt > ourModifiedAt
}

const MUST_HAVE_PLANS = ['common@tier', 'rare@tier', 'epic@tier', 'legendary@tier']

/**
 * Parse the `type:value` `;`-separated subscription plan config string into a map keyed by
 * plan@type, verifying all required plans are present. `parseValue` turns the raw right-hand
 * side into whatever shape the provider stores (Stripe: single priceId string, Polar: productId[]).
 */
export function parseSubscriptionPlans<T> (
  subscriptionPlans: string,
  parseValue: (rawValue: string) => T
): Record<string, T> {
  const result: Record<string, T> = {}
  const plans = subscriptionPlans.split(';')
  for (const plan of plans) {
    const [type, rawValue] = plan.split(':')
    result[type] = parseValue(rawValue)
  }
  // TODO: verify all plans are present in the config - take them from model?
  // hardcoded check for now
  for (const plan of MUST_HAVE_PLANS) {
    if (result[plan] === undefined) {
      throw new Error(`Missing plan in config: ${plan}`)
    }
  }
  return result
}

/**
 * Shared reconciliation loop between our DB and a provider's active subscriptions. Providers pass
 * in their SDK-specific fetch/transform calls; the diffing + publish logic is identical across providers.
 */
/**
 * Cancel/uncancel a subscription via the provider SDK call, then transform the result. Identical
 * shape across providers modulo which SDK call and transform fn is passed in.
 */
export async function cancelOrUncancelSubscription<TProviderSub> (
  ctx: MeasureContext,
  providerSubscriptionId: string,
  action: 'cancel' | 'uncancel',
  sdkCall: (ctx: MeasureContext, providerSubscriptionId: string) => Promise<TProviderSub>,
  transform: (ctx: MeasureContext, sub: TProviderSub) => SubscriptionData | null
): Promise<SubscriptionData> {
  const providerSubscription = await sdkCall(ctx, providerSubscriptionId)
  const subscriptionData = transform(ctx, providerSubscription)

  if (subscriptionData == null) {
    throw new Error(`Failed to ${action} subscription ${providerSubscriptionId}`)
  }

  return subscriptionData
}

export async function reconcileActiveSubscriptions<TProviderSub> (
  ctx: MeasureContext,
  providerName: string,
  accountClient: AccountClient,
  publish: SubscriptionPublisher,
  getActiveSubscriptions: (ctx: MeasureContext) => Promise<TProviderSub[]>,
  getSubscription: (ctx: MeasureContext, providerSubscriptionId: string) => Promise<TProviderSub>,
  getSubId: (sub: TProviderSub) => string,
  transform: (ctx: MeasureContext, sub: TProviderSub) => SubscriptionData | null
): Promise<void> {
  try {
    ctx.info(`Starting ${providerName} active subscription reconciliation`)

    const providerActiveSubscriptions = await getActiveSubscriptions(ctx)
    const ourActiveSubscriptions = await accountClient.getSubscriptionsByProvider(providerName, [
      SubscriptionStatus.Active
    ])

    const ourSubsByProviderId = new Map(
      ourActiveSubscriptions.map((sub: Subscription) => [sub.providerSubscriptionId, sub])
    )

    const providerActiveIds = new Set(providerActiveSubscriptions.map((sub) => getSubId(sub)))

    // Step 1: Update subscriptions that exist in the provider and have changed
    let upsertCount = 0
    for (const providerSub of providerActiveSubscriptions) {
      const providerSubId = getSubId(providerSub)
      try {
        const subscriptionData = transform(ctx, providerSub)
        if (subscriptionData === null) {
          continue
        }

        const ourSub = ourSubsByProviderId.get(providerSubId)

        // Only publish if subscription doesn't exist locally or if key fields have changed
        if (ourSub === undefined || hasSubscriptionChanged(ourSub, subscriptionData)) {
          await publish(ctx, subscriptionData, 'reconcile')
          upsertCount++
        }
      } catch (err) {
        ctx.error('Failed to upsert active subscription', {
          providerSubId,
          err
        })
      }
    }

    // Step 2: Check for subscriptions we think are active but the provider says aren't
    let staleCount = 0
    for (const ourSub of ourActiveSubscriptions) {
      const providerSubId = ourSub.providerSubscriptionId
      if (!providerActiveIds.has(providerSubId)) {
        try {
          // Fetch the current state from the provider directly
          const currentState = await getSubscription(ctx, providerSubId)
          const subscriptionData = transform(ctx, currentState)

          // Publish current state (may have changed to canceled/ended)
          if (subscriptionData !== null) {
            await publish(ctx, subscriptionData, 'reconcile')
            staleCount++
          }
        } catch (err) {
          ctx.error('Failed to reconcile subscription status', {
            subscriptionId: providerSubId,
            err
          })
        }
      }
    }

    ctx.info(`${providerName} subscription reconciliation completed`, {
      [`${providerName}ActiveCount`]: providerActiveSubscriptions.length,
      ourActiveCount: ourActiveSubscriptions.length,
      upsertedCount: upsertCount,
      staleUpdatedCount: staleCount
    })
  } catch (err) {
    ctx.error(`${providerName} subscription reconciliation failed`, { err })
    throw err
  }
}
