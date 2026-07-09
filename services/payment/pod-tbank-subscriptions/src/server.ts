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
import { withServiceToken } from './middleware'
import { SubscriptionStorage } from './storage'
import {
  verifyWebhookToken,
  getPlanKey,
  buildOrderId,
  loadPricing,
  resolvePerSeatAmount,
  isPendingFirstPayment,
  nextPeriodEnd,
  formatTbankDueDate,
  orderFingerprint,
  buildRenewedSubscription,
  buildFailedChargeSubscription,
  type PlanPricing
} from './utils'
import { notifyPaymentFailed } from './notifications'
import type { TbankWebhookNotification, CreateSubscriptionRequest, UpdatePlanRequest, BillingPeriod } from './types'

// Link lifetime = how long the bank keeps the link payable (RedirectDueDate). Lease = heartbeat window
// for the holder pod. Takeover cancels the old link first.
const CHECKOUT_LINK_LIFETIME_MS = 5 * 60 * 1000
const CHECKOUT_LEASE_TIMEOUT_MS = 15 * 60 * 1000
const CHECKOUT_HEARTBEAT_MS = 1000
// Back-off before a manually-retried charge can be retried again. Deliberately shorter than the
// scheduler's RETRY_INTERVAL_MS (24h) — a manual retry is user-initiated, so a tighter window is fine.
const MANUAL_RETRY_INTERVAL_MS = 60 * 60 * 1000

// Shared 409 payloads for the checkout-reclaim tail (see respondAfterReclaim).
const IN_FLIGHT_RESPONSE = { reason: 'in_flight', error: 'Payment is being created, please retry shortly' } as const
const ALREADY_PAID_RESPONSE = {
  reason: 'already_paid',
  error: 'The pending payment has already been processed'
} as const

export async function createServer (
  ctx: MeasureContext,
  config: Config,
  tbank: TbankPayments,
  storage: SubscriptionStorage
): Promise<{ app: Express, close: () => void }> {
  const plans = await loadPricing(config.PaymentUrl)

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
    withServiceToken,
    wrapHandler(ctx, 'createSubscription', async (req, res) => {
      await handleCreateSubscription(ctx, config, tbank, storage, plans, req, res)
    })
  )

  app.get(
    '/api/v1/subscriptions/by-checkout/:checkoutId',
    withServiceToken,
    wrapHandler(ctx, 'getByCheckout', async (req, res) => {
      await handleGetByCheckout(storage, req, res)
    })
  )

  app.get(
    '/api/v1/subscriptions/:id',
    withServiceToken,
    wrapHandler(ctx, 'getSubscription', async (req, res) => {
      await handleGetSubscription(storage, req, res)
    })
  )

  app.post(
    '/api/v1/subscriptions/:id/cancel',
    withServiceToken,
    wrapHandler(ctx, 'cancelSubscription', async (req, res) => {
      await handleCancelSubscription(ctx, tbank, storage, req, res)
    })
  )

  app.post(
    '/api/v1/subscriptions/:id/updatePlan',
    withServiceToken,
    wrapHandler(ctx, 'updatePlan', async (req, res) => {
      await handleUpdatePlan(ctx, config, tbank, storage, plans, req, res)
    })
  )

  app.post(
    '/api/v1/subscriptions/:id/retry',
    withServiceToken,
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

/**
 * Cancel a pending checkout's bank link (first, so a concurrent pay is rejected) and free its claim.
 * Shared by forced switch and orphan takeover. true = bank confirmed CANCELED; false = already paid /
 * call failed -> caller must NOT open a new checkout (would double-charge).
 */
// Terminal tbank states where the money never moved: the link is already dead, so there is
// nothing to charge and the claim is safe to free. tbank rejects Cancel on these with an error.
const TBANK_DEAD_LINK_STATES = ['DEADLINE_EXPIRED', 'CANCELED', 'REJECTED']

async function cancelPendingCheckout (
  ctx: MeasureContext,
  tbank: TbankPayments,
  storage: SubscriptionStorage,
  paymentId: string
): Promise<boolean> {
  let dead = false
  try {
    const cancelResult = await tbank.cancelPayment({ PaymentId: paymentId })
    dead = cancelResult.Status === 'CANCELED' || TBANK_DEAD_LINK_STATES.includes(cancelResult.Status)
    if (!dead) {
      ctx.info('Pending checkout not cancelable', { paymentId, status: cancelResult.Status })
      return false
    }
  } catch (err: any) {
    // tbank refuses to cancel an already-dead payment (e.g. DEADLINE_EXPIRED) — treat as freed.
    const details: string = err?.details ?? err?.message ?? ''
    if (!TBANK_DEAD_LINK_STATES.some((s) => details.includes(s))) throw err
    ctx.info('Pending checkout already dead at tbank, releasing', { paymentId, details })
  }
  // Abandon the old draft (if still a pending first-payment) and release the claim.
  const oldDraft = await storage.getByProviderId(paymentId)
  if (oldDraft !== null && isPendingFirstPayment(oldDraft)) {
    await storage.upsert({
      ...oldDraft,
      status: SubscriptionStatus.Canceled,
      providerData: { ...oldDraft.providerData, modifiedAt: Date.now(), status: 'ABANDONED', pending: false }
    })
  }
  await storage.releaseCheckout(paymentId)
  return true
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
  const { type, plan, workspaceUuid, workspaceUrl, accountUuid, quantity, period, force } =
    req.body as CreateSubscriptionRequest

  ctx.info('Creating TBank subscription', { type, plan, workspaceUuid, accountUuid })

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
  // Exact order behind this request — a loser reuses the pending URL only on an exact match.
  const fingerprint = orderFingerprint(plan, seats, period)

  // Claim winner opens the payment: heartbeat the lease, then save URL + payment_id (reuse / release).
  const openCheckout = async (intentId: string): Promise<void> => {
    const heartbeat = setInterval(() => {
      void storage.heartbeatCharge(intentId)
    }, CHECKOUT_HEARTBEAT_MS)
    try {
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

      // Link the claim to the issued charge and save the URL for reuse before exposing the draft.
      await storage.setCheckoutPayment(intentId, String(paymentId), paymentURL)

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
        period,
        paymentURL
      )

      await storage.upsert(subscriptionData)

      res.json({ checkoutId: orderId, checkoutUrl: paymentURL })
    } finally {
      clearInterval(heartbeat)
    }
  }

  // Atomic guard vs parallel purchases for one (workspace, type): only the winner opens a payment.
  const claim = await storage.claimCheckout(workspaceUuid, type, fingerprint)

  if (claim.claimed) {
    await openCheckout(claim.intentId)
    return
  }

  // Lost the claim. Stale lease -> holder pod died mid-checkout, take over.
  const leaseFresh = claim.heartbeatAt !== undefined && Date.now() - claim.heartbeatAt < CHECKOUT_LEASE_TIMEOUT_MS
  if (!leaseFresh) {
    const wonTakeover = await storage.reclaimStaleCharge(claim.intentId, CHECKOUT_LEASE_TIMEOUT_MS)
    if (wonTakeover) {
      ctx.info('Took over orphaned checkout claim', { workspaceUuid, type })
      if (claim.paymentId !== undefined && claim.paymentId !== '') {
        // Cancel-first frees the key; re-claim with THIS request's order. Already paid -> keep it.
        const canceled = await cancelPendingCheckout(ctx, tbank, storage, claim.paymentId)
        if (!canceled) {
          res.status(409).json(ALREADY_PAID_RESPONSE)
          return
        }
        const reclaim = await storage.claimCheckout(workspaceUuid, type, fingerprint)
        await respondAfterReclaim(res, reclaim, async () => {
          await openCheckout(reclaim.intentId)
        })
        return
      }
      // Blind window: holder never issued a payment (no paymentId) -> nothing to cancel, reuse the row
      // in place. order_fingerprint stays the dead holder's — narrow edge.
      await openCheckout(claim.intentId)
      return
    }
  }

  // A different order is being paid for this type. Never hand back the winner's link for the wrong plan.
  if (claim.orderFingerprint !== undefined && claim.orderFingerprint !== fingerprint) {
    // Without force: tell the client, which shows a modal offering to wait or switch.
    if (force !== true) {
      ctx.info('Different checkout already active for this type', {
        workspaceUuid,
        type,
        requested: fingerprint,
        active: claim.orderFingerprint
      })
      res.status(409).json({ reason: 'other_checkout_active', error: 'A payment for a different plan is in progress' })
      return
    }

    // Forced switch: cancel the old pending payment, then claim the new order.
    if (claim.paymentId === undefined || claim.paymentId === '') {
      // Old checkout claimed but hasn't issued a payment yet — nothing to cancel; retry shortly.
      res.status(409).json(IN_FLIGHT_RESPONSE)
      return
    }

    const canceled = await cancelPendingCheckout(ctx, tbank, storage, claim.paymentId)
    if (!canceled) {
      // Old payment already went through (CONFIRMED/REFUNDED) — don't switch (would double-charge).
      res.status(409).json(ALREADY_PAID_RESPONSE)
      return
    }

    // Claim the new order on the now-free key and open its checkout. If someone raced in between,
    // reuse their URL or retry.
    const reclaim = await storage.claimCheckout(workspaceUuid, type, fingerprint)
    if (reclaim.claimed) {
      ctx.info('Switched checkout to a new plan', { workspaceUuid, type, plan })
    }
    await respondAfterReclaim(res, reclaim, async () => {
      await openCheckout(reclaim.intentId)
    })
    return
  }

  // Same order (repeat / second tab): reuse the winner's saved URL — unless the link has expired.
  if (claim.paymentUrl !== undefined && claim.paymentUrl !== '') {
    // The tbank link dies at createdOn + lifetime (RedirectDueDate). Past that it 404s, and the
    // DEADLINE_EXPIRED webhook that would free the claim may not have arrived yet — so replace it here.
    const linkExpired = Date.now() - claim.createdOn >= CHECKOUT_LINK_LIFETIME_MS
    if (!linkExpired) {
      ctx.info('Reusing pending TBank checkout', { workspaceUuid, type, plan })
      res.json({ checkoutUrl: claim.paymentUrl })
      return
    }

    ctx.info('Pending checkout link expired, issuing a fresh one', { workspaceUuid, type, plan })
    if (claim.paymentId !== undefined && claim.paymentId !== '') {
      const freed = await cancelPendingCheckout(ctx, tbank, storage, claim.paymentId)
      if (!freed) {
        // Cancel reported the payment already went through — the plan is paid, don't re-issue.
        res.status(409).json(ALREADY_PAID_RESPONSE)
        return
      }
    }
    const reclaim = await storage.claimCheckout(workspaceUuid, type, fingerprint)
    await respondAfterReclaim(res, reclaim, async () => {
      await openCheckout(reclaim.intentId)
    })
    return
  }

  // Winner claimed but has not written the URL yet — very short window while initPayment is in flight.
  // The client retries silently.
  res.status(409).json(IN_FLIGHT_RESPONSE)
}

/**
 * Shared tail of the checkout-reclaim ladder: after a reclaim attempt, either open the new checkout,
 * reuse a racing winner's URL, or report in_flight. Identical across all 4 reclaim call sites in
 * handleCreateSubscription; the surrounding conditions that lead here (takeover / forced switch /
 * link expiry) genuinely differ and are NOT merged.
 */
async function respondAfterReclaim (
  res: Response,
  reclaim: { claimed: boolean, paymentUrl?: string, intentId: string },
  openCheckout: () => Promise<void>
): Promise<void> {
  if (reclaim.claimed) {
    await openCheckout()
    return
  }
  if (reclaim.paymentUrl !== undefined && reclaim.paymentUrl !== '') {
    res.json({ checkoutUrl: reclaim.paymentUrl })
    return
  }
  res.status(409).json(IN_FLIGHT_RESPONSE)
}

/**
 * Resolve a subscription via `lookup`, writing the standard 404 response and returning null on miss.
 * Callers do `const sub = await loadSubscriptionOr404(...); if (sub === null) return`.
 */
async function loadSubscriptionOr404<T> (lookup: () => Promise<T | null>, res: Response): Promise<T | null> {
  const found = await lookup()
  if (found === null) {
    res.status(404).json({ error: 'Subscription not found' })
    return null
  }
  return found
}

async function handleGetByCheckout (storage: SubscriptionStorage, req: Request, res: Response): Promise<void> {
  const found = await loadSubscriptionOr404(async () => {
    const sub = await storage.findSubscriptionByCheckoutId(req.params.checkoutId)
    return sub !== null && isPendingFirstPayment(sub) ? null : sub
  }, res)
  if (found === null) return
  res.json(found)
}

async function handleGetSubscription (storage: SubscriptionStorage, req: Request, res: Response): Promise<void> {
  const sub = await loadSubscriptionOr404(async () => await findSubscription(storage, req.params.id), res)
  if (sub === null) return
  res.json(sub)
}

async function handleCancelSubscription (
  ctx: MeasureContext,
  tbank: TbankPayments,
  storage: SubscriptionStorage,
  req: Request,
  res: Response
): Promise<void> {
  const sub = await loadSubscriptionOr404(async () => await findSubscription(storage, req.params.id), res)
  if (sub === null) return

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
  const sub = await loadSubscriptionOr404(async () => await findSubscription(storage, req.params.id), res)
  if (sub === null) return

  // Same plan is a no-op for a live subscription; for a canceled one it is the uncancel path —
  // re-initiate payment for the same plan (the card was removed on cancel, a new checkout is needed).
  if (sub.plan === newPlan && sub.status !== SubscriptionStatus.Canceled) {
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
  const sub = await loadSubscriptionOr404(async () => await findSubscription(storage, req.params.id), res)
  if (sub === null) return

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
      const renewedData = buildRenewedSubscription(sub, Date.now(), chargeResult.PaymentId)
      await storage.upsert(renewedData)
      ctx.info('Manual retry payment succeeded', { subId: sub.id })
      res.json(renewedData)
    } else {
      const failedData = buildFailedChargeSubscription(
        sub,
        chargeResult.ErrorCode,
        chargeResult.Message,
        MANUAL_RETRY_INTERVAL_MS
      )
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

    // Idempotency guard: TBank delivers webhooks at-least-once
    const appliedPaymentId =
      (sub.providerData?.lastChargePaymentId as string | undefined) ?? // is set by recurrent charges (scheduler/retry)
      (sub.providerData?.paymentId as string | undefined) // is set by the initial checkout
    if (
      sub.status === SubscriptionStatus.Active &&
      sub.providerData?.pending !== true &&
      appliedPaymentId === typedNotification.PaymentId
    ) {
      ctx.info('Duplicate TBank webhook ignored', {
        paymentId: typedNotification.PaymentId,
        status: typedNotification.Status
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

    // Release the claim on CONFIRMED (money settled), freeing the key for a future purchase.
    // AUTHORIZED is intermediate (and absent for PayType 'O'). Idempotent for duplicate webhooks.
    if (typedNotification.Status === 'CONFIRMED') {
      await storage.releaseCheckout(typedNotification.PaymentId)
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

    // Release the claim on terminal failure so a retry needn't wait for the lease. Idempotent.
    await storage.releaseCheckout(typedNotification.PaymentId)
  } else if (typedNotification.Status === 'DEADLINE_EXPIRED' || typedNotification.Status === 'CANCELED') {
    // Link expired/canceled before payment: abandon the pending draft + release now (only a
    // still-pending first-payment draft, never an active sub).
    if (sub !== null && isPendingFirstPayment(sub)) {
      const now = Date.now()
      await storage.upsert({
        ...sub,
        status: SubscriptionStatus.Canceled,
        providerData: { ...sub.providerData, modifiedAt: now, status: 'ABANDONED', pending: false }
      })
      ctx.info('TBank checkout link expired/canceled, pending draft abandoned', {
        subId: sub.id,
        paymentId: typedNotification.PaymentId,
        status: typedNotification.Status
      })
    }
    await storage.releaseCheckout(typedNotification.PaymentId)
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
  period?: BillingPeriod,
  paymentUrl?: string
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
      period,
      // Checkout URL of the pending TBank payment
      paymentUrl,
      linkExpiresAt: paymentUrl !== undefined ? now + CHECKOUT_LINK_LIFETIME_MS : undefined
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
  // RedirectDueDate bounds the link lifetime (TBank default 24h). Lib accepts it (Joi) but omits it
  // from TS types -> extend the param type locally.
  const initParams: Parameters<typeof tbank.initPayment>[0] & { RedirectDueDate: string } = {
    Amount: amount,
    OrderId: orderId,
    Description: description,
    CustomerKey: accountUuid,
    Recurrent: 'Y',
    PayType: 'O',
    Language: 'ru',
    RedirectDueDate: formatTbankDueDate(Date.now() + CHECKOUT_LINK_LIFETIME_MS),
    NotificationURL: `${config.FrontUrl}/_tbank_subscriptions/api/v1/webhooks/tbank`,
    SuccessURL: `${config.FrontUrl}/workbench/${workspaceUrl}/setting/setting/billing/subscriptions?payment=success&order_id=${orderId}`,
    FailURL: `${config.FrontUrl}/workbench/${workspaceUrl}/setting/setting/billing/subscriptions?payment=canceled`
  }
  const initResult = await tbank.initPayment(initParams)

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
