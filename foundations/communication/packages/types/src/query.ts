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

import { type Class, type Doc, type Ref, SortingOrder, AccountUuid, WorkspaceUuid } from '@hcengineering/core'

import type { MessageID } from './message'
import type { ContextID, NotificationID, NotificationType } from './notification'
import type { BlobID, CardID, SocialID } from './core'
import type { LabelID } from './label'
import { PeerKind } from './peer'

export { SortingOrder }

export type ComparisonOperator = 'less' | 'lessOrEqual' | 'greater' | 'greaterOrEqual' | 'notEqual'

export interface Window<T> {
  getResult: () => T[]
  getTotal: () => number

  loadNextPage: () => Promise<void>

  loadPrevPage: () => Promise<void>

  hasNextPage: () => boolean

  hasPrevPage: () => boolean
}

interface FindParams {
  order?: SortingOrder
  limit?: number
}

export interface FindMessagesParams extends FindParams {
  docId: Ref<Doc>
  docClass: Ref<Class<Doc>>
  id?: MessageID
}

export interface FindMessagesMetaParams extends FindParams {
  docId: Ref<Doc>
  docClass: Ref<Class<Doc>>
  id?: MessageID
  creator?: SocialID
}

export interface FindMessagesGroupParams extends FindParams {
  docId: Ref<Doc>
  docClass: Ref<Class<Doc>>
  id?: MessageID
  blobId?: BlobID
  fromDate?: Partial<Record<ComparisonOperator, Date>> | Date
  toDate?: Partial<Record<ComparisonOperator, Date>> | Date
}

export interface FindMessagesOptions {
  attachments?: boolean
  reactions?: boolean
  threads?: boolean
}

export interface FindNotificationContextParams extends FindParams {
  id?: ContextID
  docId?: Ref<Doc> | Ref<Doc>[]
  docClass?: Ref<Class<Doc>>
  lastNotify?: Partial<Record<ComparisonOperator, Date>> | Date
  account?: AccountUuid | AccountUuid[]
  notifications?: {
    type?: NotificationType
    limit: number
    order: SortingOrder
    read?: boolean
    total?: boolean
  }
}

export interface FindNotificationsParams extends FindParams {
  id?: NotificationID
  messageId?: MessageID
  type?: NotificationType
  contextId?: ContextID
  read?: boolean
  created?: Partial<Record<ComparisonOperator, Date>> | Date
  account?: AccountUuid | AccountUuid[]
  docId?: Ref<Doc>
  docClass?: Ref<Class<Doc>>
  total?: boolean
}

export interface FindLabelsParams extends FindParams {
  labelId?: LabelID | LabelID[]
  docId?: Ref<Doc>
  docClass?: Ref<Class<Doc>>
  account?: AccountUuid
}

export interface FindThreadMetaParams extends FindParams {
  docId?: Ref<Doc>
  docClass?: Ref<Class<Doc>>
  messageId?: MessageID
  threadId?: CardID
}

export interface FindPeersParams extends FindParams {
  workspaceId?: WorkspaceUuid
  cardId?: CardID
  kind?: PeerKind
  value?: string
}

export type WithTotal<T> = T[] & { total: number }
