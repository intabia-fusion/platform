import { type Builder } from '@hcengineering/model'
import type { AttachedDoc, Class, Collection, Data, Doc, Ref } from '@hcengineering/core'
import type { MessageNotificationType, NotificationGroup, TxNotificationType } from '@hcengineering/notification'
import core from '@hcengineering/model-core'
import activity from '@hcengineering/activity'

import notification from './plugin'

export function defineNotifications (builder: Builder): void {
  builder.createDoc(
    notification.class.NotificationGroup,
    core.space.Model,
    {
      label: notification.string.Notifications,
      icon: notification.icon.Notifications,
      order: 0
    },
    notification.ids.NotificationGroup
  )

  builder.createDoc<MessageNotificationType>(
    notification.class.MessageNotificationType,
    core.space.Model,
    {
      hidden: false,
      generated: false,
      label: notification.string.AddMeInCollaborators,
      group: notification.ids.NotificationGroup,
      messageClass: activity.class.DocUpdateMessage,
      objectClass: core.class.Collaborator,
      attachedToClass: core.class.Doc,
      defaultEnabled: false,
      isMention: true,
      match: {
        action: 'create'
      },
      notificationMessage: notification.string.YouAddedAsCollaborator,
      templates: {
        text: notification.emailTemplate.MeAddedInCollaboratorsNotificationText,
        html: notification.emailTemplate.MeAddedInCollaboratorsNotificationHtml,
        subject: notification.emailTemplate.MeAddedInCollaboratorsNotificationSubject
      },
      priority: 100
    },
    notification.ids.MeAddedInCollaboratorsNotification
  )

  builder.createDoc<MessageNotificationType>(
    notification.class.MessageNotificationType,
    core.space.Model,
    {
      hidden: false,
      generated: false,
      label: notification.string.RemoveMeFromCollaborators,
      group: notification.ids.NotificationGroup,
      messageClass: activity.class.DocUpdateMessage,
      objectClass: core.class.Collaborator,
      attachedToClass: core.class.Doc,
      defaultEnabled: false,
      isMention: true,
      match: {
        action: 'remove'
      },
      notificationMessage: notification.string.YouRemovedFromCollaborators,
      templates: {
        text: notification.emailTemplate.MeRemovedFromCollaboratorsNotificationText,
        html: notification.emailTemplate.MeRemovedFromCollaboratorsNotificationHtml,
        subject: notification.emailTemplate.MeRemovedFromCollaboratorsNotificationSubject
      },
      priority: 100
    },
    notification.ids.MeRemovedFromCollaboratorsNotification
  )

  builder.createDoc<TxNotificationType>(
    notification.class.TxNotificationType,
    core.space.Model,
    {
      label: activity.string.Mentions,
      generated: false,
      hidden: false,
      group: notification.ids.NotificationGroup,
      txClasses: [core.class.TxCreateDoc, core.class.TxUpdateDoc, core.class.TxRemoveDoc],
      attrTypes: [core.class.TypeMarkup, core.class.TypeCollaborativeDoc],
      objectClass: core.class.Doc,
      defaultEnabled: true,
      isMention: true,
      templates: {
        text: notification.emailTemplate.MentionNotificationText,
        html: notification.emailTemplate.MentionNotificationHtml,
        subject: notification.emailTemplate.MentionNotificationSubject
      },
      priority: 50
    },
    notification.ids.MentionNotificationType
  )

  builder.createDoc(notification.class.NotificationProviderDefaults, core.space.Model, {
    provider: notification.providers.InboxNotificationProvider,
    ignoredTypes: [],
    enabledTypes: [
      notification.ids.MeAddedInCollaboratorsNotification,
      notification.ids.MeRemovedFromCollaboratorsNotification
    ]
  })

  builder.createDoc(notification.class.NotificationProviderDefaults, core.space.Model, {
    provider: notification.providers.PushNotificationProvider,
    ignoredTypes: [],
    enabledTypes: [
      notification.ids.MeAddedInCollaboratorsNotification,
      notification.ids.MeRemovedFromCollaboratorsNotification
    ]
  })

  builder.createDoc(notification.class.NotificationProviderDefaults, core.space.Model, {
    provider: notification.providers.SoundNotificationProvider,
    ignoredTypes: [],
    enabledTypes: [
      notification.ids.MeAddedInCollaboratorsNotification,
      notification.ids.MeRemovedFromCollaboratorsNotification
    ]
  })
}

export function generateClassNotificationTypes (
  builder: Builder,
  _class: Ref<Class<Doc>>,
  group: Ref<NotificationGroup>,
  ignoreKeys: string[] = [],
  defaultEnabled: string[] = [],
  subGroup?: Ref<NotificationGroup>
): void {
  const hierarchy = builder.hierarchy
  const attributes = hierarchy.getAllAttributes(
    _class,
    hierarchy.isDerived(_class, core.class.AttachedDoc) ? core.class.AttachedDoc : core.class.Doc
  )
  const filtered = Array.from(attributes.values()).filter((p) => p.hidden !== true && p.readonly !== true)
  const enabledInboxTypes: Ref<MessageNotificationType>[] = []

  for (const attribute of filtered) {
    if (ignoreKeys.includes(attribute.name)) continue
    const isCollection: boolean = core.class.Collection === attribute.type._class
    const objectClass = !isCollection ? _class : (attribute.type as Collection<AttachedDoc>).of
    const messageClass = hierarchy.isDerived(objectClass, activity.class.ActivityMessage)
      ? objectClass
      : activity.class.DocUpdateMessage

    const data: Data<MessageNotificationType> = {
      attribute: attribute._id,
      field: attribute.name,
      group,
      subGroup,
      generated: true,
      objectClass,
      messageClass,
      hidden: false,
      defaultEnabled: false,
      attachedToClass: _class,
      templates: {
        text: notification.emailTemplate.GeneratedNotificationText,
        html: notification.emailTemplate.GeneratedNotificationHtml,
        subject: notification.emailTemplate.GeneratedNotificationSubject
      },
      label: attribute.label
    }
    if (isCollection) {
      data.attachedToClass = _class
    }
    const id =
      `${notification.class.MessageNotificationType}_${_class}_${attribute.name}` as Ref<MessageNotificationType>
    builder.createDoc(notification.class.MessageNotificationType, core.space.Model, data, id)

    if (defaultEnabled.includes(attribute.name)) {
      enabledInboxTypes.push(id)
    }
  }

  if (enabledInboxTypes.length > 0) {
    builder.createDoc(notification.class.NotificationProviderDefaults, core.space.Model, {
      provider: notification.providers.InboxNotificationProvider,
      ignoredTypes: [],
      enabledTypes: enabledInboxTypes
    })
  }
}
