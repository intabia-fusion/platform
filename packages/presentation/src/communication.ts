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
import { closeLiveQueries, initLiveQueries, refreshLiveQueries } from '@hcengineering/communication-client-query'
import {
  type AddAttachmentsOperation,
  type AttachmentPatchEvent,
  type CreateMessageEvent,
  type CreateMessageResult,
  type Event,
  type EventResult,
  MessageEventType,
  NotificationEventType,
  type ReactionPatchEvent,
  type RemoveAttachmentsOperation,
  type RemoveNotificationContextEvent,
  type RemovePatchEvent,
  type SetAttachmentsOperation,
  type ThreadPatchEvent,
  type UpdateAttachmentsOperation,
  type UpdateNotificationContextEvent,
  type UpdateNotificationEvent,
  type NotificationQuery,
  type UpdatePatchEvent
} from '@hcengineering/communication-sdk-types'
import {
  type CardID,
  type CardType,
  type ContextID,
  type FindLabelsParams,
  type FindNotificationContextParams,
  type FindNotificationsParams,
  type FindMessagesMetaParams,
  type Label,
  type Markdown,
  type Message,
  type MessageID,
  MessageType,
  type Notification,
  type NotificationContext,
  type SocialID,
  type AttachmentID,
  type AttachmentData,
  type AttachmentParams,
  type AttachmentUpdateData,
  type WithTotal,
  type NotificationID,
  type Emoji,
  type MessageMeta,
  type FindMessagesGroupParams,
  type MessagesGroup
} from '@hcengineering/communication-types'
import core, {
  generateId,
  getCurrentAccount,
  type OperationDomain,
  type Client as PlatformClient,
  SocialIdType,
  type Tx,
  type TxDomainEvent,
  AccountRole,
  type Ref,
  type Doc,
  type Class,
  type AccountUuid
} from '@hcengineering/core'
import { onDestroy } from 'svelte'
import { addNotification, NotificationSeverity, languageStore } from '@hcengineering/ui'
import { getMetadata, translate } from '@hcengineering/platform'
import view from '@hcengineering/view'
import { get } from 'svelte/store'
import { getWorkspaceClient as getHulylakeClient } from '@hcengineering/hulylake-client'
import { v4 as uuid } from 'uuid'

import { getCurrentWorkspaceUuid } from './file'
import { addTxListener, removeTxListener, type TxListener } from './utils'
import presentation from './plugin'

export {
  createLabelsQuery,
  createMessagesQuery,
  createNotificationContextsQuery,
  createNotificationsQuery,
  initLiveQueries,
  type MessageQueryParams
} from '@hcengineering/communication-client-query'

let client: CommunicationClient

export type CommunicationClient = Client

export function getCommunicationClient (): CommunicationClient {
  return client
}

export async function setCommunicationClient (platformClient: PlatformClient): Promise<void> {
  console.log('setCommunicationClient')
  if (client !== undefined) {
    client.close()
  }
  const _client = new Client(platformClient)

  const token = getMetadata(presentation.metadata.Token) ?? ''
  const hulylakeUrl = getMetadata(presentation.metadata.HulylakeUrl) ?? ''
  const hulylake = getHulylakeClient(hulylakeUrl, getCurrentWorkspaceUuid(), token)

  initLiveQueries(_client, platformClient.getHierarchy(), hulylake, onDestroy)
  client = _client
  onClientListeners.forEach((fn) => {
    fn()
  })
}

export type AttachmentDataWithOptionalId<P extends AttachmentParams = AttachmentParams> = Omit<
AttachmentData<P>,
'id'
> & {
  id?: AttachmentID
}

const COMMUNICATION = 'communication' as OperationDomain

class Client {
  txHandler: TxListener
  constructor (private readonly connection: PlatformClient) {
    this.txHandler = this.doHandleEvents.bind(this)
    addTxListener(this.txHandler)
  }

  doHandleEvents (events: Tx[]): void {
    for (const event of events) {
      if (event._class === core.class.TxDomainEvent && (event as TxDomainEvent).domain === COMMUNICATION) {
        const evt = event as TxDomainEvent<Event>
        this.onEvent(evt.event)
      }
    }
  }

  onEvent: (event: Event) => void = () => {}
  onRequest: (event: Event, eventPromise: Promise<EventResult>) => void = () => {}

  async attachThread (
    docClass: Ref<Class<Doc>>,
    docId: Ref<Doc>,
    messageId: MessageID,
    threadId: CardID,
    threadType: CardType
  ): Promise<void> {
    const event: ThreadPatchEvent = {
      type: MessageEventType.ThreadPatch,
      docId,
      docClass,
      messageId,
      operation: {
        opcode: 'attach',
        threadId,
        threadType
      },
      socialId: this.getSocialId(),
      date: new Date()
    }

    await this.sendEvent(event)
  }

  async createMessage (docClass: Ref<Class<Doc>>, docId: Ref<Doc>, content: Markdown): Promise<CreateMessageResult> {
    const event: CreateMessageEvent = {
      type: MessageEventType.CreateMessage,
      messageType: MessageType.Text,
      docId,
      docClass,
      content,
      socialId: this.getSocialId(),
      date: new Date(),
      options: {
        skipLinkPreviews: true
      }
    }
    const result = await this.sendEvent(event)

    return result as CreateMessageResult
  }

  async updateMessage (
    docClass: Ref<Class<Doc>>,
    docId: Ref<Doc>,
    messageId: MessageID,
    content: Markdown
  ): Promise<void> {
    const event: UpdatePatchEvent = {
      type: MessageEventType.UpdatePatch,
      docId,
      docClass,
      messageId,
      content,
      socialId: this.getSocialId(),
      date: new Date(),
      options: {
        skipLinkPreviewsUpdate: true
      }
    }
    await this.sendEvent(event)
  }

  async removeMessage (docClass: Ref<Class<Doc>>, docId: Ref<Doc>, messageId: MessageID): Promise<void> {
    const event: RemovePatchEvent = {
      type: MessageEventType.RemovePatch,
      docId,
      docClass,
      messageId,
      socialId: this.getSocialId(),
      date: new Date()
    }
    await this.sendEvent(event)
  }

  async addReaction (docClass: Ref<Class<Doc>>, docId: Ref<Doc>, messageId: MessageID, emoji: Emoji): Promise<void> {
    const event: ReactionPatchEvent = {
      type: MessageEventType.ReactionPatch,
      docId,
      docClass,
      messageId,
      operation: {
        opcode: 'add',
        reaction: emoji
      },
      socialId: this.getSocialId(),
      date: new Date()
    }
    await this.sendEvent(event)
  }

  async removeReaction (docClass: Ref<Class<Doc>>, docId: Ref<Doc>, messageId: MessageID, emoji: Emoji): Promise<void> {
    const event: ReactionPatchEvent = {
      type: MessageEventType.ReactionPatch,
      docId,
      docClass,
      messageId,
      operation: {
        opcode: 'remove',
        reaction: emoji
      },
      socialId: this.getSocialId(),
      date: new Date()
    }
    await this.sendEvent(event)
  }

  async attachmentPatch<P extends AttachmentParams>(
    docClass: Ref<Class<Doc>>,
    docId: Ref<Doc>,
    messageId: MessageID,
    ops: {
      add?: Array<AttachmentDataWithOptionalId<P>>
      remove?: AttachmentID[]
      set?: Array<AttachmentDataWithOptionalId<P>>
      update?: Array<AttachmentUpdateData<P>>
    }
  ): Promise<void> {
    const operations: Array<
    AddAttachmentsOperation | RemoveAttachmentsOperation | SetAttachmentsOperation | UpdateAttachmentsOperation
    > = []

    if (ops.add != null && ops.add.length > 0) {
      operations.push({
        opcode: 'add',
        attachments: ops.add.map((it) => ({
          ...it,
          id: it.id ?? (uuid() as AttachmentID)
        }))
      })
    }

    if (ops.remove != null && ops.remove.length > 0) {
      operations.push({
        opcode: 'remove',
        ids: ops.remove
      })
    }

    if (ops.set != null && ops.set.length > 0) {
      operations.push({
        opcode: 'set',
        attachments: ops.set.map((it) => ({
          ...it,
          id: it.id ?? (uuid() as AttachmentID)
        }))
      })
    }

    if (ops.update != null && ops.update.length > 0) {
      operations.push({
        opcode: 'update',
        attachments: ops.update
      })
    }

    if (operations.length === 0) return

    const event: AttachmentPatchEvent = {
      type: MessageEventType.AttachmentPatch,
      docId,
      docClass,
      messageId,
      operations,
      socialId: this.getSocialId(),
      date: new Date()
    }
    await this.sendEvent(event)
  }

  async updateNotificationContext (contextId: ContextID, lastView: Date): Promise<void> {
    const event: UpdateNotificationContextEvent = {
      type: NotificationEventType.UpdateNotificationContext,
      contextId,
      account: this.getAccount(),
      updates: {
        lastView
      },
      socialId: this.getSocialId(),
      date: new Date()
    }
    await this.sendEvent(event)
  }

  async removeNotificationContext (contextId: ContextID): Promise<void> {
    const event: RemoveNotificationContextEvent = {
      type: NotificationEventType.RemoveNotificationContext,
      contextId,
      account: this.getAccount(),
      socialId: this.getSocialId(),
      date: new Date()
    }
    await this.sendEvent(event)
  }

  async updateNotifications (
    contextId: ContextID,
    query: Pick<NotificationQuery, 'type' | 'untilDate'> & { id?: NotificationID },
    read: boolean
  ): Promise<void> {
    const event: UpdateNotificationEvent = {
      type: NotificationEventType.UpdateNotification,
      contextId,
      account: this.getAccount(),
      query,
      updates: {
        read
      },
      socialId: this.getSocialId(),
      date: new Date()
    }
    await this.sendEvent(event)
  }

  async findMessagesMeta (params: FindMessagesMetaParams): Promise<MessageMeta[]> {
    return (
      await this.connection.domainRequest<MessageMeta[]>(COMMUNICATION, {
        findMessagesMeta: { params }
      })
    ).value
  }

  async findMessagesGroups (params: FindMessagesGroupParams): Promise<MessagesGroup[]> {
    return (
      await this.connection.domainRequest<MessagesGroup[]>(COMMUNICATION, {
        findMessagesGroups: { params }
      })
    ).value
  }

  async findNotificationContexts (
    params: FindNotificationContextParams,
    subscription?: number | string
  ): Promise<NotificationContext[]> {
    return (
      await this.connection.domainRequest<NotificationContext[]>(COMMUNICATION, {
        findNotificationContexts: { params, subscription }
      })
    ).value
  }

  async findNotifications (
    params: FindNotificationsParams,
    subscription?: number | string
  ): Promise<WithTotal<Notification>> {
    return (
      await this.connection.domainRequest<WithTotal<Notification>>(COMMUNICATION, {
        findNotifications: { params, subscription }
      })
    ).value
  }

  async findLabels (params: FindLabelsParams): Promise<Label[]> {
    return (
      await this.connection.domainRequest<Label[]>(COMMUNICATION, {
        findLabels: { params }
      })
    ).value
  }

  async subscribeDoc (docClass: Ref<Class<Doc>>, docId: Ref<Doc>, subscription: string | number): Promise<void> {
    await this.connection.domainRequest<Message[]>(COMMUNICATION, {
      subscribeDoc: { docClass, docId, subscription }
    })
  }

  async unsubscribeDoc (docClass: Ref<Class<Doc>>, docId: Ref<Doc>, subscription: string | number): Promise<void> {
    await this.connection.domainRequest<Message[]>(COMMUNICATION, {
      unsubscribeDoc: { docClass, docId, subscription }
    })
  }

  close (): void {
    removeTxListener(this.txHandler)
  }

  private async sendEvent (event: Event): Promise<EventResult> {
    const lang = get(languageStore)
    if (getCurrentAccount().role === AccountRole.ReadOnlyGuest) {
      addNotification(
        await translate(view.string.ReadOnlyWarningTitle, {}, lang),
        await translate(view.string.ReadOnlyWarningMessage, {}, lang),
        view.component.ReadOnlyNotification,
        undefined,
        NotificationSeverity.Info,
        'readOnlyNotification'
      )
      return {}
    }

    const ev: Event = { ...event, _id: generateId() }

    const tx: TxDomainEvent = {
      _id: generateId(),
      _class: core.class.TxDomainEvent,
      space: core.space.Tx,
      objectSpace: core.space.Workspace,
      domain: COMMUNICATION,
      event: ev,
      modifiedBy: this.getSocialId(),
      modifiedOn: Date.now()
    }
    const eventPromise: Promise<EventResult> = this.connection
      .domainEventTx<EventResult>(tx)
      .then((result) => result.value)
    this.onRequest(ev, eventPromise)
    return await eventPromise
  }

  private getSocialId (): SocialID {
    const me = getCurrentAccount()
    const hulySocialId = me.fullSocialIds.find((it) => it.type === SocialIdType.HULY && it.verifiedOn !== undefined)
    const id = hulySocialId?._id ?? me.primarySocialId
    if (id == null || id === '') {
      throw new Error('Social id not found')
    }
    return id
  }

  private getAccount (): AccountUuid {
    return getCurrentAccount().uuid
  }
}

const onClientListeners: Array<() => void> = []

export function onCommunicationClient (fn: () => void): void {
  onClientListeners.push(fn)
  if (client !== undefined) {
    setTimeout(() => {
      fn()
    })
  }
}

export async function refreshCommunicationClient (): Promise<void> {
  console.log('refreshCommunicationClient')
  await refreshLiveQueries()
}

export async function purgeCommunicationClient (): Promise<void> {
  client.close()
  closeLiveQueries()
}
