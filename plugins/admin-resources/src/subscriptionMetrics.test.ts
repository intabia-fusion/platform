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

import { classifySubscription, currentTierSubscriptions, formatPaymentAmount } from './subscriptionMetrics'
import type { SubscriptionInfo } from '@hcengineering/account-client'

function subscription (values: Record<string, unknown>): SubscriptionInfo {
  const result = {
    id: 'one',
    workspaceUuid: 'workspace',
    provider: 'tbank',
    type: 'tier',
    plan: 'business',
    status: 'active',
    createdOn: 1,
    amount: 10000,
    ...values
  }
  return result as SubscriptionInfo
}

test('trial Business and limits never imply a paid subscription', () => {
  expect(classifySubscription(subscription({ provider: 'trial' }))).toBe('trial')
  expect(classifySubscription(subscription({ status: 'trialing' }))).toBe('trial')
  expect(classifySubscription(subscription({ amount: undefined, limits: { usersLimit: 100 } }))).toBe('other')
  expect(classifySubscription(subscription({ provider: 'free' }))).toBe('free')
  expect(classifySubscription(subscription({ plan: 'custom-free' }), ['custom-free'])).toBe('free')
  expect(classifySubscription(subscription({}))).toBe('paid')
  expect(classifySubscription(subscription({ provider: '' }))).toBe('other')
})

test('current tiers keep the latest granting tier per workspace until expiry sweep', () => {
  const older = subscription({})
  const newer = subscription({ id: 'two', createdOn: 2 })
  const expired = subscription({ workspaceUuid: 'expired', status: 'trialing', trialEnd: 9 })
  expect(currentTierSubscriptions([older, newer, expired])).toEqual([newer, expired])
  const sameTime = subscription({ id: 'three', createdOn: 1 })
  expect(currentTierSubscriptions([sameTime, older])).toEqual([sameTime])
  expect(currentTierSubscriptions([older, sameTime])).toEqual([sameTime])
})

test('money preserves kopecks and never assigns RUB to unknown providers', () => {
  expect(formatPaymentAmount(101, 'tbank')).toBe(
    (1.01).toLocaleString(undefined, { style: 'currency', currency: 'RUB' })
  )
  expect(formatPaymentAmount(101, 'stripe')).toBe('101')
  expect(formatPaymentAmount(undefined, 'tbank')).toBe('-')
  expect(formatPaymentAmount('9007199254740993', 'tbank')).toBe('-')
})
