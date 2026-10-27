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

import { WEBHOOK_DISABLED, resolveLang, type MailLang } from './templates/webhook-disabled'

export { resolveLang } from './templates/webhook-disabled'
export type { MailLang, WebhookDisabledCopy } from './templates/webhook-disabled'

/** Used when the pod has no PRODUCT_NAME. */
const DEFAULT_PRODUCT_NAME = 'Intabia Platform'

export function productName (): string {
  const name = process.env.PRODUCT_NAME?.trim()
  return name !== undefined && name !== '' ? name : DEFAULT_PRODUCT_NAME
}

/** Language of the outgoing mail: the pod's LANGUAGE, English when unset or unsupported. */
export function mailLang (): MailLang {
  return resolveLang(process.env.LANGUAGE)
}

export function escapeHtml (str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Substitute {key} placeholders from params. Missing keys stay literal (surfaces template typos).
export function fill (str: string, params: Record<string, string>): string {
  return str.replace(/\{(\w+)\}/g, (m, key) => params[key] ?? m)
}

// Same card as the billing letters (packages/billing-mail): inline styles, because mail clients drop <style>.
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"

export interface MailLayout {
  app: string
  lang: MailLang
  lead: string // html
  note?: string // html
  rows: Array<[string, string]> // [label, value html]
}

export function renderLayout (m: MailLayout): string {
  const app = escapeHtml(m.app)
  const lead = `<p style="margin:0 0 12px 0;font-size:17px;line-height:1.55;color:#18181B;font-family:${FONT}">${m.lead}</p>`
  const note =
    m.note !== undefined && m.note !== ''
      ? `<p style="margin:20px 0 0 0;font-size:15px;line-height:1.65;color:#52525B;font-family:${FONT}">${m.note}</p>`
      : ''
  const rows =
    m.rows.length === 0
      ? ''
      : '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;background-color:#FAFAFA;border:1px solid #E4E4E7;border-radius:8px"><tr><td style="padding:8px 20px">' +
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' +
        m.rows
          .map(([label, value], i) => {
            const border = i === 0 ? '' : 'border-top:1px solid #F0F0F2;'
            return (
              `<tr><td style="${border}padding:10px 16px 10px 0;font-size:14px;line-height:1.4;color:#71717A;vertical-align:top;white-space:nowrap;font-family:${FONT}">${label}</td>` +
              `<td align="right" style="${border}padding:10px 0;font-size:14px;line-height:1.4;font-weight:600;color:#18181B;text-align:right;vertical-align:top;word-break:break-word;font-family:${FONT}">${value}</td></tr>`
            )
          })
          .join('') +
        '</table></td></tr></table>'
  return (
    `<!DOCTYPE html><html lang="${m.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>` +
    `<body style="margin:0;padding:0;background-color:#F2F2F7;font-family:${FONT};-webkit-font-smoothing:antialiased">` +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F2F2F7;padding:40px 16px"><tr><td align="center">' +
    '<table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%">' +
    `<tr><td style="background-color:#18181B;border-radius:12px 12px 0 0;padding:24px 40px"><span style="display:inline-block;font-size:18px;font-weight:700;color:#FFFFFF;letter-spacing:-0.3px;font-family:${FONT}">${app}</span></td></tr>` +
    '<tr><td style="background-color:#FFFFFF;padding:36px 40px;border:1px solid #E4E4E7;border-top:none;border-radius:0 0 12px 12px">' +
    lead +
    rows +
    note +
    '</td></tr>' +
    `<tr><td align="center" style="padding:20px 0"><p style="margin:0;font-size:12px;color:#9CA3AF;font-family:${FONT}">&copy; ${app} &mdash; All rights reserved</p></td></tr>` +
    '</table></td></tr></table></body></html>'
  )
}

export interface WebhookDisabledFields {
  endpoint: string // display label, already resolved by the caller
  reason: string // last delivery error
}

export interface MailMessage {
  subject: string
  text: string
  html: string
}

export function buildWebhookDisabled (lang: MailLang, f: WebhookDisabledFields): MailMessage {
  const t = WEBHOOK_DISABLED[lang]
  const params = { endpoint: f.endpoint }
  return {
    subject: t.subject,
    text:
      `${fill(t.lead, params)}\n\n` +
      `${t.endpointLabel}: ${f.endpoint}\n` +
      `${t.errorLabel}: ${f.reason}\n\n` +
      t.note,
    html: renderLayout({
      app: productName(),
      lang,
      lead: fill(t.lead, { endpoint: `<b>${escapeHtml(f.endpoint)}</b>` }),
      note: t.note,
      rows: [
        [escapeHtml(t.endpointLabel), escapeHtml(f.endpoint)],
        [escapeHtml(t.errorLabel), escapeHtml(f.reason)]
      ]
    })
  }
}
