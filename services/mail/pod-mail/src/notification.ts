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

import { MeasureContext, WorkspaceUuid, systemAccountUuid, SocialIdType } from '@hcengineering/core'
import { getAccountClient } from '@hcengineering/server-client'
import { generateToken } from '@hcengineering/server-token'
import gmail from '@hcengineering/gmail'
import { QueueNotificationMessage } from '@hcengineering/notification'
import { ClisrServer } from '@intabiafusion/clisr'
import { ConsumerControl } from '@hcengineering/server-core'

import config from './config'
import { MailClient } from './mail'
import { createEmailMessage, handleQueueMode, handleServerMode } from './utils'

export function createUserNotificationsHandler (
  measureCtx: MeasureContext,
  client: MailClient | undefined,
  server: ClisrServer | undefined
) {
  return async (
    ctx: MeasureContext,
    message: { workspace: WorkspaceUuid, value: QueueNotificationMessage },
    control: ConsumerControl
  ) => {
    try {
      const msg = message.value
      if (msg.template == null) return
      const shouldEmail = (msg.providers[gmail.providers.EmailNotificationProvider]?.length ?? 0) > 0
      if (!shouldEmail) return

      const token = generateToken(systemAccountUuid, message.workspace, { service: config.serviceId })
      const personInfo = await getAccountClient(token).getPersonInfo(msg.account)
      if (personInfo?.socialIds === undefined) {
        ctx.error(`No person info found for account: ${msg.account}`)
        return
      }

      const emails = personInfo.socialIds.filter(
        (id) =>
          (id.type === SocialIdType.EMAIL || id.type === SocialIdType.GOOGLE) &&
          id.verifiedOn !== undefined &&
          id.verifiedOn > 0 &&
          id.isDeleted !== true
      )

      if (emails.length === 0) {
        ctx.warn(`No verified email found for account: ${msg.account}`)
        return
      }

      const emailAddress = emails[0].value

      const emailMessage = createEmailMessage({
        html: msg.template.html,
        text: msg.template.text,
        subject: msg.template.subject,
        to: emailAddress
      })

      switch (config.mode) {
        case 'queue':
          await handleQueueMode(ctx, client, emailMessage)
          break
        case 'server':
          await handleServerMode(measureCtx, server, emailMessage, control)
          break
        default:
          ctx.warn(`Unexpected mode for user notification handling: ${config.mode}`)
      }
    } catch (e: any) {
      ctx.error('Failed to process user email notification', { e, message })
    }
  }
}
