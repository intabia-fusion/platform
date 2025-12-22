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

import core, { Class, concatLink, Doc, generateId, OperationDomain, Ref, TxDomainEvent } from '@hcengineering/core'
import {
  type EventResult,
  type Event,
  type CreateMessageResult,
  type CreateMessageOptions,
  UpdatePatchOptions,
  MessageEventType
} from '@hcengineering/communication-sdk-types'
import {
  type FindNotificationContextParams,
  type NotificationContext,
  type FindNotificationsParams,
  type Notification,
  type MessageID,
  type MessageMeta,
  type Markdown,
  type SocialID,
  type MessageType,
  type MessageExtra,
  AttachmentData,
  AttachmentID,
  FindMessagesMetaParams,
  FindMessagesGroupParams,
  MessagesGroup
} from '@hcengineering/communication-types'
import { retry } from '@hcengineering/communication-shared'

import { extractJson } from './utils'
import type { RestClient } from './types'

const retries = 3

export function createRestClient (endpoint: string, workspaceId: string, token: string): RestClient {
  return new RestClientImpl(endpoint, workspaceId, token)
}

class RestClientImpl implements RestClient {
  endpoint: string

  constructor (
    endpoint: string,
    readonly workspace: string,
    readonly token: string
  ) {
    this.endpoint = endpoint.replace('ws', 'http')
  }

  private jsonHeaders (): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + this.token,
      'accept-encoding': 'snappy, gzip'
    }
  }

  private requestInit (): RequestInit {
    return {
      method: 'GET',
      keepalive: true,
      headers: this.jsonHeaders()
    }
  }

  private wrapEvent (event: Event, modifiedBy: SocialID): TxDomainEvent {
    return {
      _id: generateId(),
      _class: core.class.TxDomainEvent,
      space: core.space.Tx,
      objectSpace: core.space.Tx,
      domain: 'communication' as OperationDomain,
      event,
      modifiedBy,
      modifiedOn: Date.now()
    }
  }

  private async find<T>(operation: string, params: Record<string, any>): Promise<T[]> {
    const searchParams = new URLSearchParams()
    if (Object.keys(params).length > 0) {
      searchParams.append('params', JSON.stringify(params))
    }
    const requestUrl = concatLink(
      this.endpoint,
      `/api/v1/request/communication/${operation}/${this.workspace}?${searchParams.toString()}`
    )
    return await retry(
      async () => {
        const response = await fetch(requestUrl, this.requestInit())
        if (!response.ok) {
          throw new Error(response.statusText)
        }
        return await extractJson<T[]>(response)
      },
      { retries }
    )
  }

  async event (event: Event, socialId: SocialID): Promise<EventResult> {
    const response = await fetch(concatLink(this.endpoint, `/api/v1/tx/${this.workspace}`), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + this.token
      },
      keepalive: true,
      body: JSON.stringify(this.wrapEvent(event, socialId))
    })
    if (!response.ok) {
      throw new Error(response.statusText)
    }
    return (await response.json()) as EventResult
  }

  async createMessage (
    docId: Ref<Doc>,
    docClass: Ref<Class<Doc>>,
    content: Markdown,
    type: MessageType,
    extra: MessageExtra | undefined,
    socialId: SocialID,
    date?: Date,
    messageId?: MessageID,
    options?: CreateMessageOptions
  ): Promise<CreateMessageResult> {
    const result = await this.event(
      {
        type: MessageEventType.CreateMessage,
        messageType: type,
        docId,
        docClass,
        content,
        extra,
        socialId,
        date: date ?? new Date(),
        messageId,
        options
      },
      socialId
    )
    return result as CreateMessageResult
  }

  async updateMessage (
    docId: Ref<Doc>,
    docClass: Ref<Class<Doc>>,
    messageId: MessageID,
    content: Markdown | undefined,
    extra: MessageExtra | undefined,
    socialId: SocialID,
    date?: Date,
    options?: UpdatePatchOptions
  ): Promise<void> {
    await this.event(
      {
        type: MessageEventType.UpdatePatch,
        docId,
        docClass,
        messageId,
        content,
        extra,
        socialId,
        date: date ?? new Date(),
        options
      },
      socialId
    )
  }

  async removeMessage (
    docId: Ref<Doc>,
    docClass: Ref<Class<Doc>>,
    messageId: MessageID,
    socialId: SocialID,
    date?: Date
  ): Promise<void> {
    await this.event(
      {
        type: MessageEventType.RemovePatch,
        docId,
        docClass,
        messageId,
        socialId,
        date: date ?? new Date()
      },
      socialId
    )
  }

  async addAttachments (
    docId: Ref<Doc>,
    docClass: Ref<Class<Doc>>,
    messageId: MessageID,
    data: AttachmentData[],
    socialId: SocialID,
    date?: Date
  ): Promise<void> {
    await this.event(
      {
        type: MessageEventType.AttachmentPatch,
        docId,
        docClass,
        messageId,
        operations: [
          {
            opcode: 'add',
            attachments: data
          }
        ],
        socialId,
        date: date ?? new Date()
      },
      socialId
    )
  }

  async removeAttachments (
    docId: Ref<Doc>,
    docClass: Ref<Class<Doc>>,
    messageId: MessageID,
    ids: AttachmentID[],
    socialId: SocialID,
    date?: Date
  ): Promise<void> {
    await this.event(
      {
        type: MessageEventType.AttachmentPatch,
        docId,
        docClass,
        messageId,
        operations: [
          {
            opcode: 'remove',
            ids
          }
        ],
        socialId,
        date: date ?? new Date()
      },
      socialId
    )
  }

  async setAttachments (
    docId: Ref<Doc>,
    docClass: Ref<Class<Doc>>,
    messageId: MessageID,
    data: AttachmentData[],
    socialId: SocialID,
    date?: Date
  ): Promise<void> {
    await this.event(
      {
        type: MessageEventType.AttachmentPatch,
        docId,
        docClass,
        messageId,
        operations: [
          {
            opcode: 'set',
            attachments: data
          }
        ],
        socialId,
        date: date ?? new Date()
      },
      socialId
    )
  }

  async findNotificationContexts (params: FindNotificationContextParams): Promise<NotificationContext[]> {
    return await this.find<NotificationContext>('findNotificationContexts', params)
  }

  async findNotifications (params: FindNotificationsParams): Promise<Notification[]> {
    return await this.find<Notification>('findNotifications', params)
  }

  async findMessagesMeta (params: FindMessagesMetaParams): Promise<MessageMeta[]> {
    return await this.find<MessageMeta>('findMessagesMeta', params)
  }

  async findMessagesGroups (params: FindMessagesGroupParams): Promise<MessagesGroup[]> {
    return await this.find<MessagesGroup>('findMessagesGroups', params)
  }
}
