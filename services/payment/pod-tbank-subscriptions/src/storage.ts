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

import {
  type AccountClient,
  type Subscription,
  type SubscriptionData,
  SubscriptionStatus
} from '@hcengineering/account-client'
import { type MeasureContext, type WorkspaceUuid } from '@hcengineering/core'

/**
 * Storage adapter for Tbank subscriptions.
 * Uses AccountClient to persist subscriptions in the central database.
 * This is the same approach used by Stripe/Polar providers.
 */
export class SubscriptionStorage {
  constructor (private readonly accountClient: AccountClient) {}

  async upsert (subscription: SubscriptionData): Promise<void> {
    await this.accountClient.upsertSubscription(subscription)
  }

  async getTransactionCount (workspaceUuid: WorkspaceUuid): Promise<number> {
    return (await this.accountClient.getSubscriptions(workspaceUuid)).filter((s) => s.provider === 'tbank').length
  }

  async getById (id: string): Promise<Subscription | null> {
    return await this.accountClient.getSubscriptionById(id)
  }

  async getByProviderId (providerSubscriptionId: string): Promise<Subscription | null> {
    return await this.accountClient.getSubscriptionByProviderId('tbank', providerSubscriptionId)
  }

  async getAll (workspaceUuid?: WorkspaceUuid, activeOnly?: boolean): Promise<Subscription[]> {
    return await this.accountClient.getSubscriptions(workspaceUuid, activeOnly)
  }

  async getSubscriptionsNeedingRenewal (ctx: MeasureContext): Promise<Subscription[]> {
    const allSubscriptions = await this.accountClient.getSubscriptions()
    const now = Date.now()

    const needingRenewal = allSubscriptions.filter((sub) => {
      if (sub.provider !== 'tbank') return false
      if (sub.providerData?.rebillId === undefined) return false

      if (sub.status === SubscriptionStatus.Active) {
        // Normal renewal: period ended
        return sub.periodEnd !== undefined && sub.periodEnd <= now
      }

      if (sub.status === SubscriptionStatus.PastDue) {
        // Failed payment retry: check retry counters
        const retryAttempt = (sub.providerData?.retryAttempt as number) ?? 0
        if (retryAttempt >= 3) return false
        const retryAfter = (sub.providerData?.retryAfter as number) ?? 0
        if (retryAfter > now) return false
        return true
      }

      return false
    })

    ctx.info('Subscriptions needing renewal', {
      total: allSubscriptions.length,
      needingRenewal: needingRenewal.length
    })

    return needingRenewal
  }

  async getActiveTbankSubscription (workspaceUuid: WorkspaceUuid): Promise<Subscription | null> {
    return (
      (await this.accountClient.getSubscriptions(workspaceUuid)).find(
        (s) =>
          s.provider === 'tbank' && (s.status === SubscriptionStatus.Active || s.status === SubscriptionStatus.Trialing)
      ) ?? null
    )
  }

  async findSubscriptionByCheckoutId (checkoutId: string): Promise<SubscriptionData | null> {
    return (
      (await this.accountClient.getSubscriptions()).find(
        (s) => s.provider === 'tbank' && s.providerCheckoutId === checkoutId
      ) ?? null
    )
  }
}
