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

import type { MeasureContext, WorkspaceUuid } from '@hcengineering/core'
import { type AccountClient, SubscriptionStatus, SubscriptionType } from '@hcengineering/account-client'
import { MockProvider } from '../provider'

describe('MockProvider', () => {
  const frontUrl = 'http://localhost:8083'
  let accountClient: jest.Mocked<AccountClient>
  let ctx: jest.Mocked<MeasureContext>
  let provider: MockProvider

  const request = { type: SubscriptionType.Tier, plan: 'team' } as any
  const workspaceUuid = 'ws-uuid' as WorkspaceUuid
  const workspaceUrl = 'myws'
  const accountUuid = 'acc-uuid'

  beforeEach(() => {
    accountClient = {
      getSubscriptionById: jest.fn(),
      getSubscriptionByProviderId: jest.fn(),
      upsertSubscription: jest.fn()
    } as any
    ctx = { info: jest.fn(), error: jest.fn() } as any
    provider = new MockProvider(accountClient, frontUrl)
  })

  test('createSubscription returns checkoutUrl back to billing page with checkout_id, does NOT upsert', async () => {
    const res = await provider.createSubscription(ctx, request, workspaceUuid, workspaceUrl, accountUuid)

    expect(res.checkoutId).toBeTruthy()
    expect(res.checkoutUrl).toBe(
      `${frontUrl}/workbench/${workspaceUrl}/setting/setting/billing/subscriptions?payment=success&checkout_id=${res.checkoutId}`
    )
    // Server attaches limits + upserts on poll, not the provider.
    expect(accountClient.upsertSubscription).not.toHaveBeenCalled()
  })

  test('getSubscriptionByCheckout returns the created active subscription with no limits', async () => {
    const res = await provider.createSubscription(ctx, request, workspaceUuid, workspaceUrl, accountUuid)
    const sub = await provider.getSubscriptionByCheckout(ctx, res.checkoutId)

    expect(sub).not.toBeNull()
    expect(sub?.status).toBe(SubscriptionStatus.Active)
    expect(sub?.plan).toBe('team')
    expect(sub?.provider).toBe('mock')
    expect(sub?.limits).toBeUndefined()
  })

  test('getSubscriptionByCheckout returns null for unknown checkout', async () => {
    expect(await provider.getSubscriptionByCheckout(ctx, 'nope')).toBeNull()
  })

  test('updateSubscriptionPlan looks up by providerSubscriptionId and returns new plan, no limits', async () => {
    accountClient.getSubscriptionByProviderId.mockResolvedValue({
      id: 'db-1',
      provider: 'mock',
      providerSubscriptionId: 'mock-1',
      plan: 'start',
      status: SubscriptionStatus.Active,
      limits: { storageLimitGB: 1 } as any
    } as any)

    const res: any = await provider.updateSubscriptionPlan(
      ctx,
      'mock-1',
      'business',
      SubscriptionType.Tier,
      workspaceUrl,
      accountUuid
    )

    expect(accountClient.getSubscriptionByProviderId).toHaveBeenCalledWith('mock', 'mock-1')
    expect(res.plan).toBe('business')
    expect(res.status).toBe(SubscriptionStatus.Active)
    // Server re-attaches limits for the new plan; provider clears stale ones.
    expect(res.limits).toBeUndefined()
  })

  test('updateSubscriptionPlan returns null when subscription not found', async () => {
    accountClient.getSubscriptionByProviderId.mockResolvedValue(null)
    const res = await provider.updateSubscriptionPlan(
      ctx,
      'missing',
      'business',
      SubscriptionType.Tier,
      workspaceUrl,
      accountUuid
    )
    expect(res).toBeNull()
  })

  test('cancelSubscription flips status to Canceled', async () => {
    accountClient.getSubscriptionByProviderId.mockResolvedValue({
      id: 'db-1',
      provider: 'mock',
      providerSubscriptionId: 'mock-1',
      status: SubscriptionStatus.Active
    } as any)
    const res = await provider.cancelSubscription(ctx, 'mock-1')
    expect(res.status).toBe(SubscriptionStatus.Canceled)
  })

  test('uncancelSubscription / retryPayment flip status back to Active', async () => {
    accountClient.getSubscriptionByProviderId.mockResolvedValue({
      id: 'db-1',
      provider: 'mock',
      providerSubscriptionId: 'mock-1',
      status: SubscriptionStatus.Canceled
    } as any)
    expect((await provider.uncancelSubscription(ctx, 'mock-1')).status).toBe(SubscriptionStatus.Active)
    expect((await provider.retryPayment(ctx, 'mock-1'))?.status).toBe(SubscriptionStatus.Active)
  })

  test('cancelSubscription throws when subscription not found', async () => {
    accountClient.getSubscriptionByProviderId.mockResolvedValue(null)
    await expect(provider.cancelSubscription(ctx, 'gone')).rejects.toThrow(/not found/)
  })
})
