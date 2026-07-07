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

import { concatLink, type WorkspaceUuid } from '@hcengineering/core'
import { CheckoutResponse, SubscribeRequest, CheckoutStatus, SubscriptionData, type BillingPeriod } from './types'
import { PaymentError, NetworkError } from './error'

/**
 * Create a payment client instance
 * @param paymentUrl - URL of the payment service
 * @param token - Authentication token
 * @returns PaymentClient instance
 */
export function getClient (paymentUrl?: string, token?: string): PaymentClient {
  if (paymentUrl === undefined || paymentUrl == null || paymentUrl === '') {
    throw new Error('Payment service URL not specified')
  }
  if (token === undefined || token == null || token === '') {
    throw new Error('Authentication token not specified')
  }

  return new PaymentClient(paymentUrl, token)
}

/**
 * Payment service client
 * Handles all subscription and payment operations
 */
export class PaymentClient {
  private readonly headers: Record<string, string>

  constructor (
    private readonly endpoint: string,
    private readonly token: string
  ) {
    this.headers = {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json'
    }
  }

  /**
   * Create a subscription for a workspace
   * @param workspace - Workspace UUID
   * @param request - Subscription request details
   * @returns Checkout details with URL for payment
   */
  async createSubscription (workspace: WorkspaceUuid, request: SubscribeRequest): Promise<CheckoutResponse> {
    const path = `/api/v1/subscriptions/${workspace}/subscribe`
    const url = new URL(concatLink(this.endpoint, path))
    const body = JSON.stringify(request)
    const response = await fetchSafe(url, {
      method: 'POST',
      headers: { ...this.headers },
      body
    })
    return (await response.json()) as CheckoutResponse
  }

  /**
   * Get subscription details
   * @param subscriptionId - Subscription ID
   * @returns Subscription details from payment provider
   */
  async getSubscription (subscriptionId: string): Promise<SubscriptionData> {
    const path = `/api/v1/subscriptions/${subscriptionId}`
    const url = new URL(concatLink(this.endpoint, path))
    const response = await fetchSafe(url, { headers: { ...this.headers } })
    return (await response.json()) as SubscriptionData
  }

  /**
   * Cancel a subscription
   * @param subscriptionId - Subscription ID to cancel
   * @returns Cancellation confirmation
   */
  async cancelSubscription (subscriptionId: string): Promise<SubscriptionData> {
    const path = `/api/v1/subscriptions/${subscriptionId}/cancel`
    const url = new URL(concatLink(this.endpoint, path))
    const response = await fetchSafe(url, {
      method: 'POST',
      headers: { ...this.headers }
    })
    return (await response.json()) as SubscriptionData
  }

  /**
   * Uncancel a subscription (reactivate a previously canceled subscription)
   * @param subscriptionId - Subscription ID to uncancel
   * @returns Reactivation confirmation
   */
  async uncancelSubscription (subscriptionId: string): Promise<SubscriptionData> {
    const path = `/api/v1/subscriptions/${subscriptionId}/uncancel`
    const url = new URL(concatLink(this.endpoint, path))
    const response = await fetchSafe(url, {
      method: 'POST',
      headers: { ...this.headers }
    })
    return (await response.json()) as SubscriptionData
  }

  /**
   * Update a subscription to a different plan
   * For free-to-paid upgrades, returns CheckoutResponse (requires checkout)
   * For paid-to-paid updates, returns SubscriptionData (direct update)
   * @param subscriptionId - Subscription ID to update
   * @param plan - New plan name
   * @param quantity - Number of seats for per-seat plans (total charge = price-per-seat * quantity)
   * @param period - Billing period; 'yearly' applies the plan's yearly discount. Defaults to 'monthly'.
   * @returns CheckoutResponse for free-to-paid upgrades or updated SubscriptionData for direct updates
   */
  async updateSubscriptionPlan (
    subscriptionId: string,
    plan: string,
    quantity?: number,
    period?: BillingPeriod,
    force?: boolean
  ): Promise<SubscriptionData | CheckoutResponse> {
    const path = `/api/v1/subscriptions/${subscriptionId}/updatePlan`
    const url = new URL(concatLink(this.endpoint, path))
    const body = JSON.stringify({ plan, quantity, period, force })
    const response = await fetchSafe(url, {
      method: 'POST',
      headers: { ...this.headers },
      body
    })
    return (await response.json()) as SubscriptionData | CheckoutResponse
  }

  /**
   * Get checkout status
   * Poll this endpoint after user returns from payment provider to check if subscription is ready
   * @param checkoutId - Checkout ID returned from createSubscription
   * @returns Checkout status with subscription details if completed
   */
  async getCheckoutStatus (checkoutId: string): Promise<CheckoutStatus> {
    const path = `/api/v1/checkouts/${checkoutId}/status`
    const url = new URL(concatLink(this.endpoint, path))
    const response = await fetchSafe(url, { headers: { ...this.headers } })
    return (await response.json()) as CheckoutStatus
  }

  /**
   * Retry a failed payment for a subscription in past_due status.
   * Attempts to charge the saved payment method again.
   * @param subscriptionId - Subscription ID to retry payment for
   * @returns Updated subscription data
   */
  async retryPayment (subscriptionId: string): Promise<SubscriptionData> {
    const path = `/api/v1/subscriptions/${subscriptionId}/retry`
    const url = new URL(concatLink(this.endpoint, path))
    const response = await fetchSafe(url, {
      method: 'POST',
      headers: { ...this.headers }
    })
    return (await response.json()) as SubscriptionData
  }
}

/**
 * Safe fetch wrapper that handles errors consistently
 * @param url - URL to fetch
 * @param init - Fetch options
 * @returns Response
 * @throws NetworkError on network issues
 * @throws PaymentError on non-ok responses
 */
async function fetchSafe (url: string | URL, init?: RequestInit): Promise<Response> {
  let response
  try {
    response = await fetch(url, init)
  } catch (err: unknown) {
    throw new NetworkError(`Network error: ${String(err)}`)
  }

  if (!response.ok) {
    const text = await response.text()
    let parsed: { error?: string, reason?: string } | undefined
    try {
      parsed = JSON.parse(text)
    } catch {
      /* body isn't JSON */
    }
    if (parsed !== undefined) {
      throw new PaymentError(parsed.error ?? text, response.status, parsed.reason)
    }
    throw new PaymentError(`Payment service error: ${response.status} ${text}`, response.status)
  }

  return response
}
