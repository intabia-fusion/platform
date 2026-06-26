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

import { generateId, type MeasureContext, type WorkspaceUuid } from '@hcengineering/core'
import type { Express } from 'express'
import type { AccountClient, SubscriptionData, SubscriptionType } from '@hcengineering/account-client'
import { SubscriptionStatus } from '@hcengineering/account-client'
import type { CheckoutResponse, PaymentProvider, SubscribeRequest, SubscriptionPublisher } from '../index'

interface MockPlanPrice {
  priceMonthly?: string | number
  priceMonthlyPerUser?: string | number
}

/**
 * Mock payment provider for test stands.
 * Instantly activates subscriptions with no external API keys.
 * Limits are attached by the server (attachLimits) on checkout poll, matching real provider behavior.
 */
export class MockProvider implements PaymentProvider {
  readonly providerName = 'mock'

  private readonly accountClient: AccountClient
  private readonly frontUrl: string
  // planKey -> prices, used to compute amount (per-seat = priceMonthlyPerUser * quantity)
  private readonly plans: Record<string, MockPlanPrice>
  // checkoutId -> created subscription (for getSubscriptionByCheckout polling)
  private readonly checkoutMap = new Map<string, SubscriptionData>()

  constructor (accountClient: AccountClient, frontUrl: string, plans: Record<string, MockPlanPrice> = {}) {
    this.accountClient = accountClient
    this.frontUrl = frontUrl
    this.plans = plans
  }

  // Per-seat plans charge price-per-seat * seats; flat plans charge priceMonthly.
  private computeAmount (plan: string, quantity?: number): number {
    const item = this.plans[plan]
    if (item == null) return 0
    if (item.priceMonthlyPerUser != null) {
      return Number(item.priceMonthlyPerUser) * (quantity ?? 1)
    }
    const flat = Number(item.priceMonthly)
    return Number.isFinite(flat) ? flat : 0
  }

  async createSubscription (
    ctx: MeasureContext,
    request: SubscribeRequest,
    workspaceUuid: WorkspaceUuid,
    workspaceUrl: string,
    accountUuid: string
  ): Promise<CheckoutResponse> {
    const checkoutId = generateId()
    const providerSubscriptionId = generateId()
    const quantity = request.quantity

    const sub: SubscriptionData = {
      id: generateId(),
      workspaceUuid,
      accountUuid: accountUuid as any,
      provider: 'mock',
      providerSubscriptionId,
      providerCheckoutId: checkoutId,
      type: request.type,
      status: SubscriptionStatus.Active,
      plan: request.plan,
      limits: undefined,
      amount: this.computeAmount(request.plan, quantity),
      // quantity drives attachLimits (usersLimit) on the server side; undefined for flat plans.
      providerData: quantity != null ? { quantity } : undefined,
      periodStart: Date.now()
    }

    // Do not upsert here — the server upserts (attachLimits) right after createSubscription
    // because we report instant=true; no checkout page is involved.
    this.checkoutMap.set(checkoutId, sub)

    ctx.info('Mock: subscription created instantly', { plan: request.plan, type: request.type, workspaceUuid })

    // instant=true: the subscription is already active, so the client refetches instead of
    // redirecting+polling. checkoutUrl is a no-op fallback for clients that ignore the flag.
    return {
      instant: true,
      checkoutId,
      checkoutUrl: `${this.frontUrl}/workbench/${workspaceUrl}/setting/setting/billing/subscriptions`
    }
  }

  async getSubscriptionByCheckout (ctx: MeasureContext, checkoutId: string): Promise<SubscriptionData | null> {
    return this.checkoutMap.get(checkoutId) ?? null
  }

  async getSubscription (ctx: MeasureContext, subscriptionId: string): Promise<SubscriptionData | null> {
    return await this.accountClient.getSubscriptionById(subscriptionId)
  }

  async cancelSubscription (ctx: MeasureContext, providerSubscriptionId: string): Promise<SubscriptionData> {
    const sub = await this.accountClient.getSubscriptionByProviderId('mock', providerSubscriptionId)
    if (sub === null) throw new Error(`Mock: subscription not found: ${providerSubscriptionId}`)
    // Server upserts the returned value
    return { ...sub, status: SubscriptionStatus.Canceled }
  }

  async uncancelSubscription (ctx: MeasureContext, providerSubscriptionId: string): Promise<SubscriptionData> {
    const sub = await this.accountClient.getSubscriptionByProviderId('mock', providerSubscriptionId)
    if (sub === null) throw new Error(`Mock: subscription not found: ${providerSubscriptionId}`)
    // Server upserts the returned value
    return { ...sub, status: SubscriptionStatus.Active }
  }

  async updateSubscriptionPlan (
    ctx: MeasureContext,
    providerSubscriptionId: string,
    newPlan: string,
    _type: SubscriptionType,
    _workspaceUrl: string,
    _accountUuid: string,
    quantity?: number
  ): Promise<SubscriptionData | CheckoutResponse | null> {
    // Server passes the provider's subscription id, not our db id.
    const sub = await this.accountClient.getSubscriptionByProviderId('mock', providerSubscriptionId)
    if (sub === null) return null
    // Server attaches the new plan's limits and upserts the returned value.
    return {
      ...sub,
      plan: newPlan,
      status: SubscriptionStatus.Active,
      limits: undefined,
      amount: this.computeAmount(newPlan, quantity),
      providerData: quantity != null ? { ...sub.providerData, quantity } : sub.providerData
    }
  }

  async retryPayment (ctx: MeasureContext, providerSubscriptionId: string): Promise<SubscriptionData | null> {
    const sub = await this.accountClient.getSubscriptionByProviderId('mock', providerSubscriptionId)
    if (sub === null) return null
    // Server upserts the returned value
    return { ...sub, status: SubscriptionStatus.Active }
  }

  async reconcileActiveSubscriptions (
    _ctx: MeasureContext,
    _accountsUrl: string,
    _serviceToken: string,
    _publish: SubscriptionPublisher
  ): Promise<void> {
    // no-op: mock subscriptions are already consistent
  }

  registerWebhookEndpoints (
    _app: Express,
    _ctx: MeasureContext,
    _accountsUrl: string,
    _serviceToken: string,
    _publish: SubscriptionPublisher
  ): void {
    // no-op: mock needs no webhooks
  }
}
