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

import type { MeasureContext } from '@hcengineering/core'
import type { SubscriptionData } from '@hcengineering/account-client'

import type { Config } from './config'
import type { SubscriptionStorage } from './storage'

const MAIL_TIMEOUT_MS = 10_000

/**
 * Why the payment-failed email is being sent.
 * - 'failed': recurrent charge failed, subscription just entered past_due (will be retried automatically).
 * - 'final': automatic retries are exhausted, the subscription is about to be canceled.
 */
export type PaymentFailedReason = 'failed' | 'final'

interface MailMessage {
  subject: string
  text: string
  html: string
}

// Default language used when the account locale is unset or unsupported (primary market is RU).
const DEFAULT_LANG = 'ru'

type Lang = 'ru' | 'en'

type MessageBuilder = (plan: string, url: string) => MailMessage

const TEMPLATES: Record<Lang, Record<PaymentFailedReason, MessageBuilder>> = {
  ru: {
    failed: (plan, url) => ({
      subject: 'Не удалось списать оплату по подписке',
      text:
        `Мы не смогли списать оплату по вашей подписке «${plan}». Это могло произойти из-за ` +
        'недостатка средств, истёкшей карты или ограничения банка.\n\n' +
        'Мы автоматически повторим попытку в ближайшее время.\n\n' +
        `Вы можете повторить платёж вручную: ${url}\n\n` +
        'При необходимости свяжитесь с администратором ответным письмом.',
      html:
        `<p>Мы не смогли списать оплату по вашей подписке «<b>${plan}</b>». Это могло произойти из-за ` +
        'недостатка средств, истёкшей карты или ограничения банка.</p>' +
        '<p>Мы автоматически повторим попытку в ближайшее время.</p>' +
        `<p>Вы можете <a href="${url}">повторить платёж вручную</a>.</p>` +
        '<p>При необходимости свяжитесь с администратором ответным письмом.</p>'
    }),
    final: (plan, url) => ({
      subject: 'Не удалось списать оплату по подписке',
      text:
        `Мы несколько раз пытались списать оплату по вашей подписке «${plan}», но платёж не прошёл.\n\n` +
        'Автоматические попытки списания исчерпаны.\n\n' +
        `Вы можете повторить платёж вручную: ${url}\n\n` +
        'При необходимости свяжитесь с администратором ответным письмом.',
      html:
        `<p>Мы несколько раз пытались списать оплату по вашей подписке «<b>${plan}</b>», но платёж не прошёл.</p>` +
        '<p>Автоматические попытки списания исчерпаны.</p>' +
        `<p>Вы можете <a href="${url}">повторить платёж вручную</a>.</p>` +
        '<p>При необходимости свяжитесь с администратором ответным письмом.</p>'
    })
  },
  en: {
    failed: (plan, url) => ({
      subject: 'We could not charge your subscription',
      text:
        `We were unable to charge your subscription "${plan}". This may be due to ` +
        'insufficient funds, an expired card or a bank restriction.\n\n' +
        'We will automatically retry shortly.\n\n' +
        `You can also retry the payment manually: ${url}\n\n` +
        'If you need help, reply to this email to contact the administrator.',
      html:
        `<p>We were unable to charge your subscription "<b>${plan}</b>". This may be due to ` +
        'insufficient funds, an expired card or a bank restriction.</p>' +
        '<p>We will automatically retry shortly.</p>' +
        `<p>You can also <a href="${url}">retry the payment manually</a>.</p>` +
        '<p>If you need help, reply to this email to contact the administrator.</p>'
    }),
    final: (plan, url) => ({
      subject: 'We could not charge your subscription',
      text:
        `We tried several times to charge your subscription "${plan}", but the payment did not go through.\n\n` +
        'Automatic retries are now exhausted.\n\n' +
        `You can retry the payment manually: ${url}\n\n` +
        'If you need help, reply to this email to contact the administrator.',
      html:
        `<p>We tried several times to charge your subscription "<b>${plan}</b>", but the payment did not go through.</p>` +
        '<p>Automatic retries are now exhausted.</p>' +
        `<p>You can <a href="${url}">retry the payment manually</a>.</p>` +
        '<p>If you need help, reply to this email to contact the administrator.</p>'
    })
  }
}

function billingUrl (config: Config): string {
  // Front URL points at the workspace UI; the billing settings live under /billing.
  const base = config.FrontUrl.replace(/\/+$/, '')
  return `${base}/billing`
}

/** Normalize an account locale (e.g. 'en-US', 'ru') to a supported language, falling back to default. */
function resolveLang (locale: string | null): Lang {
  const short = (locale ?? '').slice(0, 2).toLowerCase()
  return short in TEMPLATES ? (short as Lang) : DEFAULT_LANG
}

const PLAN_CONFIG_TTL_MS = 10 * 60 * 1000 // plan config is static; refresh every 10 min
let planConfigCache: { data: any, fetchedAt: number } | null = null

/**
 * Resolve a localized plan/package label from pod-payment's /api/v1/plan-config.
 * Best-effort with a short cache: on any failure (no PaymentUrl, network, missing key)
 * falls back to the raw plan id so the email is never blocked.
 */
async function getPlanLabel (config: Config, plan: string, type: string, lang: Lang): Promise<string> {
  if (config.PaymentUrl === undefined) return plan

  try {
    const now = Date.now()
    if (planConfigCache === null || now - planConfigCache.fetchedAt > PLAN_CONFIG_TTL_MS) {
      const res = await fetch(`${config.PaymentUrl.replace(/\/+$/, '')}/api/v1/plan-config`, {
        signal: AbortSignal.timeout(MAIL_TIMEOUT_MS)
      })
      if (!res.ok) return plan
      planConfigCache = { data: await res.json(), fetchedAt: now }
    }

    // Same source selection as pod-payment (server.ts): packages for package subs, plans otherwise.
    const source = type === 'package' ? planConfigCache.data?.packages : planConfigCache.data?.plans
    const label = source?.[plan]?.label
    return label?.[lang] ?? label?.[DEFAULT_LANG] ?? plan
  } catch {
    return plan
  }
}

function buildMessage (reason: PaymentFailedReason, planLabel: string, config: Config, lang: Lang): MailMessage {
  return TEMPLATES[lang][reason](planLabel, billingUrl(config))
}

/**
 * Send a payment-failed email to the subscription owner.
 *
 * Best-effort: any failure (missing config, missing email, mail service error) is logged and
 * swallowed so that it never breaks the surrounding payment/renewal flow. Anti-spam decisions
 * (whether to send at all) are made by the caller.
 */
export async function notifyPaymentFailed (
  ctx: MeasureContext,
  storage: SubscriptionStorage,
  config: Config,
  sub: SubscriptionData,
  reason: PaymentFailedReason
): Promise<void> {
  if (config.MailUrl === undefined || config.MailFrom === undefined) {
    ctx.info('Payment-failed email skipped: mail not configured', { subId: sub.id, reason })
    return
  }

  try {
    const { email, locale } = await storage.getAccountContact(sub.accountUuid)
    if (email === null) {
      ctx.warn('Payment-failed email skipped: no email for account', { subId: sub.id, account: sub.accountUuid })
      return
    }

    const lang = resolveLang(locale)
    const planLabel = await getPlanLabel(config, sub.plan, sub.type, lang)
    const { subject, text, html } = buildMessage(reason, planLabel, config, lang)

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (config.MailApiKey !== undefined) {
      headers.Authorization = `Bearer ${config.MailApiKey}`
    }

    const res = await fetch(`${config.MailUrl.replace(/\/+$/, '')}/send`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ from: config.MailFrom, to: email, subject, text, html }),
      signal: AbortSignal.timeout(MAIL_TIMEOUT_MS)
    })

    if (!res.ok) {
      ctx.error('Payment-failed email send failed', { subId: sub.id, status: res.status, reason })
      return
    }

    ctx.info('Payment-failed email sent', { subId: sub.id, reason })
  } catch (err: any) {
    ctx.error('Payment-failed email error', { subId: sub.id, reason, err: err?.message ?? String(err) })
  }
}
