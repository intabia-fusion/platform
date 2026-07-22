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
import { fetchPlanConfig, type PlanConfigLike } from './utils'

const MAIL_TIMEOUT_MS = 10_000

/**
 * Why the payment-failed email is being sent.
 * - 'failed': recurrent charge failed, subscription just entered past_due (will be retried automatically).
 * - 'final': automatic retries are exhausted, the subscription is about to be canceled.
 */
export type PaymentFailedReason = 'failed' | 'final'

/**
 * Which successful-payment email to send.
 * - 'purchase': the first payment for a checkout (new subscription or plan change) settled.
 * - 'renewal': a recurrent renewal charge for the next period settled.
 */
export type PaymentSucceededKind = 'purchase' | 'renewal'

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

interface SuccessFields {
  customer: string // payer display: "Имя (email)", or just email/name when one is missing
  plan: string // localized plan label
  amount: string // formatted, e.g. "990.00 ₽"
  paidAtDate: string // payment date only, for the subject line, e.g. "21.08.2026"
  paidAt: string // payment date + time, e.g. "21.08.2026, 14:30"
  txId: string // provider transaction id
  paymentMethod: string // e.g. "Карта •••• 0777"; '' when unknown (hides the row)
  periodStart: string // subscription period start, e.g. "21.08.2026"
  periodEnd: string // subscription period end, e.g. "21.09.2026"
  url: string
  supportText: string // pre-rendered support contacts block (plain text), '' when none
  supportHtml: string // pre-rendered support contacts block (html), '' when none
}

type SuccessBuilder = (f: SuccessFields) => MailMessage

const SUCCESS_TEMPLATES: Record<Lang, Record<PaymentSucceededKind, SuccessBuilder>> = {
  ru: {
    purchase: (f) => ({
      subject: `Чек об оплате — ${f.plan} от ${f.paidAtDate}`,
      text:
        `Оплата по подписке «${f.plan}» прошла успешно.\n\n` +
        `Плательщик: ${f.customer}\n` +
        `Тариф: ${f.plan}\n` +
        `Сумма: ${f.amount}\n` +
        `Дата и время оплаты: ${f.paidAt}\n` +
        `ID транзакции: ${f.txId}\n` +
        (f.paymentMethod !== '' ? `Способ оплаты: ${f.paymentMethod}\n` : '') +
        `Период подписки: ${f.periodStart} — ${f.periodEnd}\n\n` +
        `Управление подпиской: ${f.url}` +
        f.supportText,
      html:
        `<p>Оплата по подписке «<b>${f.plan}</b>» прошла успешно.</p>` +
        '<p>' +
        `Плательщик: <b>${f.customer}</b><br/>` +
        `Тариф: <b>${f.plan}</b><br/>` +
        `Сумма: <b>${f.amount}</b><br/>` +
        `Дата и время оплаты: <b>${f.paidAt}</b><br/>` +
        `ID транзакции: <b>${f.txId}</b><br/>` +
        (f.paymentMethod !== '' ? `Способ оплаты: <b>${f.paymentMethod}</b><br/>` : '') +
        `Период подписки: <b>${f.periodStart} — ${f.periodEnd}</b>` +
        '</p>' +
        `<p><a href="${f.url}">Управление подпиской</a></p>` +
        f.supportHtml
    }),
    renewal: (f) => ({
      subject: `Чек об оплате — ${f.plan} от ${f.paidAtDate}`,
      text:
        `Подписка «${f.plan}» успешно продлена.\n\n` +
        `Плательщик: ${f.customer}\n` +
        `Тариф: ${f.plan}\n` +
        `Сумма списания: ${f.amount}\n` +
        `Дата и время оплаты: ${f.paidAt}\n` +
        `ID транзакции: ${f.txId}\n` +
        (f.paymentMethod !== '' ? `Способ оплаты: ${f.paymentMethod}\n` : '') +
        `Период подписки: ${f.periodStart} — ${f.periodEnd}\n\n` +
        `Управление подпиской: ${f.url}` +
        f.supportText,
      html:
        `<p>Подписка «<b>${f.plan}</b>» успешно продлена.</p>` +
        '<p>' +
        `Плательщик: <b>${f.customer}</b><br/>` +
        `Тариф: <b>${f.plan}</b><br/>` +
        `Сумма списания: <b>${f.amount}</b><br/>` +
        `Дата и время оплаты: <b>${f.paidAt}</b><br/>` +
        `ID транзакции: <b>${f.txId}</b><br/>` +
        (f.paymentMethod !== '' ? `Способ оплаты: <b>${f.paymentMethod}</b><br/>` : '') +
        `Период подписки: <b>${f.periodStart} — ${f.periodEnd}</b>` +
        '</p>' +
        `<p><a href="${f.url}">Управление подпиской</a></p>` +
        f.supportHtml
    })
  },
  en: {
    purchase: (f) => ({
      subject: `Payment receipt — ${f.plan} from ${f.paidAtDate}`,
      text:
        `Your payment for the "${f.plan}" subscription was successful.\n\n` +
        `Customer: ${f.customer}\n` +
        `Plan: ${f.plan}\n` +
        `Amount: ${f.amount}\n` +
        `Payment date and time: ${f.paidAt}\n` +
        `Transaction ID: ${f.txId}\n` +
        (f.paymentMethod !== '' ? `Payment method: ${f.paymentMethod}\n` : '') +
        `Subscription period: ${f.periodStart} — ${f.periodEnd}\n\n` +
        `Manage your subscription: ${f.url}` +
        f.supportText,
      html:
        `<p>Your payment for the "<b>${f.plan}</b>" subscription was successful.</p>` +
        '<p>' +
        `Customer: <b>${f.customer}</b><br/>` +
        `Plan: <b>${f.plan}</b><br/>` +
        `Amount: <b>${f.amount}</b><br/>` +
        `Payment date and time: <b>${f.paidAt}</b><br/>` +
        `Transaction ID: <b>${f.txId}</b><br/>` +
        (f.paymentMethod !== '' ? `Payment method: <b>${f.paymentMethod}</b><br/>` : '') +
        `Subscription period: <b>${f.periodStart} — ${f.periodEnd}</b>` +
        '</p>' +
        `<p><a href="${f.url}">Manage your subscription</a></p>` +
        f.supportHtml
    }),
    renewal: (f) => ({
      subject: `Payment receipt — ${f.plan} from ${f.paidAtDate}`,
      text:
        `Your "${f.plan}" subscription was renewed successfully.\n\n` +
        `Customer: ${f.customer}\n` +
        `Plan: ${f.plan}\n` +
        `Amount charged: ${f.amount}\n` +
        `Payment date and time: ${f.paidAt}\n` +
        `Transaction ID: ${f.txId}\n` +
        (f.paymentMethod !== '' ? `Payment method: ${f.paymentMethod}\n` : '') +
        `Subscription period: ${f.periodStart} — ${f.periodEnd}\n\n` +
        `Manage your subscription: ${f.url}` +
        f.supportText,
      html:
        `<p>Your "<b>${f.plan}</b>" subscription was renewed successfully.</p>` +
        '<p>' +
        `Customer: <b>${f.customer}</b><br/>` +
        `Plan: <b>${f.plan}</b><br/>` +
        `Amount charged: <b>${f.amount}</b><br/>` +
        `Payment date and time: <b>${f.paidAt}</b><br/>` +
        `Transaction ID: <b>${f.txId}</b><br/>` +
        (f.paymentMethod !== '' ? `Payment method: <b>${f.paymentMethod}</b><br/>` : '') +
        `Subscription period: <b>${f.periodStart} — ${f.periodEnd}</b>` +
        '</p>' +
        `<p><a href="${f.url}">Manage your subscription</a></p>` +
        f.supportHtml
    })
  }
}

/** Support-contacts footer for the receipt email. Returns empty strings when no contact is configured. */
function buildSupportFooter (config: Config, lang: Lang): { text: string, html: string } {
  const parts: string[] = []
  const partsHtml: string[] = []
  if (config.SupportEmail !== undefined && config.SupportEmail !== '') {
    parts.push(config.SupportEmail)
    partsHtml.push(`<a href="mailto:${config.SupportEmail}">${config.SupportEmail}</a>`)
  }
  if (config.SupportUrl !== undefined && config.SupportUrl !== '') {
    parts.push(config.SupportUrl)
    partsHtml.push(`<a href="${config.SupportUrl}">${config.SupportUrl}</a>`)
  }
  if (parts.length === 0) return { text: '', html: '' }

  const label = lang === 'ru' ? 'Контакты поддержки' : 'Support contacts'
  return {
    text: `\n\n${label}: ${parts.join(', ')}`,
    html: `<hr/><p style="color:#888;font-size:12px">${label}: ${partsHtml.join(', ')}</p>`
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
let planConfigCache: { data: PlanConfigLike, fetchedAt: number } | null = null

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
      // Single best-effort attempt (no retry loop) — a slow/unreachable pod-payment must not block the email.
      const data = await fetchPlanConfig(config.PaymentUrl, { attempts: 1, timeoutMs: MAIL_TIMEOUT_MS })
      planConfigCache = { data, fetchedAt: now }
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

  let payerEmail: string | null = null
  try {
    const { email, locale } = await storage.getAccountContact(sub.accountUuid)
    payerEmail = email
    if (email === null) {
      ctx.warn('Payment-failed email skipped: no email for account', { subId: sub.id, account: sub.accountUuid })
    } else {
      const lang = resolveLang(locale)
      const planLabel = await getPlanLabel(config, sub.plan, sub.type, lang)
      const { subject, text, html } = buildMessage(reason, planLabel, config, lang)
      await sendMail(config, email, { subject, text, html })
      ctx.info('Payment-failed email sent', { subId: sub.id, reason })
    }
  } catch (err: any) {
    ctx.error('Payment-failed email error', { subId: sub.id, reason, err: err?.message ?? String(err) })
  }

  // Service copy so the team can reach out to the payer directly.
  if (config.BillingEmails !== undefined && config.BillingEmails.length > 0) {
    const attempt = (sub.providerData?.retryAttempt as number) ?? 0
    const lines = [
      `Воркспейс: ${sub.workspaceUuid}`,
      `Тариф: ${sub.plan} (${sub.type})`,
      `Сумма: ${((sub.amount ?? 0) / 100).toFixed(2)} ₽`,
      `Попытка: ${attempt} из 3 (${reason})`,
      `Плательщик: ${payerEmail ?? sub.accountUuid}`,
      `Подписка: ${sub.id ?? '-'}`
    ]
    const svc: MailMessage = {
      subject: `[billing] Не удалось списание: ${sub.plan} (${reason})`,
      text: lines.join('\n'),
      html: `<pre>${lines.join('\n')}</pre>`
    }
    for (const to of config.BillingEmails) {
      try {
        await sendMail(config, to, svc)
      } catch (err: any) {
        ctx.error('Billing service email error', { to, err: err?.message ?? String(err) })
      }
    }
  }
}

function formatAmount (amount: number | undefined): string {
  return `${((amount ?? 0) / 100).toFixed(2)} ₽`
}

// Format an epoch-ms timestamp as a locale date (day precision — for periods and the subject line).
function formatDate (ms: number | undefined, lang: Lang): string {
  if (ms === undefined) return '-'
  const locale = lang === 'ru' ? 'ru-RU' : 'en-US'
  return new Date(ms).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Format an epoch-ms timestamp as a locale date + time (minute precision — for the payment moment).
function formatDateTime (ms: number | undefined, lang: Lang): string {
  if (ms === undefined) return '-'
  const locale = lang === 'ru' ? 'ru-RU' : 'en-US'
  return new Date(ms).toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// Payer display: "Имя (email)", or whichever of the two is present, or '-' when both missing.
function formatCustomer (name: string | null, email: string | null): string {
  if (name !== null && email !== null) return `${name} (${email})`
  return name ?? email ?? '-'
}

// Payment method from the stored masked PAN: "Карта •••• 0777".
// Empty when no card (SBP or PAN not delivered by the webhook).
// PAN is present -> payment type: card.
function formatPaymentMethod (sub: SubscriptionData, lang: Lang): string {
  const pan = sub.providerData?.pan as string | undefined
  if (pan === undefined || pan === '') return ''
  const digits = pan.replace(/\D/g, '')
  const last4 = digits.slice(-4)
  if (last4.length < 4) return ''
  const cardLabel = lang === 'ru' ? 'Карта' : 'Card'
  return `${cardLabel} •••• ${last4}`
}

/**
 * Send a successful-payment receipt email to the subscription owner.
 * A service copy goes to BillingEmails (if configured).
 */
export async function notifyPaymentSucceeded (
  ctx: MeasureContext,
  storage: SubscriptionStorage,
  config: Config,
  sub: SubscriptionData,
  kind: PaymentSucceededKind,
  chargedAmount?: number
): Promise<void> {
  if (config.MailUrl === undefined || config.MailFrom === undefined) {
    ctx.info('Payment-succeeded email skipped: mail not configured', { subId: sub.id, kind })
    return
  }

  let payerEmail: string | null = null
  try {
    const { name, email, locale } = await storage.getAccountContact(sub.accountUuid)
    payerEmail = email
    if (email === null) {
      ctx.warn('Payment-succeeded email skipped: no email for account', { subId: sub.id, account: sub.accountUuid })
    } else {
      const lang = resolveLang(locale)
      const planLabel = await getPlanLabel(config, sub.plan, sub.type, lang)
      // Transaction id: recurrent charges set lastChargePaymentId; the initial checkout sets paymentId.
      const txId =
        (sub.providerData?.lastChargePaymentId as string | undefined) ??
        (sub.providerData?.paymentId as string | undefined) ??
        sub.providerSubscriptionId
      // Payment moment == period start: both purchase activation and renewal set periodStart to now.
      const support = buildSupportFooter(config, lang)
      const fields: SuccessFields = {
        customer: formatCustomer(name, email),
        plan: planLabel,
        // Charged: delta in case of upgrade, else - the recurring price.
        amount: formatAmount(chargedAmount ?? sub.amount),
        paidAtDate: formatDate(sub.periodStart, lang),
        paidAt: formatDateTime(sub.periodStart, lang),
        txId,
        paymentMethod: formatPaymentMethod(sub, lang),
        periodStart: formatDate(sub.periodStart, lang),
        periodEnd: formatDate(sub.periodEnd, lang),
        url: billingUrl(config),
        supportText: support.text,
        supportHtml: support.html
      }
      const { subject, text, html } = SUCCESS_TEMPLATES[lang][kind](fields)
      await sendMail(config, email, { subject, text, html })
      ctx.info('Payment-succeeded email sent', { subId: sub.id, kind })
    }
  } catch (err: any) {
    ctx.error('Payment-succeeded email error', { subId: sub.id, kind, err: err?.message ?? String(err) })
  }

  // Service copy to the team about successful charges.
  if (config.BillingEmails !== undefined && config.BillingEmails.length > 0) {
    const lines = [
      `Воркспейс: ${sub.workspaceUuid}`,
      `Тариф: ${sub.plan} (${sub.type})`,
      `Списано: ${formatAmount(chargedAmount ?? sub.amount)}`,
      // Showing both upgrade delta and the recurring price for the team.
      ...(chargedAmount !== undefined && chargedAmount !== sub.amount
        ? [`Регулярная цена: ${formatAmount(sub.amount)}`]
        : []),
      `Тип: ${kind}`,
      `Плательщик: ${payerEmail ?? sub.accountUuid}`,
      `Подписка: ${sub.id ?? '-'}`
    ]
    const svc: MailMessage = {
      subject: `[billing] Успешная оплата: ${sub.plan} (${kind})`,
      text: lines.join('\n'),
      html: `<pre>${lines.join('\n')}</pre>`
    }
    for (const to of config.BillingEmails) {
      try {
        await sendMail(config, to, svc)
      } catch (err: any) {
        ctx.error('Billing service email error', { to, err: err?.message ?? String(err) })
      }
    }
  }
}

// POST one message to pod-mail; throws on transport/HTTP errors (callers log and swallow).
async function sendMail (config: Config, to: string, msg: MailMessage): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (config.MailApiKey !== undefined) {
    headers.Authorization = `Bearer ${config.MailApiKey}`
  }
  const res = await fetch(`${(config.MailUrl as string).replace(/\/+$/, '')}/send`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ from: config.MailFrom, to, subject: msg.subject, text: msg.text, html: msg.html }),
    signal: AbortSignal.timeout(MAIL_TIMEOUT_MS)
  })
  if (!res.ok) {
    throw new Error(`mail send failed: ${res.status}`)
  }
}
