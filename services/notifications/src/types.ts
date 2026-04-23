//
// Copyright © 2026 Intabia Fusion Inc.
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
  type Class,
  type Doc,
  type DocumentQuery,
  type FindOptions,
  FindResult,
  Hierarchy,
  MeasureContext,
  ModelDb,
  Ref,
  TxCUD,
  TxFactory,
  type WithLookup,
  WorkspaceInfoWithStatus,
  WorkspaceUuid
} from '@hcengineering/core'
import {
  DocNotifyContext,
  MentionInboxNotification,
  NotificationProvider,
  type NotificationProviderSetting,
  NotificationType,
  type NotificationTypeSetting
} from '@hcengineering/notification'
import { Employee, PersonSpace, SocialIdentity } from '@hcengineering/contact'
import { StorageAdapter } from '@hcengineering/storage'
import { Receiver } from '@hcengineering/server-notification'

export interface NotificationSettings {
  providersSettings: NotificationProviderSetting[]
  typesSettings: NotificationTypeSetting[]
  settingsByProvider: Map<Ref<NotificationProvider>, NotificationProviderSetting[]>
  typesByProvider: Map<Ref<NotificationProvider>, NotificationTypeSetting[]>
}

export type EmployeeInfo = Pick<Employee, '_id' | 'personUuid' | 'role'>
export type SocialIdentityInfo = Pick<SocialIdentity, '_id' | 'attachedTo'>

export type NotifyResult = Record<Ref<NotificationProvider>, NotificationType[]>

export interface Client {
  ctx: MeasureContext
  workspace: WorkspaceInfoWithStatus
  storage: StorageAdapter
  model: ModelDb
  hierarchy: Hierarchy
  txFactory: TxFactory
  findAll: <T extends Doc>(
    _class: Ref<Class<T>>,
    query: DocumentQuery<T>,
    options?: FindOptions<T>
  ) => Promise<FindResult<T>>

  findOne: <T extends Doc>(
    _class: Ref<Class<T>>,
    query: DocumentQuery<T>,
    options?: FindOptions<T>
  ) => Promise<WithLookup<T> | undefined>
}

export interface MentionResult {
  txes: TxCUD<Doc>[]
  data: {
    data: Partial<MentionInboxNotification>
    context: DocNotifyContext | undefined
    receiver: Receiver
    notifyResult: NotifyResult
  }[]
}

/**
 * Stores all user-specific information (caches, statuses, and timers)
 * required to manage the process of sending WorkspacesNotification events.
 */
export interface UserState {
  /**
   * The time of the user's last activity.
   * Updated upon login, receiving transactions from the user, etc.
   * If the user is inactive for more than 20 minutes, their state is cleared from the service memory.
   */
  lastActivityOn: number

  /**
   * A set of workspaces the user is currently connected to (online).
   * Updated via queue events (`QueueUserEvent.login` / `logout`)
   * or during periodic synchronization (`syncSessions`).
   */
  connectedWorkspaces: Set<WorkspaceUuid>

  /**
   * Indicates whether the initial loading (initialization) of the unread notification status
   * from the database has been successfully completed at least once.
   */
  isNotifyStatusInitialized: boolean

  /**
   * A flag indicating that the service should attempt to load (initialize)
   * the unread notification statuses for this user in the background (lazy init).
   */
  needsInitialization: boolean

  /**
   * The Promise of the current initialization to prevent race conditions.
   */
  initPromise?: Promise<boolean>

  /**
   * A counter for failed status initialization attempts.
   * If there are more than 5 attempts, the service stops trying for this user.
   */
  initRetries: number

  /**
   * A timestamp (Date.now() + delay) until which no repeated initialization attempts
   * should be made if the previous one failed.
   * Allows avoiding multiple setTimeout calls in memory.
   */
  nextInitAttempt?: number

  /**
   * A cache of notification statuses: whether the user has unread notifications (true/false)
   * for each specific workspace.
   * This structure is used to form the attributes of the WorkspacesNotification event.
   */
  unreadStatusByWorkspace: Record<WorkspaceUuid, boolean>

  /**
   * A cache of the reference to the user's space (PersonSpace) for each workspace.
   * This information is necessary for the correct addressing and saving of the WorkspacesNotification transaction.
   */
  spaceIdByWorkspace: Map<WorkspaceUuid, Ref<PersonSpace>>

  /**
   * A timer for debouncing (delayed sending) of the WorkspacesNotification event.
   * Allows batching several quick status changes into a single send (e.g., a 1-second delay),
   * reducing system load during mass notification updates.
   */
  debounceTimer?: NodeJS.Timeout

  /**
   * The time of the last logout (sessions === 0) for the workspace.
   * Used for delayed removal (grace period).
   */
  loggedOutAt: Map<WorkspaceUuid, number>
}
