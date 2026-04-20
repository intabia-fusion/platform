import { Hierarchy, Ref } from '@hcengineering/core'
import activity, { ActivityMessage } from '@hcengineering/activity'

import notification, { ActivityInboxNotification, InboxNotification, MentionInboxNotification } from '.'

export function getNotificationMessageId (
  inboxNotification: InboxNotification,
  hierarchy: Hierarchy
): Ref<ActivityMessage> | undefined {
  if (hierarchy.isDerived(inboxNotification._class, notification.class.ActivityInboxNotification)) {
    return (inboxNotification as ActivityInboxNotification).attachedTo
  }

  if (hierarchy.isDerived(inboxNotification._class, notification.class.MentionInboxNotification)) {
    const mentionNotification = inboxNotification as MentionInboxNotification

    if (hierarchy.isDerived(mentionNotification.mentionedInClass, activity.class.ActivityMessage)) {
      return mentionNotification.mentionedIn as Ref<ActivityMessage>
    }
  }
}

export function getNotificationThreadId (
  inboxNotification: InboxNotification,
  hierarchy: Hierarchy
): Ref<ActivityMessage> | undefined {
  if (!hierarchy.isDerived(inboxNotification._class, notification.class.ActivityInboxNotification)) return undefined

  const activityNotification = inboxNotification as ActivityInboxNotification

  if (
    hierarchy.isDerived(activityNotification.attachedToClass, activity.class.ActivityMessage) &&
    hierarchy.isDerived(activityNotification.objectClass, activity.class.ActivityMessage)
  ) {
    return activityNotification.objectId as Ref<ActivityMessage>
  }
}
