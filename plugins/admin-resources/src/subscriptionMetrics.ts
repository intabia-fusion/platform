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

import type { SubscriptionInfo } from '@hcengineering/account-client'

export type SubscriptionCategory = 'trial' | 'free' | 'paid' | 'other'

export function classifySubscription (
  subscription: Pick<SubscriptionInfo, 'provider' | 'status' | 'amount' | 'plan'>,
  freePlans: readonly string[] = ['free']
): SubscriptionCategory {
  if (subscription.provider === 'trial' || subscription.status === 'trialing') return 'trial'
  if (subscription.provider === 'free' || freePlans.includes(subscription.plan)) return 'free'
  if (subscription.provider !== '' && Number(subscription.amount) > 0) return 'paid'
  return 'other'
}

export function currentTierSubscriptions (subscriptions: SubscriptionInfo[]): SubscriptionInfo[] {
  const byWorkspace = new Map<string, SubscriptionInfo>()
  for (const subscription of subscriptions) {
    if (subscription.type !== 'tier') continue
    if (subscription.status !== 'active' && subscription.status !== 'trialing') continue
    const previous = byWorkspace.get(subscription.workspaceUuid)
    if (
      previous == null ||
      Number(subscription.createdOn) > Number(previous.createdOn) ||
      (Number(subscription.createdOn) === Number(previous.createdOn) && subscription.id > previous.id)
    ) {
      byWorkspace.set(subscription.workspaceUuid, subscription)
    }
  }
  return Array.from(byWorkspace.values())
}

export function formatPaymentAmount (amount: number | string | undefined, provider: string, language?: string): string {
  const value = Number(amount)
  if (amount == null || !Number.isSafeInteger(value)) return '-'
  if (provider === 'tbank') {
    return (value / 100).toLocaleString(language, { style: 'currency', currency: 'RUB' })
  }
  return value.toLocaleString(language, { maximumFractionDigits: 0 })
}
