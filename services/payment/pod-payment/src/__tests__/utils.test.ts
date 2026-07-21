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

import { type SubscriptionData, SubscriptionStatus, SubscriptionType } from '@hcengineering/account-client'
import { hasGrantingTier, isFinalizedUserCancel } from '../utils'

function tier (status: SubscriptionStatus, providerStatus?: string): SubscriptionData {
  return {
    type: SubscriptionType.Tier,
    status,
    providerData: providerStatus !== undefined ? { status: providerStatus } : undefined
  } as unknown as SubscriptionData
}

describe('isFinalizedUserCancel', () => {
  it('true only for a Canceled tier with providerData.status CANCELED', () => {
    expect(isFinalizedUserCancel(tier(SubscriptionStatus.Canceled, 'CANCELED'))).toBe(true)
  })

  it('false for other Canceled reasons (ABANDONED/REPLACED/PLAN_CHANGE)', () => {
    expect(isFinalizedUserCancel(tier(SubscriptionStatus.Canceled, 'ABANDONED'))).toBe(false)
    expect(isFinalizedUserCancel(tier(SubscriptionStatus.Canceled, 'REPLACED'))).toBe(false)
    expect(isFinalizedUserCancel(tier(SubscriptionStatus.Canceled, 'PLAN_CHANGE'))).toBe(false)
  })

  it('false for a scheduled cancel still Active (willCancelAt not yet reached)', () => {
    expect(isFinalizedUserCancel(tier(SubscriptionStatus.Active, 'SCHEDULED_CANCEL'))).toBe(false)
  })

  it('false when providerData is missing', () => {
    expect(isFinalizedUserCancel(tier(SubscriptionStatus.Canceled))).toBe(false)
  })

  it('false for a non-tier subscription even with CANCELED', () => {
    const pkg = {
      type: SubscriptionType.Package,
      status: SubscriptionStatus.Canceled,
      providerData: { status: 'CANCELED' }
    } as unknown as SubscriptionData
    expect(isFinalizedUserCancel(pkg)).toBe(false)
  })
})

describe('hasGrantingTier', () => {
  it('false for a workspace full of canceled tiers (no free duplication)', () => {
    const subs = [
      tier(SubscriptionStatus.Canceled, 'CANCELED'),
      tier(SubscriptionStatus.Canceled, 'REPLACED'),
      tier(SubscriptionStatus.Expired)
    ]
    expect(hasGrantingTier(subs)).toBe(false)
  })

  it('true when an active free tier already exists (idempotent skip)', () => {
    const subs = [tier(SubscriptionStatus.Canceled, 'CANCELED'), tier(SubscriptionStatus.Active)]
    expect(hasGrantingTier(subs)).toBe(true)
  })

  it('true for past_due/readonly (still granting), false with none', () => {
    expect(hasGrantingTier([tier(SubscriptionStatus.PastDue)])).toBe(true)
    expect(hasGrantingTier([tier(SubscriptionStatus.ReadOnly)])).toBe(true)
    expect(hasGrantingTier([])).toBe(false)
  })

  it('ignores non-tier subscriptions', () => {
    const pkg = {
      type: SubscriptionType.Package,
      status: SubscriptionStatus.Active
    } as unknown as SubscriptionData
    expect(hasGrantingTier([pkg])).toBe(false)
  })
})
