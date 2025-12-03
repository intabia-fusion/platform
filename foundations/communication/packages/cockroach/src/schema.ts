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
  type BlobID,
  type CardID,
  type ContextID,
  type MessageID,
  type SocialID,
  type NotificationID,
  type LabelID,
  type CardType,
  NotificationContent,
  NotificationType,
  PeerKind, PeerExtra, MessageType
} from '@hcengineering/communication-types'
import { Domain as ClassDomain, Ref, Class, Doc, AccountUuid, WorkspaceUuid } from '@hcengineering/core'
import { Domain } from '@hcengineering/communication-sdk-types'

export const schemas = {
  [Domain.MessageIndex]: {
    workspace_id: 'uuid',
    domain: 'varchar',
    doc_id: 'varchar',
    // doc_class: 'varchar',
    message_id: 'varchar',
    message_type: 'varchar',
    created: 'timestamptz',
    creator: 'varchar',
    blob_id: 'uuid'
  },
  [Domain.ThreadIndex]: {
    workspace_id: 'uuid',
    domain: 'varchar',
    doc_id: 'varchar',
    doc_class: 'varchar',
    message_id: 'varchar',
    thread_id: 'varchar',
    thread_type: 'varchar'
  },
  [Domain.NotificationContext]: {
    workspace_id: 'uuid',
    domain: 'varchar',
    context_id: 'uuid',
    doc_id: 'varchar',
    doc_class: 'varchar',
    account: 'uuid',
    last_view: 'timestamptz',
    last_update: 'timestamptz',
    last_notify: 'timestamptz'
  },
  [Domain.Notification]: {
    notification_id: 'uuid',
    context_id: 'uuid',
    read: 'bool',
    message_id: 'varchar',
    created: 'timestamptz',
    content: 'jsonb',
    creator: 'varchar',
    blob_id: 'uuid',
    type: 'varchar'
  },
  [Domain.Label]: {
    workspace_id: 'uuid',
    domain: 'varchar',
    doc_id: 'varchar',
    doc_class: 'varchar',
    label_id: 'varchar',
    account: 'uuid',
    created: 'timestamptz'
  },
  [Domain.Peer]: {
    workspace_id: 'uuid',
    card_id: 'varchar',
    kind: 'varchar',
    value: 'varchar',
    extra: 'jsonb',
    created: 'timestamptz'
  }
} as const

export interface DomainDbModel {
  [Domain.MessageIndex]: MessageIndexDbModel
  [Domain.ThreadIndex]: ThreadDbModel

  [Domain.Notification]: NotificationDbModel
  [Domain.NotificationContext]: ContextDbModel

  [Domain.Label]: LabelDbModel
  [Domain.Peer]: PeerDbModel
}

export type DbModel<D extends keyof DomainDbModel> = DomainDbModel[D]

export type DbModelColumn<D extends Domain> = keyof DomainDbModel[D] & string

export type DbModelColumnType<D extends Domain> = DomainDbModel[D][DbModelColumn<D>]

export interface DbModelFilterRow<D extends Domain> { column: DbModelColumn<D>, value: DbModelColumnType<D> | DbModelColumnType<D>[] }
export type DbModelFilter<D extends Domain> = Array<DbModelFilterRow<D>>
export type DbModelUpdate<D extends Domain> = Array<{
  column: DbModelColumn<D>
  innerKey?: string
  value: any
}>
export type DbModelBatchUpdate<D extends Domain> = Array<{
  key: DbModelColumnType<D>
  column: DbModelColumn<D>
  innerKey?: string
  value: any
}>

interface MessageIndexDbModel {
  workspace_id: WorkspaceUuid
  domain: ClassDomain
  doc_id: Ref<Doc>
  // doc_class: Ref<Class<Doc>>
  message_id: MessageID
  message_type: MessageType
  created: Date
  creator: SocialID
  blob_id: BlobID
}

interface ThreadDbModel {
  workspace_id: WorkspaceUuid
  domain: ClassDomain
  doc_id: Ref<Doc>
  doc_class: Ref<Class<Doc>>
  message_id: MessageID
  thread_id: CardID
  thread_type: CardType
}

interface ContextDbModel {
  workspace_id: WorkspaceUuid
  domain: ClassDomain
  context_id: ContextID
  doc_id: Ref<Doc>
  doc_class: Ref<Class<Doc>>
  account: AccountUuid
  last_update: Date
  last_view: Date
  last_notify: Date
}

interface NotificationDbModel {
  context_id: ContextID
  notification_id: NotificationID
  type: NotificationType
  read: boolean
  message_id: MessageID
  creator: SocialID
  blob_id: BlobID
  created: Date
  content: NotificationContent
}

interface LabelDbModel {
  workspace_id: WorkspaceUuid
  domain: ClassDomain
  label_id: LabelID
  doc_id: Ref<Doc>
  doc_class: Ref<Class<Doc>>
  account: AccountUuid
  created: Date
}

interface PeerDbModel {
  workspace_id: WorkspaceUuid
  card_id: CardID
  kind: PeerKind
  value: string
  extra: PeerExtra
  created: Date
}
