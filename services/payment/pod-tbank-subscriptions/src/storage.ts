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
import { type AccountUuid, type WorkspaceUuid, SocialIdType } from '@hcengineering/core'

import { isFailedRenewal } from './utils'

export class SubscriptionStorage {
  constructor (
    private readonly accountClient: AccountClient,
    private readonly publish: (data: SubscriptionData) => Promise<void>
  ) {}

  async upsert (subscription: SubscriptionData): Promise<void> {
    await this.publish(subscription)
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

  // Atomic cross-pod charge claim — only the caller that gets claimed=true may charge this period.
  async claimCharge (
    subscriptionId: string,
    periodEnd: number,
    amount?: number
  ): Promise<{ claimed: boolean, status: string, intentId: string, heartbeatAt?: number }> {
    const { claimed, intent } = await this.accountClient.claimChargeIntent(subscriptionId, periodEnd, 'tbank', amount)
    return { claimed, status: intent.status, intentId: intent.id, heartbeatAt: intent.heartbeatAt }
  }

  async markCharge (intentId: string, status: 'charged' | 'failed', paymentId?: string): Promise<void> {
    await this.accountClient.markChargeIntent(intentId, status, paymentId)
  }

  async heartbeatCharge (intentId: string): Promise<void> {
    await this.accountClient.heartbeatChargeIntent(intentId)
  }

  // True if THIS pod won the takeover of an orphaned (lease-expired) pending intent.
  async reclaimStaleCharge (intentId: string, leaseMs: number): Promise<boolean> {
    return await this.accountClient.reclaimStaleChargeIntent(intentId, leaseMs)
  }

  /**
   * Tbank renewal candidates: server pre-filters by provider + status {active, past_due}, so cleanup,
   * grace and renewal all start from the same small set. The caller refines per its own predicate.
   */
  async getCandidates (): Promise<Subscription[]> {
    return await this.accountClient.getSubscriptionsByProvider('tbank')
  }

  static needsRenewal (sub: Subscription, now: number): boolean {
    if (sub.providerData?.rebillId === undefined) return false
    if (sub.status === SubscriptionStatus.Active) {
      return sub.periodEnd !== undefined && sub.periodEnd <= now
    }
    if (isFailedRenewal(sub)) {
      const retryAttempt = (sub.providerData?.retryAttempt as number) ?? 0
      if (retryAttempt >= 3) return false
      const retryAfter = (sub.providerData?.retryAfter as number) ?? 0
      if (retryAfter > now) return false
      return true
    }
    return false
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

  /**
   * Resolve the contact info (email + UI locale) of a subscription owner via the central
   * account server. `email` is the first email-type social id (or null when none). `locale`
   * is the account's preferred language (or null when unset) — callers fall back to a default.
   */
  async getAccountContact (accountUuid: AccountUuid): Promise<{ email: string | null, locale: string | null }> {
    const personInfo = await this.accountClient.getPersonInfo(accountUuid)
    const emailSocialId = personInfo.socialIds.find((s) => s.type === SocialIdType.EMAIL && s.isDeleted !== true)

    let locale: string | null = null
    try {
      const accountInfo = await this.accountClient.getAccountInfo(accountUuid)
      locale = accountInfo.locale ?? null
    } catch {
      // Locale is optional — fall back to the caller's default if it cannot be resolved.
    }

    return { email: emailSocialId?.value ?? null, locale }
  }
}
