import activity, { ActivityMessage, Reaction } from '@hcengineering/activity'
import { NotificationContent } from '@hcengineering/notification'
import { isEmptyMarkup, markupToText } from '@hcengineering/text-core'
import { IntlString } from '@hcengineering/platform'
import { getSenderName, normalizeTextMessage, Sender } from '@hcengineering/server-notification'

import config from './config'

export function getReactionNotificationContent (
  message: ActivityMessage,
  reaction: Reaction,
  sender: Sender
): NotificationContent {
  const intlParams: Record<string, string | number> = {}
  const intlParamsNotLocalized: Record<string, IntlString> = {}

  if (message.message != null && !isEmptyMarkup(message.message)) {
    intlParams.title = normalizeTextMessage(markupToText(message.message))
  } else {
    intlParamsNotLocalized.title = activity.string.Message
  }

  intlParams.reaction = reaction.emoji
  intlParams.senderName = getSenderName(sender, config.LastNameFirst)

  return {
    title: activity.string.ReactionNotificationTitle,
    body: activity.string.ReactionNotificationBody,
    intlParams,
    intlParamsNotLocalized
  }
}
