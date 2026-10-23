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
import { getClient as getAccountClient } from '@hcengineering/account-client'
import type { PlatformQueueProducer } from '@hcengineering/server-core'
import type { WebhookEndpoint } from '@hcengineering/setting'

import { buildWebhookDisabled, resolveLang } from './mail'

// Shape services/mail's pod-mail consumer expects off QueueTopic.NotificationQueue - duplicated here
// (as billing/crm/gmail-resources each do) rather than depending on a mail-service-only package.
export interface EmailNotification {
  type: 'email'
  data: { to: string, subject: string, text: string, html: string }
}

/** Its name when it has one, the address otherwise - several endpoints on one host read alike. */
function endpointLabel (endpoint: Pick<WebhookEndpoint, 'url' | 'name'>): string {
  return endpoint.name !== undefined && endpoint.name !== '' ? `${endpoint.name} (${endpoint.url})` : endpoint.url
}

/** Best-effort - a failed notification must not affect the disable itself, which already happened. */
export async function notifyOwnerDisabled (
  ctx: MeasureContext,
  accountsUrl: string,
  token: string,
  workspace: WorkspaceUuid,
  producer: PlatformQueueProducer<EmailNotification>,
  endpoint: Pick<WebhookEndpoint, '_id' | 'url' | 'name'>,
  reason: string
): Promise<void> {
  try {
    const accountClient = getAccountClient(accountsUrl, token)
    const recipients = await accountClient.getWorkspaceOwnerEmails(workspace)
    if (recipients.length === 0) {
      ctx.warn('webhook: no email found to notify about endpoint disablement', { endpointId: endpoint._id })
      return
    }

    let language: string | undefined
    try {
      const [info] = await accountClient.getWorkspacesInfo([workspace])
      language = info?.language
    } catch (err) {
      ctx.warn('webhook: failed to resolve workspace language, using the default', {
        endpointId: endpoint._id,
        err
      })
    }

    const mail = buildWebhookDisabled(resolveLang(language), {
      endpoint: endpointLabel(endpoint),
      reason
    })

    for (const to of recipients) {
      await producer.send(ctx, '' as WorkspaceUuid, [{ type: 'email', data: { to, ...mail } }], to)
    }
  } catch (err) {
    ctx.error('webhook: failed to notify owner about endpoint disablement', { endpointId: endpoint._id, err })
  }
}
