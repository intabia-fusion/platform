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

import { type SendMailOptions } from 'nodemailer'
import { MeasureContext } from '@hcengineering/core'
import { ClisrServer } from '@intabiafusion/clisr'
import { ConsumerControl } from '@hcengineering/server-core'

import config from './config'
import { type MailClient } from './mail'
import { EmailNotification } from './types'

function isAllowedFrom (from: NonNullable<SendMailOptions['from']>): boolean {
  const domainOf = (addr: string): string | undefined => addr.split('@').pop()?.toLowerCase()
  // No SOURCE to compare against: keep the pre-existing behaviour.
  if (config.source === undefined) return true
  // Nodemailer accepts both 'a@b.c' and { name, address }.
  return domainOf(typeof from === 'string' ? from : from.address) === domainOf(config.source)
}

type Recipients = SendMailOptions['to']
type Recipient = Exclude<NonNullable<Recipients>, any[]>

function addressOf (recipient: Recipient): string {
  const value = typeof recipient === 'string' ? recipient : recipient.address
  // 'Name <user@host>' carries the address in angle brackets.
  const match = /<([^>]*)>/.exec(value)
  return (match?.[1] ?? value).trim().toLowerCase()
}

function splitRecipients (recipients: Recipients): Recipient[] {
  if (recipients == null) return []
  return (Array.isArray(recipients) ? recipients : [recipients]).flatMap((it) =>
    typeof it === 'string'
      ? it
          .split(',')
          .map((part): Recipient => part.trim())
          .filter((part) => part !== '')
      : [it]
  )
}

/**
 * Drops blocked addresses from to/cc/bcc. Returns undefined when nobody is left to send to.
 */
export function withoutBlockedRecipients (
  message: SendMailOptions,
  blocked: Set<string>
): SendMailOptions | undefined {
  if (blocked.size === 0) return message

  let removed = false
  const filter = (recipients: Recipients): Recipients => {
    if (recipients == null) return recipients
    const all = splitRecipients(recipients)
    const kept = all.filter((it) => !blocked.has(addressOf(it)))
    if (kept.length === all.length) return recipients
    removed = true
    return kept.length > 0 ? kept : undefined
  }

  const to = filter(message.to)
  const cc = filter(message.cc)
  const bcc = filter(message.bcc)
  if (!removed) return message
  if (to == null && cc == null && bcc == null) return undefined

  return { ...message, to, cc, bcc }
}

/**
 * Creates an email message object from notification data.
 */
export function createEmailMessage (data: EmailNotification, ctx?: MeasureContext): SendMailOptions {
  const emailMessage: SendMailOptions = {
    ...(data as SendMailOptions)
  }

  const requested = (data as SendMailOptions).from
  // A producer may name its own sender, but only within the domain we send for.
  const allowed = requested == null || isAllowedFrom(requested)
  if (!allowed) {
    ctx?.warn('Ignoring out-of-domain from address', { from: requested, source: config.source })
  }
  const fromAddress = allowed ? (requested ?? config.source) : config.source
  emailMessage.from = fromAddress

  // Set reply-to if configured and the sender is one of ours.
  if (config.replyTo !== undefined && fromAddress != null && isAllowedFrom(fromAddress)) {
    emailMessage.replyTo = config.replyTo
  }

  return emailMessage
}

/**
 * Handles email sending in queue mode (direct SMTP sending).
 */
export async function handleQueueMode (
  ctx: MeasureContext,
  client: MailClient | undefined,
  emailMessage: SendMailOptions
): Promise<void> {
  try {
    await client?.sendMessage(emailMessage, ctx)
  } catch (err: any) {
    ctx.error(err.message)
  }
}

/**
 * Handles email sending in server mode (forward to connected clients).
 */
export async function handleServerMode (
  measureCtx: MeasureContext,
  server: ClisrServer | undefined,
  emailMessage: SendMailOptions,
  control: ConsumerControl
): Promise<void> {
  if (server === undefined) {
    measureCtx.error('Server is not initialized in server mode')
    return
  }

  const heartbeatInterval = setInterval(() => {
    void control.heartbeat()
  }, 1000)

  try {
    await server.request(measureCtx, 'send', [emailMessage])
  } finally {
    clearInterval(heartbeatInterval)
  }
}
