//
// Copyright © 2025 Hardcore Engineering Inc.
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
  getClient,
  grantsPlan,
  makePlanKey,
  SubscriptionStatus,
  SubscriptionType,
  type SubscriptionData,
  type AccountClient
} from '@hcengineering/account-client'

/**
 * Get account client for service operations
 */
export function getAccountClient (accountsUrl: string, serviceToken: string): AccountClient {
  return getClient(accountsUrl, serviceToken)
}

export function getPlanKey (type: SubscriptionType, plan: string): string {
  return makePlanKey(plan, type)
}

/**
 * True for the exact event that should provision a free plan: a tier subscription finalized as
 * Canceled by the scheduler after a user-initiated cancel reaches its period end. Other Canceled
 * reasons (ABANDONED draft, REPLACED supersede, PLAN_CHANGE) carry a different providerData.status
 * and must NOT trigger free provisioning.
 */
export function isFinalizedUserCancel (sub: Pick<SubscriptionData, 'type' | 'status' | 'providerData'>): boolean {
  return (
    sub.type === SubscriptionType.Tier &&
    sub.status === SubscriptionStatus.Canceled &&
    sub.providerData?.status === 'CANCELED'
  )
}

/**
 * A workspace still has an effective plan if any tier subscription grants one (active/trialing/
 * past_due/readonly). Canceled/expired tiers do not — so a workspace full of canceled tiers returns
 * false. Used to keep free provisioning idempotent: skip when a granting tier already exists.
 */
export function hasGrantingTier (subs: SubscriptionData[]): boolean {
  return subs.some((s) => s.type === SubscriptionType.Tier && grantsPlan(s))
}
