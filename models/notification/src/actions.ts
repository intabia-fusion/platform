import { type Builder } from '@hcengineering/model'
import view, { createAction, template } from '@hcengineering/model-view'
import core from '@hcengineering/model-core'
import workbench from '@hcengineering/model-workbench'
import { notificationId } from '@hcengineering/notification'

import notification from './plugin'

export const notificationActionTemplates = template({
  pinContext: {
    action: notification.actionImpl.PinDocNotifyContext,
    label: notification.string.StarDocument,
    icon: view.icon.Star,
    input: 'focus',
    category: notification.category.Notification,
    target: notification.class.DocNotifyContext,
    visibilityTester: notification.function.HasDocNotifyContextPinAction,
    context: { mode: ['context', 'browser'], group: 'edit' }
  },
  unpinContext: {
    action: notification.actionImpl.UnpinDocNotifyContext,
    label: notification.string.UnstarDocument,
    icon: view.icon.Star,
    input: 'focus',
    category: notification.category.Notification,
    target: notification.class.DocNotifyContext,
    visibilityTester: notification.function.HasDocNotifyContextUnpinAction,
    context: { mode: ['context', 'browser'], group: 'edit' }
  }
})

export function defineActions (builder: Builder): void {
  builder.createDoc(
    view.class.ActionCategory,
    core.space.Model,
    { label: notification.string.Inbox, visible: true },
    notification.category.Notification
  )
  createAction(
    builder,
    {
      action: notification.actionImpl.ClearAll,
      label: notification.string.ClearAll,
      icon: view.icon.CheckCircle,
      input: 'none',
      category: notification.category.Notification,
      target: core.class.Doc,
      context: {
        mode: ['browser'],
        group: 'remove'
      }
    },
    notification.action.ClearAll
  )

  createAction(
    builder,
    {
      action: notification.actionImpl.ReadAll,
      label: notification.string.MarkReadAll,
      icon: view.icon.Eye,
      input: 'none',
      category: notification.category.Notification,
      target: core.class.Doc,
      context: {
        mode: ['browser'],
        group: 'edit'
      }
    },
    notification.action.ReadAll
  )

  createAction(
    builder,
    {
      action: notification.actionImpl.UnreadAll,
      label: notification.string.MarkUnreadAll,
      icon: view.icon.EyeCrossed,
      input: 'none',
      category: notification.category.Notification,
      target: core.class.Doc,
      context: {
        mode: ['browser'],
        group: 'edit'
      }
    },
    notification.action.UnreadAll
  )

  createAction(
    builder,
    {
      action: notification.actionImpl.ReadNotifyContext,
      label: notification.string.MarkAsRead,
      icon: view.icon.Eye,
      input: 'focus',
      visibilityTester: notification.function.CanReadNotifyContext,
      category: notification.category.Notification,
      target: notification.class.DocNotifyContext,
      context: { mode: ['context', 'panel'], application: notification.app.Notification, group: 'edit' }
    },
    notification.action.ReadNotifyContext
  )

  createAction(
    builder,
    {
      action: notification.actionImpl.UnReadNotifyContext,
      label: notification.string.MarkAsUnread,
      icon: view.icon.EyeCrossed,
      input: 'focus',
      visibilityTester: notification.function.CanUnReadNotifyContext,
      category: notification.category.Notification,
      target: notification.class.DocNotifyContext,
      context: { mode: ['context', 'panel'], application: notification.app.Notification, group: 'edit' }
    },
    notification.action.UnReadNotifyContext
  )

  createAction(
    builder,
    {
      action: notification.actionImpl.RemoveContextNotifications,
      label: notification.string.Clear,
      icon: view.icon.CheckCircle,
      input: 'focus',
      category: notification.category.Notification,
      target: notification.class.DocNotifyContext,
      context: { mode: ['panel'], application: notification.app.Notification, group: 'remove' }
    },
    notification.action.RemoveContextNotifications
  )

  createAction(
    builder,
    {
      action: notification.actionImpl.Unsubscribe,
      label: notification.string.Unsubscribe,
      icon: notification.icon.BellCrossed,
      input: 'focus',
      category: notification.category.Notification,
      target: notification.class.DocNotifyContext,
      context: {
        mode: ['panel'],
        group: 'remove'
      }
    },
    notification.action.Unsubscribe
  )

  createAction(builder, {
    action: workbench.actionImpl.Navigate,
    actionProps: {
      mode: 'app',
      application: notificationId
    },
    label: notification.string.Inbox,
    icon: view.icon.ArrowRight,
    input: 'none',
    category: view.category.Navigation,
    target: core.class.Doc,
    context: {
      mode: ['workbench', 'browser', 'editor', 'panel', 'popup']
    }
  })
}
