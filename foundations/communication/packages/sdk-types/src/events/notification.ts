//
// Copyright © 2025 Hardcore Engineering Inc.
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

import {
  ContextID,
  MessageID,
  NotificationType,
  NotificationContent,
  NotificationID,
  BlobID,
  SocialID
} from '@hcengineering/communication-types'
import type { Class, Doc, Ref, AccountUuid } from '@hcengineering/core'

import type { BaseEvent } from './common'

export enum NotificationEventType {
  CreateNotification = 'createNotification',
  RemoveNotifications = 'removeNotifications',
  UpdateNotification = 'updateNotification',

  CreateNotificationContext = 'createNotificationContext',
  RemoveNotificationContext = 'removeNotificationContext',
  UpdateNotificationContext = 'updateNotificationContext'
}

export type NotificationEvent =
  | CreateNotificationContextEvent
  | CreateNotificationEvent
  | UpdateNotificationEvent
  | RemoveNotificationContextEvent
  | RemoveNotificationsEvent
  | UpdateNotificationContextEvent

export interface CreateNotificationEvent extends BaseEvent {
  type: NotificationEventType.CreateNotification

  notificationId?: NotificationID
  notificationType: NotificationType
  read: boolean
  content: NotificationContent
  docId: Ref<Doc>
  docClass: Ref<Class<Doc>>
  contextId: ContextID
  messageId: MessageID
  creator: SocialID
  blobId: BlobID
  account: AccountUuid
}

export interface UpdateNotificationEvent extends BaseEvent {
  type: NotificationEventType.UpdateNotification
  contextId: ContextID
  account: AccountUuid
  query: {
    type?: NotificationType
    id?: NotificationID
    untilDate?: Date
  }
  updates: {
    read: boolean
  }

  updated?: number
}

export interface RemoveNotificationsEvent extends BaseEvent {
  type: NotificationEventType.RemoveNotifications
  contextId: ContextID
  account: AccountUuid
  ids: NotificationID[]
}

export interface CreateNotificationContextEvent extends BaseEvent {
  type: NotificationEventType.CreateNotificationContext
  contextId?: ContextID
  docId: Ref<Doc>
  docClass: Ref<Class<Doc>>
  account: AccountUuid

  lastView: Date
  lastUpdate: Date
  lastNotify: Date
}

export interface RemoveNotificationContextEvent extends BaseEvent {
  type: NotificationEventType.RemoveNotificationContext
  contextId: ContextID
  account: AccountUuid
}

export interface UpdateNotificationContextEvent extends BaseEvent {
  type: NotificationEventType.UpdateNotificationContext
  contextId: ContextID
  account: AccountUuid
  updates: {
    lastView?: Date
    lastUpdate?: Date
    lastNotify?: Date
  }
}

// eslint-disable-next-line  @typescript-eslint/ban-types
export type NotificationEventResult = CreateNotificationContextResult | {}

export interface CreateNotificationContextResult {
  id: ContextID
}
