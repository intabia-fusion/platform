//
// Copyright © 2025 Hardcore Engineering Inc.
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

import cors from 'cors'
import express, { type Express, NextFunction, type Request, type Response } from 'express'
import { type Server } from 'http'
import { MeasureContext, systemAccountUuid } from '@hcengineering/core'
import morgan from 'morgan'
import onHeaders from 'on-headers'
import rateLimit from 'express-rate-limit'
import { generateToken } from '@hcengineering/server-token'
import { SubscriptionData, type WorkspaceLoginInfo } from '@hcengineering/account-client'

import { Config } from './config'
import { withAdmin, withLoginInfo, withOwner, withToken, type RequestWithAuth } from './middleware'
import { PaymentProviderFactory } from './factory'
import type { CheckoutResponse, PaymentProvider } from './providers'
import { SubscribeRequest } from './providers'
import { startActiveSubscriptionReconciliation } from './reconciliation'
import { getAccountClient } from './utils'
import yaml from 'js-yaml'
import { existsSync, readFileSync } from 'fs'

const KEEP_ALIVE_TIMEOUT = 5 // seconds

const subscriptionRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: 'Too many subscription requests, please try again later',
  standardHeaders: true
})

type AsyncRequestHandler = (ctx: MeasureContext, req: Request, res: Response) => Promise<void>

const handleRequest = async (
  ctx: MeasureContext,
  name: string,
  fn: AsyncRequestHandler,
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    await ctx.with(name, {}, (ctx) => {
      onHeaders(res, () => {
        const measurements = ctx.metrics?.measurements
        if (measurements !== undefined) {
          const values = []
          for (const [k, v] of Object.entries(measurements)) {
            values.push(`${k};dur=${v.value.toFixed(2)}`)
          }
          if (values.length > 0) {
            if (!res.headersSent) {
              res.setHeader('Server-Timing', values.join(', '))
            }
          }
        }
      })
      return fn(ctx, req, res)
    })
  } catch (err: unknown) {
    ctx.error('Failed to process payment request', { err })
    res.status(500).end()
  }
}

export async function createServer (ctx: MeasureContext, config: Config): Promise<{ app: Express, close: () => void }> {
  const app = express()
  app.set('trust proxy', true)
  app.use(cors())

  const childLogger = ctx.logger.childLogger?.('requests', { enableConsole: 'true' })
  const requests = ctx.newChild('requests', {}, { logger: childLogger, span: false })
  class LogStream {
    write (text: string): void {
      requests.info(text)
    }
  }

  app.use(morgan('short', { stream: new LogStream() }))

  // Apply JSON parsing conditionally - skip for webhook routes
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/v1/webhooks/')) {
      // Webhooks need raw body for signature verification
      express.raw({ type: 'application/json' })(req, res, next)
    } else {
      // JSON parsing for all other routes
      express.json()(req, res, next)
    }
  })

  const serviceToken = generateToken(systemAccountUuid, undefined, { service: 'payment' })
  const accountClient = getAccountClient(config.AccountsUrl, serviceToken)

  let provider: PaymentProvider | undefined

  switch (config.Provider) {
    case 'polar':
      provider = PaymentProviderFactory.getInstance().create(
        'polar',
        {
          accessToken: config.PolarAccessToken,
          webhookSecret: config.PolarWebhookSecret,
          subscriptionPlans: config.PolarSubscriptionPlans,
          frontUrl: config.FrontUrl
        },
        accountClient,
        config.UseSandbox
      )
      break
    case 'stripe':
      provider = PaymentProviderFactory.getInstance().create(
        'stripe',
        {
          apiKey: config.StripeApiKey,
          webhookSecret: config.StripeWebhookSecret,
          subscriptionPlans: config.StripeSubscriptionPlans,
          frontUrl: config.FrontUrl
        },
        accountClient,
        false
      )
      break
    case 'tbank':
      provider = PaymentProviderFactory.getInstance().create(
        'tbank',
        {
          tbankSubscriptionsUrl: config.TbankSubscriptionsUrl
        },
        accountClient,
        false
      )
      break
    default:
      throw new Error(`Unknown payment provider: ${config.Provider}. Expected one of: polar, stripe, tbank`)
  }

  if (provider !== undefined) {
    provider.registerWebhookEndpoints(app, ctx, config.AccountsUrl, serviceToken)
    ctx.info(`${config.Provider} payment provider initialized successfully`)
  }

  if (provider == null) {
    throw new Error(`Failed to initialize payment provider: ${config.Provider}`)
  }

  // Plan config — loaded from PLAN_CONFIG env (YAML file path), falls back to empty config
  const planConfig: any = (() => {
    try {
      const configPath = config.PlanConfig
      if (configPath === undefined || configPath.length === 0) return { plans: {}, packages: {} }
      if (!existsSync(configPath)) {
        ctx.error('Plan config file not found', { path: configPath })
        return { plans: {}, packages: {} }
      }
      const content = readFileSync(configPath, 'utf-8')
      return yaml.load(content)
    } catch (err: any) {
      ctx.error('Failed to load plan config', { err })
      return { plans: {}, packages: {} }
    }
  })()

  app.get('/api/v1/plan-config', (req, res) => {
    res.json(planConfig)
  })

  function isPackageEligible (pkgKey: string, currentTierPlan: string | undefined): boolean {
    if (currentTierPlan === undefined) return false
    const pkg = planConfig?.packages?.[pkgKey]
    if (pkg === undefined) return false
    return Array.isArray(pkg.eligiblePlans) && pkg.eligiblePlans.includes(currentTierPlan)
  }

  const stopReconciliation = startActiveSubscriptionReconciliation(
    ctx,
    config.AccountsUrl,
    serviceToken,
    provider,
    config.ReconciliationIntervalMinutes ?? 60
  )

  // ============ Generic Payment Service Endpoints ============
  // These endpoints are provider-agnostic and work with any payment provider

  /**
   * POST /api/v1/subscriptions/:workspace/subscribe
   * Create a subscription for a workspace
   * Body: SubscribeRequest { type: 'tier' | 'support', plan: string, ... }
   */
  app.post(
    '/api/v1/subscriptions/:workspace/subscribe',
    subscriptionRateLimiter,
    withToken,
    withLoginInfo,
    withOwner,
    (req: RequestWithAuth, res: Response) => {
      if (provider === undefined || serviceToken === undefined) {
        res.status(503).json({ error: 'Payment provider is not configured' })
        return
      }

      void handleRequest(
        ctx,
        'create-subscription',
        async (ctx) => {
          const workspaceUuid = req.token?.workspace
          const accountUuid = req.token?.account
          const request = req.body as SubscribeRequest
          const loginInfo = req.loginInfo as WorkspaceLoginInfo

          if (accountUuid === undefined) {
            res.status(401).json({ error: 'Missing account in token' })
            return
          }

          if (workspaceUuid === undefined) {
            res.status(401).json({ error: 'Missing workspace in token' })
            return
          }

          if (loginInfo?.workspaceUrl === undefined) {
            res.status(401).json({ error: 'Missing workspace url in login info' })
            return
          }

          if (request.type === undefined || request.plan === undefined) {
            res.status(400).json({ error: 'Missing required fields: type, plan' })
            return
          }

          if (request.type === 'package') {
            const subscriptions = await accountClient.getSubscriptions(workspaceUuid)
            const activeTierPlan = subscriptions.find((s) => s.type === 'tier' && s.status === 'active')?.plan
            if (!isPackageEligible(request.plan, activeTierPlan)) {
              res.status(400).json({ error: 'Package not available on current plan' })
              return
            }
          }

          let createSubResponse: CheckoutResponse

          try {
            createSubResponse = await provider.createSubscription(
              ctx,
              request,
              workspaceUuid,
              loginInfo.workspaceUrl,
              accountUuid
            )
          } catch (err) {
            ctx.error('Failed to create subscription at provider', { err })
            res.status(500).json({ error: 'Failed to create subscription at provider' })
            return
          }

          res.status(200).json(createSubResponse)
        },
        req,
        res,
        () => {}
      )
    }
  )

  /**
   * POST /api/v1/subscriptions/:subscriptionId/cancel
   * Cancel a subscription
   * Authorization: Only workspace owner/admin can cancel
   */
  app.post(
    '/api/v1/subscriptions/:subscriptionId/cancel',
    withToken,
    withOwner,
    (req: RequestWithAuth, res: Response) => {
      if (provider === undefined) {
        res.status(503).json({ error: 'Payment provider is not configured' })
        return
      }

      void handleRequest(
        ctx,
        'cancel-subscription',
        async (ctx) => {
          const subscriptionId = req.params.subscriptionId

          // Get subscription from our database using internal ID
          const subscription = await accountClient.getSubscriptionById(subscriptionId)

          if (subscription === undefined || subscription === null) {
            res.status(404).json({ error: 'Subscription not found' })
            return
          }

          let canceledSubscription: SubscriptionData

          if (subscription.provider !== config.Provider) {
            // Cancel locally for provider-mismatched subscriptions
            const now = Date.now()
            canceledSubscription = {
              ...subscription,
              status: 'canceled' as any,
              canceledAt: now
            } as any
            await accountClient.upsertSubscription(canceledSubscription)
            ctx.info('Subscription canceled locally (provider mismatch)', {
              id: subscription.id,
              provider: subscription.provider
            })
          } else {
            try {
              // Cancel via provider using the provider's subscription ID
              const result = await provider.cancelSubscription(ctx, subscription.providerSubscriptionId)
              if (result === null) {
                res.status(404).json({ error: 'Failed to cancel subscription at provider' })
                return
              }
              canceledSubscription = result
              await accountClient.upsertSubscription(canceledSubscription)
            } catch (err) {
              ctx.error('Failed to cancel subscription at provider', { err })
              res.status(500).json({ error: 'Failed to cancel subscription at provider' })
              return
            }
          }

          res.status(200).json(canceledSubscription)
        },
        req,
        res,
        () => {}
      )
    }
  )

  /**
   * POST /api/v1/subscriptions/:subscriptionId/uncancel
   * Uncancel a previously canceled subscription
   * Authorization: Only workspace owner/admin can uncancel
   */
  app.post(
    '/api/v1/subscriptions/:subscriptionId/uncancel',
    withToken,
    withOwner,
    (req: RequestWithAuth, res: Response) => {
      if (provider === undefined) {
        res.status(503).json({ error: 'Payment provider is not configured' })
        return
      }

      void handleRequest(
        ctx,
        'uncancel-subscription',
        async (ctx) => {
          const subscriptionId = req.params.subscriptionId

          // Get subscription from our database using internal ID
          const subscription = await accountClient.getSubscriptionById(subscriptionId)

          if (subscription === undefined || subscription === null) {
            res.status(404).json({ error: 'Subscription not found' })
            return
          }

          let uncanceledSubscription: SubscriptionData

          if (subscription.provider !== config.Provider) {
            // Uncancel locally for provider-mismatched subscriptions
            uncanceledSubscription = {
              ...subscription,
              canceledAt: undefined,
              status: 'active' as any
            }
            await accountClient.upsertSubscription(uncanceledSubscription as any)
            ctx.info('Subscription uncanceled locally (provider mismatch)', {
              id: subscription.id,
              provider: subscription.provider
            })
          } else {
            try {
              // Uncancel via provider using the provider's subscription ID
              const result = await provider.uncancelSubscription(ctx, subscription.providerSubscriptionId)
              if (result === null) {
                res.status(404).json({ error: 'Failed to uncancel subscription at provider' })
                return
              }
              uncanceledSubscription = result
              await accountClient.upsertSubscription(uncanceledSubscription)
            } catch (err) {
              ctx.error('Failed to uncancel subscription at provider', { err })
              res.status(500).json({ error: 'Failed to uncancel subscription at provider' })
              return
            }
          }

          res.status(200).json(uncanceledSubscription)
        },
        req,
        res,
        () => {}
      )
    }
  )

  /**
   * POST /api/v1/subscriptions/:subscriptionId/updatePlan
   * Update a subscription to a different plan
   * Body: { plan: string } - The new plan name (e.g., 'start', 'standard', 'business')
   * Authorization: Only workspace owner/admin can update
   * Note: subscriptionId is the internal subscription ID, not the provider's ID
   */
  app.post(
    '/api/v1/subscriptions/:subscriptionId/updatePlan',
    subscriptionRateLimiter,
    withToken,
    withLoginInfo,
    withOwner,
    (req: RequestWithAuth, res: Response) => {
      if (provider === undefined) {
        res.status(503).json({ error: 'Payment provider is not configured' })
        return
      }

      void handleRequest(
        ctx,
        'update-plan',
        async (ctx) => {
          const subscriptionId = req.params.subscriptionId
          const { plan } = req.body
          const loginInfo = req.loginInfo as WorkspaceLoginInfo

          if (plan === undefined || typeof plan !== 'string') {
            res.status(400).json({ error: 'Missing or invalid field: plan' })
            return
          }

          if (loginInfo?.workspaceUrl === undefined) {
            res.status(401).json({ error: 'Missing workspace url in login info' })
            return
          }

          // Get subscription from our database using internal ID
          const subscription = await accountClient.getSubscriptionById(subscriptionId)

          if (subscription === undefined || subscription === null) {
            res.status(404).json({ error: 'Subscription not found' })
            return
          }

          const accountUuid = subscription.accountUuid ?? req.token?.account
          if (accountUuid == null) {
            res.status(400).json({ error: 'Missing account, cannot update plan' })
            return
          }

          if (subscription.type === 'package') {
            const subscriptions = await accountClient.getSubscriptions(subscription.workspaceUuid)
            const activeTierPlan = subscriptions.find((s) => s.type === 'tier' && s.status === 'active')?.plan
            if (!isPackageEligible(plan, activeTierPlan)) {
              res.status(400).json({ error: 'Package not available on current plan' })
              return
            }
          }

          // If the subscription was created by a different provider (e.g. manual/admin),
          // create a new subscription at the current provider instead of updating
          if (subscription.provider !== config.Provider) {
            ctx.info('Subscription provider mismatch, canceling old and creating new', {
              existingProvider: subscription.provider,
              currentProvider: config.Provider,
              workspaceUuid: subscription.workspaceUuid,
              plan
            })
            // Cancel old subscription locally before creating a new one at the current provider
            await accountClient.upsertSubscription({
              ...subscription,
              status: 'canceled' as any,
              canceledAt: Date.now()
            } as any)
            try {
              const request: SubscribeRequest = { type: subscription.type, plan }
              const checkoutResponse = await provider.createSubscription(
                ctx,
                request,
                subscription.workspaceUuid,
                loginInfo.workspaceUrl,
                accountUuid
              )
              res.status(200).json(checkoutResponse)
            } catch (err) {
              ctx.error('Failed to create subscription at provider', { err })
              res.status(500).json({ error: 'Failed to create subscription at provider' })
            }
            return
          }

          let updateResult: SubscriptionData | CheckoutResponse | null

          try {
            // Update via provider using the provider's subscription ID
            updateResult = await provider.updateSubscriptionPlan(
              ctx,
              subscription.providerSubscriptionId,
              plan,
              subscription.type,
              loginInfo.workspaceUrl,
              accountUuid
            )
          } catch (err) {
            ctx.error('Failed to update subscription at provider', { err })
            res.status(500).json({ error: 'Failed to update subscription at provider' })
            return
          }

          if (updateResult === null) {
            res.status(404).json({ error: 'Failed to update subscription at provider' })
            return
          }

          // Check if it's a CheckoutResponse (free-to-paid upgrade)
          if ('checkoutUrl' in updateResult) {
            // Return checkout response for free-to-paid upgrades
            res.status(200).json(updateResult)
            return
          }

          // It's a SubscriptionData - update was direct
          // Upsert the updated subscription into our database
          await accountClient.upsertSubscription(updateResult)

          res.status(200).json(updateResult)
        },
        req,
        res,
        () => {}
      )
    }
  )

  /**
   * GET /api/v1/subscriptions/:subscriptionId
   * Get subscription details
   * Authorization: Only admin can view billing details directly from provider
   * (Subscription contains sensitive pricing and payment information)
   */
  app.get('/api/v1/subscriptions/:subscriptionId', withToken, withAdmin, (req: RequestWithAuth, res: Response) => {
    if (provider === undefined) {
      res.status(503).json({ error: 'Payment provider is not configured' })
      return
    }

    void handleRequest(
      ctx,
      'get-subscription',
      async (ctx) => {
        const subscriptionId = req.params.subscriptionId
        const subscription = await provider.getSubscription(ctx, subscriptionId)
        res.status(200).json(subscription)
      },
      req,
      res,
      () => {}
    )
  })

  /**
   * GET /api/v1/checkouts/:checkoutId/status
   * Get subscription status by checkout ID
   * Used to poll for subscription creation after successful checkout
   * If subscription is found in Polar but not in our DB, it will be upserted
   * If it exists in DB but has changed (newer modifiedAt), it will be updated
   * Authorization: Only authenticated workspace owners can check checkout status
   */
  app.get('/api/v1/checkouts/:checkoutId/status', withToken, withOwner, (req: RequestWithAuth, res: Response) => {
    if (provider === undefined) {
      res.status(503).json({ error: 'Payment provider is not configured' })
      return
    }

    // Disable caching for this endpoint - we want fresh data on every poll
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate')
    res.set('Pragma', 'no-cache')
    res.set('Expires', '0')

    void handleRequest(
      ctx,
      'checkout-subscription-status',
      async (ctx) => {
        const checkoutId = req.params.checkoutId
        const accountClient = getAccountClient(config.AccountsUrl, serviceToken)

        // Try to get subscription from provider by checkout ID
        const subscriptionData = await provider.getSubscriptionByCheckout(ctx, checkoutId)

        if (subscriptionData !== null) {
          // For providers that pre-create a subscription before payment confirmation
          // (e.g. TBank), check providerData.pending flag to determine actual completion
          const isCompleted = subscriptionData.providerData?.pending !== true

          // Only sync to DB if subscription is confirmed (webhook received)
          if (isCompleted) {
            try {
              // Get existing subscription from our DB if it exists
              const existingSubscription = await accountClient.getSubscriptionByProviderId(
                subscriptionData.provider,
                subscriptionData.providerSubscriptionId
              )

              // Check if we should upsert (doesn't exist or has changed)
              const shouldUpsert =
                existingSubscription === null ||
                (subscriptionData.providerData?.modifiedAt !== undefined &&
                  (existingSubscription?.providerData?.modifiedAt ?? 0) < subscriptionData.providerData.modifiedAt)

              if (shouldUpsert) {
                await accountClient.upsertSubscription(subscriptionData)
                ctx.info('Subscription upserted from checkout poll', {
                  checkoutId,
                  subscriptionId: subscriptionData.id,
                  isNew: existingSubscription === null
                })
              }
            } catch (err) {
              ctx.error('Failed to sync subscription to DB', { checkoutId, err })
            }
          }

          res.status(200).json({
            checkoutId,
            subscriptionId: isCompleted ? subscriptionData.id : null,
            status: isCompleted ? 'completed' : 'pending',
            subscription: isCompleted ? subscriptionData : null
          })
          return
        }

        // Subscription not yet found in provider
        res.status(200).json({
          checkoutId,
          subscriptionId: null,
          status: 'pending',
          subscription: null
        })
      },
      req,
      res,
      () => {}
    )
  })

  app.use((_req, res) => {
    res.status(404).json({ message: 'Not Found' })
  })

  return {
    app,
    close: () => {
      stopReconciliation()
    }
  }
}

export function listen (e: Express, port: number, host?: string): Server {
  const cb = (): void => {
    console.log(`Service started at ${host ?? '*'}:${port}`)
  }

  const server = host !== undefined ? e.listen(port, host, cb) : e.listen(port, cb)
  server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT * 1000 + 1000
  server.headersTimeout = KEEP_ALIVE_TIMEOUT * 1000 + 2000

  return server
}
