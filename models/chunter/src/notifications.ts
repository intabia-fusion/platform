//
// Copyright © 2024 Hardcore Engineering Inc.
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

import { type Builder } from '@hcengineering/model'
import notification from '@hcengineering/model-notification'
import core, { defineCollaborators } from '@hcengineering/model-core'
import activity, { type ActivityInfoMessage, type DocUpdateMessage } from '@hcengineering/activity'
import { type MessageNotificationType } from '@hcengineering/notification'
import { type ChatMessage, type ThreadMessage } from '@hcengineering/chunter'

import chunter from './plugin'

export function defineNotifications (builder: Builder): void {
  defineCollaborators(builder, chunter.class.DirectMessage, { fields: ['members'] })
  defineCollaborators(builder, chunter.class.Channel, { fields: ['members'] })

  builder.mixin(chunter.class.DirectMessage, core.class.Class, notification.mixin.NotificationPreview, {
    presenter: chunter.component.ChannelPreview
  })

  builder.mixin(chunter.class.ChatMessage, core.class.Class, notification.mixin.NotificationContextPresenter, {
    labelPresenter: chunter.component.ChatMessageNotificationLabel
  })

  builder.createDoc(notification.class.ActivityNotificationViewlet, core.space.Model, {
    messageMatch: {
      _class: chunter.class.ThreadMessage
    },
    presenter: chunter.component.ThreadNotificationPresenter
  })

  builder.createDoc(
    notification.class.NotificationGroup,
    core.space.Model,
    {
      label: chunter.string.ApplicationLabelChunter,
      icon: chunter.icon.Chunter
    },
    chunter.ids.ChunterNotificationGroup
  )

  builder.createDoc<MessageNotificationType<ChatMessage>>(
    notification.class.MessageNotificationType,
    core.space.Model,
    {
      label: chunter.string.DM,
      generated: false,
      hidden: false,
      messageClass: chunter.class.ChatMessage,
      objectClass: chunter.class.ChatMessage,
      attachedToClass: chunter.class.DirectMessage,
      defaultEnabled: false,
      group: chunter.ids.ChunterNotificationGroup,
      templates: {
        text: chunter.emailTemplate.DMNotificationText,
        html: chunter.emailTemplate.DMNotificationHtml,
        subject: chunter.emailTemplate.DMNotificationSubject
      }
    },
    chunter.ids.DMNotification
  )

  // A content report is an ActivityInfoMessage the reporter drops into the owner's direct
  // message; DMNotification covers ChatMessage only, so it needs its own type to reach the inbox.
  builder.createDoc<MessageNotificationType<ActivityInfoMessage>>(
    notification.class.MessageNotificationType,
    core.space.Model,
    {
      label: chunter.string.ContentReportNotification,
      generated: false,
      hidden: true,
      messageClass: activity.class.ActivityInfoMessage,
      objectClass: activity.class.ActivityInfoMessage,
      attachedToClass: chunter.class.DirectMessage,
      match: { message: chunter.string.ContentReport },
      // The card's message is an IntlString, not markup: without this the push body would be the raw key.
      notificationMessage: chunter.string.ContentReportNotificationBody,
      defaultEnabled: true,
      group: chunter.ids.ChunterNotificationGroup
    },
    chunter.ids.ContentReportNotification
  )

  builder.createDoc<MessageNotificationType<ChatMessage>>(
    notification.class.MessageNotificationType,
    core.space.Model,
    {
      label: chunter.string.ChannelMessages,
      generated: false,
      hidden: false,
      messageClass: chunter.class.ChatMessage,
      objectClass: chunter.class.ChatMessage,
      attachedToClass: chunter.class.Channel,
      defaultEnabled: false,
      group: chunter.ids.ChunterNotificationGroup,
      templates: {
        text: chunter.emailTemplate.ChannelNotificationText,
        html: chunter.emailTemplate.ChannelNotificationHtml,
        subject: chunter.emailTemplate.ChannelNotificationSubject
      }
    },
    chunter.ids.ChannelNotification
  )

  builder.createDoc<MessageNotificationType<DocUpdateMessage>>(
    notification.class.MessageNotificationType,
    core.space.Model,
    {
      label: chunter.string.JoinChannel,
      generated: false,
      hidden: false,
      messageClass: activity.class.DocUpdateMessage,
      objectClass: chunter.class.Channel,
      defaultEnabled: false,
      field: 'members',
      group: chunter.ids.ChunterNotificationGroup,
      attachedToClass: chunter.class.Channel,
      notificationMessage: chunter.string.YouJoinedChannel,
      templates: {
        text: chunter.emailTemplate.JoinChannelNotificationText,
        html: chunter.emailTemplate.JoinChannelNotificationHtml,
        subject: chunter.emailTemplate.JoinChannelNotificationSubject
      }
    },
    chunter.ids.JoinChannelNotification
  )

  builder.createDoc<MessageNotificationType<ThreadMessage>>(
    notification.class.MessageNotificationType,
    core.space.Model,
    {
      label: chunter.string.ThreadMessage,
      generated: false,
      hidden: false,
      messageClass: chunter.class.ThreadMessage,
      objectClass: chunter.class.ThreadMessage,
      attachedToClass: activity.class.ActivityMessage,
      defaultEnabled: false,
      group: chunter.ids.ChunterNotificationGroup,
      templates: {
        text: chunter.emailTemplate.ThreadNotificationText,
        html: chunter.emailTemplate.ThreadNotificationHtml,
        subject: chunter.emailTemplate.ThreadNotificationSubject
      }
    },
    chunter.ids.ThreadNotification
  )

  builder.createDoc(notification.class.NotificationProviderDefaults, core.space.Model, {
    provider: notification.providers.InboxNotificationProvider,
    ignoredTypes: [],
    enabledTypes: [
      chunter.ids.DMNotification,
      chunter.ids.ChannelNotification,
      chunter.ids.ThreadNotification,
      chunter.ids.JoinChannelNotification,
      chunter.ids.ContentReportNotification
    ]
  })

  builder.createDoc(notification.class.NotificationProviderDefaults, core.space.Model, {
    provider: notification.providers.PushNotificationProvider,
    ignoredTypes: [],
    enabledTypes: [
      chunter.ids.DMNotification,
      chunter.ids.ChannelNotification,
      chunter.ids.ThreadNotification,
      chunter.ids.JoinChannelNotification,
      chunter.ids.ContentReportNotification
    ]
  })

  builder.createDoc(notification.class.NotificationProviderDefaults, core.space.Model, {
    provider: notification.providers.SoundNotificationProvider,
    ignoredTypes: [],
    enabledTypes: [
      chunter.ids.DMNotification,
      chunter.ids.ChannelNotification,
      chunter.ids.ThreadNotification,
      chunter.ids.JoinChannelNotification,
      chunter.ids.ContentReportNotification
    ]
  })

  builder.createDoc(notification.class.ActivityNotificationViewlet, core.space.Model, {
    messageMatch: {
      _class: activity.class.DocUpdateMessage,
      objectClass: chunter.class.Channel,
      action: 'update',
      'attributeUpdates.attrKey': 'members'
    },
    presenter: chunter.component.JoinChannelNotificationPresenter
  })
}
