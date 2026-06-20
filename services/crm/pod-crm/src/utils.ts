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

import { type MeasureContext, type WorkspaceUuid } from '@hcengineering/core'
import { getMetadata } from '@hcengineering/platform'
import { crmPlugin, type EmailNotification } from './plugin'

/**
 * Parses a Cookie header string into a key-value record.
 * Handles URL decoding and skips malformed entries.
 */
export function parseCookies (cookieString: string | undefined): Record<string, string> {
  if (cookieString == null || cookieString === '') {
    return {}
  }
  const cookies: Record<string, string> = {}
  cookieString.split(';').forEach((cookie) => {
    const parts = cookie.split('=')
    if (parts.length >= 2) {
      const key = parts.shift()?.trim() ?? ''
      const value = parts.join('=').trim()
      if (key !== '') {
        cookies[key] = decodeURIComponent(value)
      }
    }
  })
  return cookies
}

export async function getLeadNotificationEmail (
  name: string,
  phone: string,
  comment: string,
  recipientEmail: string
): Promise<EmailNotification> {
  const subject = `Новая заявка: ${name} (${phone})`

  const text = `Получена новая заявка:
  
Имя: ${name}
Телефон: ${phone}
Комментарий: ${comment}
`
  const html = `
    <div style="font-family: sans-serif; white-space: pre-line;">
      ${escapeHtml(text)}
    </div>
  `

  return {
    type: 'email',
    data: {
      to: recipientEmail,
      subject,
      text,
      html
    }
  }
}

export async function sendEmail (info: EmailNotification, ctx: MeasureContext): Promise<void> {
  const mailQueue = getMetadata(crmPlugin.metadata.MailQueue)

  await mailQueue?.send(ctx, '' as WorkspaceUuid, [info], info.data.to)
}

function escapeHtml (str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
