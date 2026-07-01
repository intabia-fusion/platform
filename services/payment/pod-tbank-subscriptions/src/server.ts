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
import { type SubscriptionData, SubscriptionStatus, SubscriptionType } from '@hcengineering/account-client'
import express, { type Express, type Request, type Response } from 'express'
import cors from 'cors'
import type TbankPayments from 'tbank-payments'

import type { Config } from './config'
import { SubscriptionStorage } from './storage'
import {
  verifyWebhookToken,
  getPlanKey,
  buildOrderId,
  parsePlans,
  resolvePerSeatAmount,
  isPendingFirstPayment,
  nextPeriodEnd,
  type PlanPricing
} from './utils'
import { notifyPaymentFailed } from './notifications'
import type { TbankWebhookNotification, CreateSubscriptionRequest, UpdatePlanRequest, BillingPeriod } from './types'

export async function createServer (
  ctx: MeasureContext,
  config: Config,
  tbank: TbankPayments,
  storage: SubscriptionStorage
): Promise<{ app: Express, close: () => void }> {
  const plans = parsePlans(config.TbankSubscriptionPlans)

  const app = express()

  // Restrict CORS to CORS_ORIGIN (comma-separated) when configured; otherwise open cors() (dev/test).
  app.use(
    config.CorsOrigin !== undefined ? cors({ origin: config.CorsOrigin.split(',').map((o) => o.trim()) }) : cors()
  )

  // Use raw body for webhook routes (TBank signature verification needs raw body)
  // Use JSON parsing for all other routes
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/v1/webhooks/')) {
      express.raw({ type: 'application/json' })(req, res, next)
    } else {
      express.json()(req, res, next)
    }
  })

  app.post(
    '/api/v1/subscriptions',
    wrapHandler(ctx, 'createSubscription', async (req, res) => {
      await handleCreateSubscription(ctx, config, tbank, storage, plans, req, res)
    })
  )

  app.get(
    '/api/v1/subscriptions/by-checkout/:checkoutId',
    wrapHandler(ctx, 'getByCheckout', async (req, res) => {
      await handleGetByCheckout(storage, req, res)
    })
  )

  app.get(
    '/api/v1/subscriptions/:id',
    wrapHandler(ctx, 'getSubscription', async (req, res) => {
      await handleGetSubscription(storage, req, res)
    })
  )

  app.post(
    '/api/v1/subscriptions/:id/cancel',
    wrapHandler(ctx, 'cancelSubscription', async (req, res) => {
      await handleCancelSubscription(ctx, tbank, storage, req, res)
    })
  )

  app.post(
    '/api/v1/subscriptions/:id/updatePlan',
    wrapHandler(ctx, 'updatePlan', async (req, res) => {
      await handleUpdatePlan(ctx, config, tbank, storage, plans, req, res)
    })
  )

  app.post(
    '/api/v1/subscriptions/:id/retry',
    wrapHandler(ctx, 'retryPayment', async (req, res) => {
      await handleRetryPayment(ctx, tbank, storage, req, res)
    })
  )

  app.post(
    '/api/v1/webhooks/tbank',
    wrapHandler(ctx, 'webhook', async (req, res) => {
      await handleWebhook(ctx, config, tbank, storage, req, res)
    })
  )

  const close = (): void => {}
  return { app, close }
}

function wrapHandler (
  ctx: MeasureContext,
  name: string,
  method: (req: Request, res: Response) => Promise<void>
): (req: Request, res: Response) => void {
  return (req: Request, res: Response) => {
    method(req, res).catch((err: any) => {
      ctx.error(`Failed to ${name}`, { err })

      if (!res.headersSent) {
        res.status(500).json({ error: err.message })
      }
    })
  }
}

/**
 * Find a subscription by id or providerSubscriptionId.
 * Pod-payment passes providerSubscriptionId as the id parameter,
 * so we need to try both lookups.
 */
async function findSubscription (
  storage: SubscriptionStorage,
  idOrProviderId: string
): Promise<SubscriptionData | null> {
  // Try exact id match first (format: tbank_<paymentId>)
  const byId = await storage.getById(idOrProviderId)
  if (byId !== null) return byId

  // Fallback: search by providerSubscriptionId (the raw paymentId)
  return await storage.getByProviderId(idOrProviderId)
}

async function handleCreateSubscription (
  ctx: MeasureContext,
  config: Config,
  tbank: TbankPayments,
  storage: SubscriptionStorage,
  plans: Record<string, PlanPricing>,
  req: Request,
  res: Response
): Promise<void> {
  const { type, plan, workspaceUuid, workspaceUrl, accountUuid, quantity, period } =
    req.body as CreateSubscriptionRequest

  ctx.info('Creating TBank subscription', { type, plan, workspaceUuid, accountUuid })

  // Cancel any previously abandoned pending subscriptions for this workspace+type.
  // Abandoned = status PastDue with pending: true (user started checkout but never paid).
  // These would otherwise accumulate as orphans if the user abandons the payment page.
  // Re-fetch each sub before canceling to avoid race with a concurrent webhook.
  const existingPending = await storage.getAll(workspaceUuid, false)
  for (const sub of existingPending) {
    if (!isPendingFirstPayment(sub) || sub.type !== type) continue

    const freshSub = await storage.getById(sub.id)
    if (freshSub === null) continue
    if (!isPendingFirstPayment(freshSub)) continue

    // Mark as expired — the TBank-side payment will time out on its own.
    // Don't remove card (there's no card for pending-first-payment subs).
    const now = Date.now()
    await storage.upsert({
      ...freshSub,
      status: SubscriptionStatus.Canceled,
      providerData: {
        ...freshSub.providerData,
        modifiedAt: now,
        status: 'ABANDONED',
        pending: false
      }
    })
    ctx.info('Canceled abandoned pending subscription', { subId: sub.id, type, plan: sub.plan })
  }

  const planKey = getPlanKey(type, plan)
  const pricing = plans[planKey]
  if (pricing === undefined) {
    res.status(400).json({ error: `Unknown plan: ${planKey}` })
    return
  }
  // Per-seat plans charge price-per-seat * seats; yearly period applies the plan's yearly discount.
  const seats = quantity ?? 1
  const perSeatAmount = resolvePerSeatAmount(pricing, period === 'yearly')
  const amount = perSeatAmount * seats

  const transactionCount = await storage.getTransactionCount(workspaceUuid)
  const orderId = buildOrderId(workspaceUuid, transactionCount)

  const { paymentId, paymentURL } = await initTbankPayment(
    config,
    tbank,
    amount,
    orderId,
    `Subscription: ${plan} (${type})`,
    accountUuid,
    workspaceUrl
  )

  ctx.info('TBank payment initiated', { orderId, paymentId, planKey, amount, seats, period })

  const subscriptionData = buildSubscriptionData(
    String(paymentId),
    orderId,
    workspaceUuid,
    accountUuid,
    type,
    plan,
    amount,
    accountUuid,
    config.TbankTerminalKey,
    undefined,
    quantity,
    period
  )

  await storage.upsert(subscriptionData)

  res.json({ checkoutId: orderId, checkoutUrl: paymentURL })
}

async function handleGetByCheckout (storage: SubscriptionStorage, req: Request, res: Response): Promise<void> {
  const found = await storage.findSubscriptionByCheckoutId(req.params.checkoutId)
  if (found === null || isPendingFirstPayment(found)) {
    res.status(404).json({ error: 'Subscription not found' })
    return
  }
  res.json(found)
}

async function handleGetSubscription (storage: SubscriptionStorage, req: Request, res: Response): Promise<void> {
  const sub = await findSubscription(storage, req.params.id)
  if (sub === null) {
    res.status(404).json({ error: 'Subscription not found' })
    return
  }
  res.json(sub)
}

async function handleCancelSubscription (
  ctx: MeasureContext,
  tbank: TbankPayments,
  storage: SubscriptionStorage,
  req: Request,
  res: Response
): Promise<void> {
  const sub = await findSubscription(storage, req.params.id)
  if (sub === null) {
    res.status(404).json({ error: 'Subscription not found' })
    return
  }

  const canceledData = await cancelSubscription(ctx, tbank, storage, sub)
  res.json(canceledData)
}

async function handleUpdatePlan (
  ctx: MeasureContext,
  config: Config,
  tbank: TbankPayments,
  storage: SubscriptionStorage,
  plans: Record<string, PlanPricing>,
  req: Request,
  res: Response
): Promise<void> {
  const { plan: newPlan, quantity, period } = req.body as UpdatePlanRequest
  const sub = await findSubscription(storage, req.params.id)
  if (sub === null) {
    res.status(404).json({ error: 'Subscription not found' })
    return
  }

  // If sub.plan is already the requested plan, nothing to do
  if (sub.plan === newPlan) {
    res.status(400).json({ error: 'Already on this plan' })
    return
  }

  const planKey = getPlanKey(sub.type, newPlan)
  const pricing = plans[planKey]
  if (pricing === undefined) {
    res.status(400).json({ error: `Unknown plan: ${planKey}` })
    return
  }
  // Per-seat plans charge price-per-seat * seats; yearly period applies the plan's yearly discount.
  const seats = quantity ?? 1
  const perSeatAmount = resolvePerSeatAmount(pricing, period === 'yearly')
  const newAmount = perSeatAmount * seats

  // Mark the old subscription as pending replacement.
  // Do NOT cancel it yet — if the user never pays for the new plan,
  // the old subscription should remain active.
  const markedSub: SubscriptionData = {
    ...sub,
    providerData: {
      ...sub.providerData,
      pendingReplacement: true,
      replacementPlan: newPlan
    }
  }
  await storage.upsert(markedSub)

  const transactionCount = await storage.getTransactionCount(sub.workspaceUuid)
  const orderId = buildOrderId(sub.workspaceUuid, transactionCount)

  const workspaceUrl = (req.body as { workspaceUrl?: string }).workspaceUrl ?? ''

  const { paymentId, paymentURL } = await initTbankPayment(
    config,
    tbank,
    newAmount,
    orderId,
    `Subscription update: ${newPlan} (${sub.type})`,
    sub.accountUuid,
    workspaceUrl
  )

  // Pre-create a pending subscription for the new plan, will be confirmed via webhook
  const newSubscription = buildSubscriptionData(
    String(paymentId),
    orderId,
    sub.workspaceUuid,
    sub.accountUuid,
    sub.type,
    newPlan,
    newAmount,
    sub.accountUuid,
    config.TbankTerminalKey,
    undefined,
    quantity,
    period
  )
  await storage.upsert(newSubscription)

  ctx.info('New subscription payment initiated for plan update', {
    oldSubId: sub.id,
    newSubId: newSubscription.id,
    paymentId,
    newPlan
  })

  res.json({ checkoutId: orderId, checkoutUrl: paymentURL })
}

async function handleRetryPayment (
  ctx: MeasureContext,
  tbank: TbankPayments,
  storage: SubscriptionStorage,
  req: Request,
  res: Response
): Promise<void> {
  const sub = await findSubscription(storage, req.params.id)
  if (sub === null) {
    res.status(404).json({ error: 'Subscription not found' })
    return
  }

  // Allow manual retry both during grace (PastDue) and after it expired (ReadOnly):
  // the card may have recovered and the user wants to restore access immediately.
  if (sub.status !== SubscriptionStatus.PastDue && sub.status !== SubscriptionStatus.ReadOnly) {
    res.status(400).json({ error: 'Subscription is not in a retryable status' })
    return
  }

  const rebillId = sub.providerData?.rebillId as string | undefined
  if (rebillId === undefined) {
    res.status(400).json({ error: 'No recurring payment method available' })
    return
  }

  ctx.info('Manual retry payment', { subId: sub.id, plan: sub.plan })

  try {
    const chargeResult = await tbank.chargeRecurrent({
      PaymentId: sub.providerSubscriptionId,
      RebillId: rebillId
    })

    if (chargeResult.Success === true) {
      const now = Date.now()
      const renewedData: SubscriptionData = {
        ...sub,
        status: SubscriptionStatus.Active,
        periodStart: now,
        periodEnd: nextPeriodEnd(now, sub.providerData?.period as BillingPeriod | undefined),
        providerData: {
          ...sub.providerData,
          modifiedAt: now,
          status: 'ACTIVE',
          retryAttempt: 0,
          retryAfter: 0,
          lastChargeAt: now,
          lastChargePaymentId: chargeResult.PaymentId
        }
      }
      await storage.upsert(renewedData)
      ctx.info('Manual retry payment succeeded', { subId: sub.id })
      res.json(renewedData)
    } else {
      const now = Date.now()
      const prevAttempt = (sub.providerData?.retryAttempt as number) ?? 0
      const failedData: SubscriptionData = {
        ...sub,
        status: SubscriptionStatus.PastDue,
        providerData: {
          ...sub.providerData,
          modifiedAt: now,
          status: 'CHARGE_FAILED',
          retryAttempt: prevAttempt + 1,
          retryAfter: now + 60 * 60 * 1000,
          lastChargeError: chargeResult.Message,
          lastChargeErrorCode: chargeResult.ErrorCode
        }
      }
      await storage.upsert(failedData)
      ctx.warn('Manual retry payment failed', { subId: sub.id, errorCode: chargeResult.ErrorCode })
      res.status(402).json({ error: chargeResult.Message ?? 'Payment failed' })
    }
  } catch (err: any) {
    ctx.error('Manual retry payment error', { subId: sub.id, err })
    res.status(500).json({ error: err.message ?? 'Internal error' })
  }
}

async function handleWebhook (
  ctx: MeasureContext,
  config: Config,
  tbank: TbankPayments,
  storage: SubscriptionStorage,
  req: Request,
  res: Response
): Promise<void> {
  // req.body is a Buffer for webhook routes (raw body parsing)
  const rawBody = req.body as Buffer
  if (rawBody === undefined || rawBody === null || rawBody.length === 0) {
    ctx.error('Invalid TBank webhook body')
    res.status(200).send('OK')
    return
  }

  // Parse JSON from raw body for processing
  let notification: Record<string, any>
  try {
    notification = JSON.parse(rawBody.toString('utf8'))
  } catch {
    ctx.error('Invalid TBank webhook JSON')
    res.status(200).send('OK')
    return
  }

  if (!(config.TbankSkipWebhookVerification ?? false)) {
    const token = notification.Token as string | undefined
    if (token === undefined || !verifyWebhookToken(tbank, notification, token, rawBody.toString('utf8'))) {
      ctx.error('Invalid TBank webhook token')
      res.status(200).send('OK')
      return
    }
  }

  const typedNotification = notification as unknown as TbankWebhookNotification

  const sub = await storage.getByProviderId(typedNotification.PaymentId)

  ctx.info('Received TBank webhook', {
    paymentId: typedNotification.PaymentId,
    orderId: typedNotification.OrderId,
    status: typedNotification.Status,
    success: typedNotification.Success,
    workspaceUuid: sub?.workspaceUuid
  })

  if (typedNotification.Status === 'AUTHORIZED' || typedNotification.Status === 'CONFIRMED') {
    if (sub === null) {
      ctx.error('TBank webhook received but no pending subscription found', {
        paymentId: typedNotification.PaymentId,
        orderId: typedNotification.OrderId
      })
      res.status(200).send('OK')
      return
    }

    const subscriptionData = buildSubscriptionDataFromWebhook(typedNotification, sub)
    await storage.upsert(subscriptionData)
    ctx.info('TBank subscription activated via webhook', {
      paymentId: typedNotification.PaymentId,
      plan: subscriptionData.plan,
      rebillId: typedNotification.RebillId
    })

    // If this is a plan change, cancel the old subscription now that the new one is confirmed.
    // First check for a tbank sub with pendingReplacement flag (normal tbank updateSubscriptionPlan flow).
    // Otherwise, cancel any active subscription of the same type in the workspace
    // (handles provider-mismatch path where a new sub was created via createSubscription).
    const allSubs = await storage.getAll(subscriptionData.workspaceUuid)
    const oldSub = allSubs.find(
      (s) =>
        (s.provider === 'tbank' && s.providerData?.pendingReplacement === true) ||
        (s.type === subscriptionData.type && s.status === SubscriptionStatus.Active && s.id !== subscriptionData.id)
    )
    if (oldSub !== undefined && oldSub !== null) {
      await cancelSubscription(ctx, tbank, storage, oldSub, 'PLAN_CHANGE')
      ctx.info('Old subscription canceled after plan change confirmation', {
        oldSubId: oldSub.id,
        newSubId: subscriptionData.id,
        provider: oldSub.provider
      })
    }
  } else if (
    typedNotification.Status === 'REJECTED' ||
    typedNotification.Status === 'REVERSED' ||
    typedNotification.Status === 'REFUNDED'
  ) {
    if (sub !== null) {
      // Notify only when an active subscription fails (real renewal/charge failure).
      // Excludes: repeated webhooks on an already-past_due sub, the pending first-payment draft
      // (past_due + pending:true), and late REVERSED/REFUNDED on canceled/expired subscriptions.
      const wasActive = sub.status === SubscriptionStatus.Active
      // Mark as PastDue instead of canceling — keeps card and rebillId for retry
      const now = Date.now()
      const pastDueData: SubscriptionData = {
        ...sub,
        status: SubscriptionStatus.PastDue,
        providerData: {
          ...sub.providerData,
          modifiedAt: now,
          status: typedNotification.Status,
          pending: false,
          retryAttempt: 0,
          retryAfter: now + 60 * 60 * 1000
        }
      }
      await storage.upsert(pastDueData)
      ctx.info('TBank payment failed, subscription marked PastDue', {
        subId: sub.id,
        paymentId: typedNotification.PaymentId,
        status: typedNotification.Status
      })

      if (wasActive) {
        await notifyPaymentFailed(ctx, storage, config, pastDueData, 'failed')
      }
    }
  }

  res.status(200).send('OK')
}

function buildSubscriptionData (
  paymentId: string,
  orderId: string,
  workspaceUuid: WorkspaceUuid,
  accountUuid: string,
  type: string,
  plan: string,
  amount: number,
  customerKey: string,
  terminalKey: string,
  existingSub?: SubscriptionData,
  quantity?: number,
  period?: BillingPeriod
): SubscriptionData {
  const now = Date.now()
  return {
    id: existingSub?.id ?? `tbank_${paymentId}`,
    workspaceUuid,
    accountUuid: accountUuid as any,
    provider: 'tbank',
    providerSubscriptionId: paymentId,
    providerCheckoutId: orderId,
    type: type as SubscriptionType,
    status: SubscriptionStatus.PastDue,
    plan,
    amount,
    periodStart: existingSub?.periodStart ?? now,
    periodEnd: nextPeriodEnd(now, period),
    providerData: {
      modifiedAt: now,
      status: 'PENDING',
      paymentId,
      orderId,
      customerKey,
      terminalKey,
      pending: true,
      // Seats purchased for a per-seat plan. undefined for flat plans.
      quantity,
      // Billing period ('monthly' | 'yearly'). undefined defaults to monthly.
      period
    }
  }
}

function buildSubscriptionDataFromWebhook (
  notification: TbankWebhookNotification,
  existingSub: SubscriptionData
): SubscriptionData {
  const now = Date.now()

  return {
    id: existingSub.id,
    workspaceUuid: existingSub.workspaceUuid,
    accountUuid: existingSub.accountUuid,
    provider: 'tbank',
    providerSubscriptionId: notification.PaymentId,
    providerCheckoutId: notification.OrderId,
    type: existingSub.type,
    status: SubscriptionStatus.Active,
    plan: existingSub.plan,
    amount: notification.Amount,
    periodStart: existingSub.periodStart ?? now,
    periodEnd: nextPeriodEnd(now, existingSub.providerData?.period as BillingPeriod | undefined),
    providerData: {
      ...existingSub.providerData,
      modifiedAt: now,
      customerKey: notification.CustomerKey ?? existingSub.providerData?.customerKey,
      cardId: notification.CardId,
      pan: notification.Pan,
      rebillId: notification.RebillId,
      paymentId: notification.PaymentId,
      orderId: notification.OrderId,
      terminalKey: notification.TerminalKey,
      status: notification.Status,
      pending: false,
      // Successful payment clears retry state, so a later failure starts a fresh grace cycle
      // (matches buildRenewedSubscription / manual retry success). Without this a sub recovered
      // from ReadOnly would keep retryAttempt>=MAX and skip straight back to ReadOnly on next fail.
      retryAttempt: 0,
      retryAfter: 0
    }
  }
}

function buildCanceledSubscriptionData (sub: SubscriptionData, status?: string): SubscriptionData {
  return {
    ...sub,
    status: SubscriptionStatus.Canceled,
    providerData: {
      ...sub.providerData,
      modifiedAt: Date.now(),
      status: status ?? 'CANCELED',
      canceledAt: Date.now()
    }
  }
}

async function initTbankPayment (
  config: Config,
  tbank: TbankPayments,
  amount: number,
  orderId: string,
  description: string,
  accountUuid: string,
  workspaceUrl: string
): Promise<{ paymentId: number, paymentURL: string }> {
  const initResult = await tbank.initPayment({
    Amount: amount,
    OrderId: orderId,
    Description: description,
    CustomerKey: accountUuid,
    Recurrent: 'Y',
    PayType: 'O',
    Language: 'ru',
    NotificationURL: `${config.FrontUrl}/_tbank_subscriptions/api/v1/webhooks/tbank`,
    SuccessURL: `${config.FrontUrl}/workbench/${workspaceUrl}/setting/setting/billing/subscriptions?payment=success&order_id=${orderId}`,
    FailURL: `${config.FrontUrl}/workbench/${workspaceUrl}/setting/setting/billing/subscriptions?payment=canceled`
  })

  return {
    paymentId: initResult.PaymentId,
    paymentURL: initResult.PaymentURL ?? ''
  }
}

async function cancelSubscription (
  ctx: MeasureContext,
  tbank: TbankPayments,
  storage: SubscriptionStorage,
  sub: SubscriptionData,
  status?: string
): Promise<SubscriptionData> {
  const cardId = sub.providerData?.cardId as string | undefined
  const customerKey = sub.providerData?.customerKey as string | undefined

  if (cardId !== undefined && customerKey !== undefined) {
    try {
      await tbank.removeCard({ CustomerKey: customerKey, CardId: cardId })
      ctx.info('TBank card removed for canceled subscription', { subId: sub.id, cardId })
    } catch (err) {
      ctx.warn('Failed to remove TBank card during cancel', { subId: sub.id, err })
    }
  }

  const canceledData = buildCanceledSubscriptionData(sub, status)
  await storage.upsert(canceledData)

  ctx.info('Subscription canceled', { subId: sub.id })
  return canceledData
}
