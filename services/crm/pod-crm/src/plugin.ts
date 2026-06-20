import { type Metadata, plugin, type Plugin } from '@hcengineering/platform'
import { type PlatformQueueProducer } from '@hcengineering/server-core'

export const crmId = 'crm' as Plugin

export interface EmailNotification {
  type: 'email'
  data: {
    text: string
    html: string
    subject: string
    to: string
  }
}

export const crmPlugin = plugin(crmId, {
  metadata: {
    MailQueue: '' as Metadata<PlatformQueueProducer<EmailNotification>>
  }
})
