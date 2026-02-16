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
      icon: notification.icon.Notifications
    },
    notification.ids.NotificationGroup
  )

  builder.createDoc<MessageNotificationType>(
    notification.class.MessageNotificationType,
    core.space.Model,
    {
      hidden: true,
      generated: false,
      label: core.string.Collaborators,
      group: notification.ids.NotificationGroup,
      messageClass: activity.class.DocUpdateMessage,
      objectClass: core.class.Collaborator,
      attachedToClass: core.class.Doc,
      defaultEnabled: true
    },
    notification.ids.CollaboratorsNotification
  )

  builder.createDoc<TxNotificationType>(
    notification.class.TxNotificationType,
    core.space.Model,
    {
      label: activity.string.Mentions,
      generated: false,
      hidden: true,
      group: notification.ids.NotificationGroup,
      txClasses: [core.class.TxCreateDoc, core.class.TxUpdateDoc, core.class.TxRemoveDoc],
      attrTypes: [core.class.TypeMarkup, core.class.TypeCollaborativeDoc],
      objectClass: core.class.Doc,
      defaultEnabled: true,
      templates: {
        textTemplate: '{sender} mentioned you in {doc}: {message}',
        htmlTemplate: '<p><b>{sender}</b> mentioned you in {doc}:</p> <p>{message}</p> <p>{link}</p>',
        subjectTemplate: 'You were mentioned in {doc}'
      }
    },
    notification.ids.MentionNotificationType
  )
}

export function generateClassNotificationTypes (
  builder: Builder,
  _class: Ref<Class<Doc>>,
  group: Ref<NotificationGroup>,
  ignoreKeys: string[] = [],
  defaultEnabled: string[] = []
): void {
  const hierarchy = builder.hierarchy
  const attributes = hierarchy.getAllAttributes(
    _class,
    hierarchy.isDerived(_class, core.class.AttachedDoc) ? core.class.AttachedDoc : core.class.Doc
  )
  const filtered = Array.from(attributes.values()).filter((p) => p.hidden !== true && p.readonly !== true)
  const enabledInboxTypes: Ref<MessageNotificationType>[] = []

  ignoreKeys.push('collaborators')

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
      generated: true,
      objectClass,
      messageClass,
      hidden: false,
      defaultEnabled: false,
      attachedToClass: _class,
      templates: {
        textTemplate: '{body}',
        htmlTemplate: '<p>{body}</p><p>{link}</p>',
        subjectTemplate: '{doc} updated'
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
