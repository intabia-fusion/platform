import notification, { type TxNotificationType } from '@hcengineering/notification'
import core from '@hcengineering/core'
import { type Builder } from '@hcengineering/model'

import activity from './plugin'
import { defineCollaborators } from '@hcengineering/model-core'

export function buildNotifications (builder: Builder): void {
  builder.createDoc<TxNotificationType>(
    notification.class.TxNotificationType,
    core.space.Model,
    {
      hidden: false,
      generated: false,
      label: activity.string.Reactions,
      group: notification.ids.NotificationGroup,
      txClasses: [core.class.TxCreateDoc],
      objectClass: activity.class.Reaction,
      attachedToClass: activity.class.ActivityMessage,
      defaultEnabled: false
    },
    activity.ids.AddReactionNotification
  )

  builder.createDoc(notification.class.NotificationProviderDefaults, core.space.Model, {
    provider: notification.providers.InboxNotificationProvider,
    ignoredTypes: [],
    enabledTypes: [activity.ids.AddReactionNotification]
  })

  builder.createDoc(notification.class.NotificationProviderDefaults, core.space.Model, {
    provider: notification.providers.PushNotificationProvider,
    ignoredTypes: [],
    enabledTypes: [activity.ids.AddReactionNotification]
  })

  defineCollaborators(builder, activity.class.ActivityMessage, { fields: ['createdBy', 'repliedPersons'] })

  builder.mixin(activity.class.ActivityMessage, core.class.Class, notification.mixin.NotificationContextPresenter, {
    labelPresenter: activity.component.ActivityMessageNotificationLabel
  })
}
