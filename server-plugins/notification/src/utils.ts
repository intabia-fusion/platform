import core from '@hcengineering/core'
import { formatName } from '@hcengineering/contact'

import { NOTIFICATION_BODY_SIZE, Sender } from './index'

export function normalizeTextMessage (message: string): string {
  const trimmed = message.trim()
  if (trimmed.length > NOTIFICATION_BODY_SIZE) return trimmed.slice(0, NOTIFICATION_BODY_SIZE) + '...'
  return trimmed
}

export function getSenderName (sender: Sender, lastNameFirst: string): string {
  if (sender.socialId === core.account.System || sender.socialId === core.account.ConfigUser) {
    return 'System'
  }

  const { person } = sender

  if (person === undefined) {
    console.error('Cannot find person', { socialId: sender.socialId })

    return 'Unknown user'
  }

  return formatName(person.name, lastNameFirst)
}
