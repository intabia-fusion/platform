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

import { get } from 'svelte/store'
import { SubscriptionStatus, type SubscriptionData } from '@hcengineering/account-client'

import { resetSubscriptionStore, setSubscriptionState, subscriptionStore } from '../stores/subscription'

// svelte/store ships ESM-only; a three-method store is all this test needs.
jest.mock('svelte/store', () => {
  const writable = (initial: any): any => {
    let value = initial
    const subscribers = new Set<(v: any) => void>()
    const publish = (): void => {
      for (const fn of subscribers) fn(value)
    }
    return {
      set: (next: any) => {
        value = next
        publish()
      },
      update: (fn: (v: any) => any) => {
        value = fn(value)
        publish()
      },
      subscribe: (fn: (v: any) => void) => {
        subscribers.add(fn)
        fn(value)
        return () => subscribers.delete(fn)
      }
    }
  }
  return {
    writable,
    derived: () => ({ subscribe: () => () => {} }),
    get: (store: any) => {
      let value: any
      store.subscribe((v: any) => {
        value = v
      })()
      return value
    }
  }
})

// The store pulls the real utils (calculateLimits/checkUsageAgainstLimits); everything else it
// reaches is presentation plumbing that has no place in a unit test.
jest.mock('@hcengineering/platform', () => ({ getMetadata: jest.fn(() => 'test') }))
jest.mock('@hcengineering/login', () => ({ __esModule: true, default: { metadata: { AccountsUrl: {} } } }))
jest.mock('@hcengineering/presentation', () => ({
  __esModule: true,
  default: { metadata: { WorkspaceUuid: {}, Token: {}, PaymentUrl: {} } },
  getClient: jest.fn()
}))
jest.mock('@hcengineering/billing', () => ({ default: {} }))
jest.mock('@hcengineering/contact', () => ({ default: {} }))
jest.mock('@hcengineering/ai-bot', () => ({ aiBotEmailSocialKey: 'ai-bot:social:email' }))
jest.mock('@hcengineering/account-client', () => {
  const SubscriptionStatus = {
    Active: 'active',
    Trialing: 'trialing',
    PastDue: 'past_due',
    ReadOnly: 'readonly',
    Canceled: 'canceled',
    Paused: 'paused',
    Expired: 'expired'
  }
  return {
    getClient: jest.fn(),
    SubscriptionStatus,
    SubscriptionType: { Tier: 'tier', Support: 'support', Package: 'package', Purchase: 'purchase' },
    grantsPlan: jest.fn(),
    isCheckoutDraft: jest.fn(),
    // utils.ts imports it for checkIsLimited, which this test never reaches.
    GUEST_ROLES: []
  }
})
jest.mock('@hcengineering/billing-client', () => ({ getClient: jest.fn() }))
jest.mock('@hcengineering/payment-client', () => ({ getClient: jest.fn() }))
jest.mock('@hcengineering/core', () => ({
  AccountRole: {},
  getCurrentAccount: jest.fn(),
  hasAccountRole: jest.fn()
}))
jest.mock('@hcengineering/ui', () => ({ showPopup: jest.fn() }))
jest.mock('../components/SubscriptionsModal.svelte', () => ({}))

const DAY = 24 * 60 * 60 * 1000

// Account fills the free fallback on every tier read (server/account getSubscriptions), so an
// expired trial carries freeLimits just like any other tier.
const freeLimits = {
  storageLimitGB: 10,
  trafficLimitGB: 0,
  meetingMinutesLimit: 0,
  tokenLimit: 100000,
  usersLimit: 5
}

const tier = (over: Partial<SubscriptionData>): SubscriptionData =>
  ({ type: 'tier' as any, providerData: {}, ...over }) as unknown as SubscriptionData

describe('setSubscriptionState — free/overdue badge', () => {
  beforeEach(() => {
    resetSubscriptionStore()
  })

  it('an expired trial turns the free plan on and marks it overdue', () => {
    const expiredTrial = tier({
      status: SubscriptionStatus.Trialing,
      plan: 'trial',
      trialEnd: Date.now() - DAY,
      freeLimits
    })

    // What checkWorkspaceLimits passes: no granting tier (the expired trial grants nothing), the
    // expired trial as the status tier.
    setSubscriptionState(undefined, undefined, undefined, undefined, undefined, expiredTrial)

    const state = get(subscriptionStore)
    expect(state.onTrial).toBe(false)
    expect(state.onFreePlan).toBe(true)
    expect(state.freePlanOverdue).toBe(true)
  })
})
