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
import { SubscriptionStatus, SubscriptionType, type Subscription } from '@hcengineering/account-client'
import { type WorkspaceUuid } from '@hcengineering/core'

import { AccountLimitsProvider } from '../limitsProvider'

const getSubscriptions = jest.fn<Promise<Subscription[]>, [WorkspaceUuid, boolean?]>()

// Keep the real grantsPlan/enums (the resolution logic under test) — stub only client creation.
jest.mock('@hcengineering/account-client', () => ({
  ...jest.requireActual('@hcengineering/account-client'),
  getClient: () => ({ getSubscriptions })
}))
jest.mock('@hcengineering/server-token', () => ({ generateToken: () => 'token' }))

const WS = 'ws-1' as WorkspaceUuid
const GB = 1
const HOUR = 3600 * 1000

function tier (over: Partial<Subscription>): Subscription {
  const base: Partial<Subscription> = {
    id: 'id',
    workspaceUuid: WS,
    type: SubscriptionType.Tier,
    status: SubscriptionStatus.Active,
    plan: 'business',
    createdOn: 1,
    ...over
  }
  return base as unknown as Subscription
}

describe('AccountLimitsProvider.getPlanLimits', () => {
  const provider = new AccountLimitsProvider('http://account')
  afterEach(() => getSubscriptions.mockReset())

  it('returns the active tier limits', async () => {
    getSubscriptions.mockResolvedValue([tier({ limits: { storageLimitGB: 0.001, usersLimit: 1 } as any })])
    const l = await provider.getPlanLimits(WS)
    expect(l.storageLimitGB).toBe(0.001)
    expect(l.usersLimit).toBe(1)
  })

  it('picks the NEWEST granting tier, not the first Active row (overlap race)', async () => {
    // Two Active rows briefly coexist: an old free-wide one and the just-created narrow one.
    // .find(Active) could pick either; getPlanLimits must take the newest by createdOn.
    getSubscriptions.mockResolvedValue([
      tier({ id: 'old', createdOn: 100, limits: { storageLimitGB: 100, usersLimit: 5 } as any }),
      tier({ id: 'new', createdOn: 200, limits: { storageLimitGB: 0.001, usersLimit: 1 } as any })
    ])
    const l = await provider.getPlanLimits(WS)
    expect(l.storageLimitGB).toBe(0.001) // newest wins regardless of array order
  })

  it('a live trial grants its own limits', async () => {
    getSubscriptions.mockResolvedValue([
      tier({
        status: SubscriptionStatus.Trialing,
        trialEnd: Date.now() + 24 * HOUR,
        limits: { storageLimitGB: 50 * GB, usersLimit: 10 } as any
      })
    ])
    const l = await provider.getPlanLimits(WS)
    expect(l.usersLimit).toBe(10)
    expect(l.storageLimitGB).toBe(50)
  })

  it('an expired trial falls back to free limits, not its own', async () => {
    getSubscriptions.mockResolvedValue([
      tier({
        status: SubscriptionStatus.Trialing,
        trialEnd: Date.now() - HOUR, // past
        limits: { storageLimitGB: 50, usersLimit: 10 } as any,
        freeLimits: { storageLimitGB: 2, usersLimit: 5 } as any
      })
    ])
    const l = await provider.getPlanLimits(WS)
    expect(l.usersLimit).toBe(5) // free, not the trial's 10
    expect(l.storageLimitGB).toBe(2)
  })

  it('upgrading free -> business resolves to the business tier (regression: no free fallback)', async () => {
    // Free plan first (active-free), then a newer active business tier. Must resolve to business.
    getSubscriptions.mockResolvedValue([
      tier({ id: 'free', plan: 'free', createdOn: 10, limits: { storageLimitGB: 10, usersLimit: 5 } as any }),
      tier({ id: 'biz', plan: 'business', createdOn: 20, limits: { storageLimitGB: 0, usersLimit: 7 } as any })
    ])
    const l = await provider.getPlanLimits(WS)
    expect(l.usersLimit).toBe(7)
  })

  it('no granting tier -> newest tier free fallback', async () => {
    getSubscriptions.mockResolvedValue([
      tier({ status: SubscriptionStatus.Canceled, freeLimits: { storageLimitGB: 2, usersLimit: 5 } as any })
    ])
    const l = await provider.getPlanLimits(WS)
    expect(l.usersLimit).toBe(5)
  })

  it('client failure -> zero limits (fail closed to unlimited handled elsewhere)', async () => {
    getSubscriptions.mockRejectedValue(new Error('boom'))
    const l = await provider.getPlanLimits(WS)
    expect(l.usersLimit).toBe(0)
    expect(l.storageLimitGB).toBe(0)
  })
})
