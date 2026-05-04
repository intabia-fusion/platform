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
import type { Express } from 'express'
import type { AccountClient, SubscriptionData } from '@hcengineering/account-client'
import type { PaymentProvider, SubscribeRequest, CheckoutResponse } from '../index'

/**
 * TBank payment provider implementation.
 *
 * This provider delegates all subscription operations to the pod-tbank-subscriptions
 * service via HTTP calls. It does not interact with TBank API directly.
 */
export class TbankProvider implements PaymentProvider {
  readonly providerName = 'tbank'
  private readonly tbankUrl: string
  private readonly accountClient: AccountClient

  constructor (tbankSubscriptionsUrl: string, accountClient: AccountClient) {
    // Strip trailing slash for clean URL joining
    this.tbankUrl = tbankSubscriptionsUrl.replace(/\/+$/, '')
    this.accountClient = accountClient
  }

  async createSubscription (
    ctx: MeasureContext,
    request: SubscribeRequest,
    workspaceUuid: WorkspaceUuid,
    workspaceUrl: string,
    accountUuid: string
  ): Promise<CheckoutResponse> {
    const url = `${this.tbankUrl}/api/v1/subscriptions`
    ctx.info('Creating TBank subscription via proxy', {
      type: request.type,
      plan: request.plan,
      workspaceUuid,
      url
    })

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: request.type,
          plan: request.plan,
          workspaceUuid,
          workspaceUrl,
          accountUuid,
          customerEmail: request.customerEmail
        })
      })

      if (!response.ok) {
        const errorBody = await response.text()
        ctx.error('TBank subscription creation failed', { status: response.status, errorBody })
        throw new Error(`TBank subscription creation failed: ${response.status} ${errorBody}`)
      }

      const data = await response.json()
      return {
        checkoutId: data.checkoutId,
        checkoutUrl: data.checkoutUrl
      }
    } catch (err) {
      ctx.error('TBank subscription creation error', { err, workspaceUuid })
      throw err
    }
  }

  async getSubscription (ctx: MeasureContext, subscriptionId: string): Promise<SubscriptionData | null> {
    ctx.info('Getting TBank subscription', { subscriptionId })

    const response = await fetch(`${this.tbankUrl}/api/v1/subscriptions/${subscriptionId}`)

    if (response.status === 404) {
      return null
    }

    if (!response.ok) {
      const errorBody = await response.text()
      ctx.error('Failed to get TBank subscription', { status: response.status, errorBody })
      throw new Error(`Failed to get TBank subscription: ${response.status} ${errorBody}`)
    }

    return await response.json()
  }

  async getSubscriptionByCheckout (ctx: MeasureContext, checkoutId: string): Promise<SubscriptionData | null> {
    ctx.info('Getting TBank subscription by checkout', { checkoutId })

    const response = await fetch(`${this.tbankUrl}/api/v1/subscriptions/by-checkout/${checkoutId}`)

    if (response.status === 404) {
      return null
    }

    if (!response.ok) {
      const errorBody = await response.text()
      ctx.error('Failed to get TBank subscription by checkout', { status: response.status, errorBody })
      throw new Error(`Failed to get TBank subscription by checkout: ${response.status} ${errorBody}`)
    }

    return await response.json()
  }

  async cancelSubscription (ctx: MeasureContext, providerSubscriptionId: string): Promise<SubscriptionData> {
    ctx.info('Canceling TBank subscription', { providerSubscriptionId })

    const response = await fetch(`${this.tbankUrl}/api/v1/subscriptions/${providerSubscriptionId}/cancel`, {
      method: 'POST'
    })

    if (!response.ok) {
      const errorBody = await response.text()
      ctx.error('TBank subscription cancellation failed', { status: response.status, errorBody })
      throw new Error(`TBank subscription cancellation failed: ${response.status} ${errorBody}`)
    }

    return await response.json()
  }

  async uncancelSubscription (ctx: MeasureContext, providerSubscriptionId: string): Promise<SubscriptionData> {
    ctx.info('Uncanceling TBank subscription', { providerSubscriptionId })

    // TBank doesn't support uncancel directly - check if subscription can be re-activated
    const response = await fetch(`${this.tbankUrl}/api/v1/subscriptions/${providerSubscriptionId}/updatePlan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: 'start' })
    })

    if (!response.ok) {
      const errorBody = await response.text()
      ctx.error('TBank subscription uncancel failed', { status: response.status, errorBody })
      throw new Error(`TBank subscription uncancel failed: ${response.status} ${errorBody}`)
    }

    return await response.json()
  }

  async updateSubscriptionPlan (
    ctx: MeasureContext,
    subscriptionId: string,
    newPlan: string,
    workspaceUrl: string,
    accountUuid: string
  ): Promise<SubscriptionData | CheckoutResponse | null> {
    ctx.info('Updating TBank subscription plan', { subscriptionId, newPlan })

    const response = await fetch(`${this.tbankUrl}/api/v1/subscriptions/${subscriptionId}/updatePlan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plan: newPlan,
        workspaceUrl,
        accountUuid
      })
    })

    if (!response.ok) {
      const errorBody = await response.text()
      ctx.error('TBank subscription plan update failed', { status: response.status, errorBody })
      throw new Error(`TBank subscription plan update failed: ${response.status} ${errorBody}`)
    }

    return await response.json()
  }

  async reconcileActiveSubscriptions (ctx: MeasureContext, accountsUrl: string, serviceToken: string): Promise<void> {
    // Reconciliation is handled by pod-tbank-subscriptions scheduler
    ctx.info('TBank subscription reconciliation skipped (handled by tbank-subscriptions scheduler)')
  }

  registerWebhookEndpoints (app: Express, ctx: MeasureContext, accountsUrl: string, serviceToken: string): void {
    // TBank webhooks are received directly by pod-tbank-subscriptions service
    // This provider does not register any webhook endpoints
    ctx.info('TBank provider: webhook endpoints handled by pod-tbank-subscriptions')
  }
}
