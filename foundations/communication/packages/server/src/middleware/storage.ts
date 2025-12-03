//
// Copyright © 2025 Hardcore Engineering Inc.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
//  you may not use this file except in compliance with the License. You may
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
  Attachment,
  type FindLabelsParams,
  type FindNotificationContextParams,
  type FindNotificationsParams,
  FindPeersParams,
  FindThreadMetaParams,
  type Label,
  type Notification,
  type NotificationContext,
  Peer,
  Thread,
  ThreadMeta,
  FindMessagesMetaParams,
  MessageMeta,
  FindMessagesGroupParams,
  MessagesGroup
} from '@hcengineering/communication-types'
import {
  AttachmentPatchEvent,
  DocEventType,
  type CreateLabelEvent,
  type CreateMessageEvent,
  CreateMessageResult,
  type CreateNotificationContextEvent,
  type CreateNotificationEvent,
  CreatePeerEvent,
  type DbAdapter,
  type Event,
  EventResult,
  LabelEventType,
  MessageEventType,
  NotificationEventType,
  PeerEventType,
  ReactionPatchEvent,
  type RemoveLabelEvent,
  type RemoveNotificationContextEvent,
  type RemoveNotificationsEvent,
  RemovePatchEvent,
  RemovePeerEvent,
  type SessionData,
  ThreadPatchEvent,
  type UpdateNotificationContextEvent,
  type UpdateNotificationEvent,
  UpdatePatchEvent
} from '@hcengineering/communication-sdk-types'
import { MessageProcessor } from '@hcengineering/communication-shared'

import type { Enriched, Middleware, MiddlewareContext } from '../types'
import { BaseMiddleware } from './base'
import { Blob } from '../blob'

interface Result {
  skipPropagate?: boolean
  result?: EventResult
}

export class StorageMiddleware extends BaseMiddleware implements Middleware {
  private readonly blob: Blob
  private readonly db: DbAdapter
  constructor (
    readonly context: MiddlewareContext,
    next?: Middleware
  ) {
    super(context, next)

    this.blob = context.client.blob
    this.db = context.client.db
  }

  async findMessagesMeta (session: SessionData, params: FindMessagesMetaParams): Promise<MessageMeta[]> {
    return await this.db.findMessagesMeta(params)
  }

  async findMessagesGroups (session: SessionData, params: FindMessagesGroupParams): Promise<MessagesGroup[]> {
    const domain = session.hierarchy.getDomain(params.docClass)
    if (params.id != null) {
      const meta = await this.context.client.getMessageMeta(params.docClass, params.docId, params.id)
      if (meta == null) return []
      return await this.blob.findMessagesGroups(domain, {
        ...params,
        blobId: params.blobId ?? meta.blobId
      })
    }
    return await this.blob.findMessagesGroups(domain, params)
  }

  async findNotificationContexts (
    _: SessionData,
    params: FindNotificationContextParams
  ): Promise<NotificationContext[]> {
    return await this.db.findNotificationContexts(params)
  }

  async findNotifications (_: SessionData, params: FindNotificationsParams): Promise<Notification[]> {
    return await this.db.findNotifications(params)
  }

  async findLabels (_: SessionData, params: FindLabelsParams): Promise<Label[]> {
    return await this.db.findLabels(params)
  }

  async findPeers (_: SessionData, params: FindPeersParams): Promise<Peer[]> {
    return await this.db.findPeers(params)
  }

  async findThreadMeta (_: SessionData, params: FindThreadMetaParams): Promise<ThreadMeta[]> {
    return await this.db.findThreadMeta(params)
  }

  async event (session: SessionData, event: Enriched<Event>, derived: boolean): Promise<EventResult> {
    const result = await this.processEvent(session, event)

    if (result.skipPropagate === true) {
      event.skipPropagate = true
    } else {
      event.done = true
      await this.provideEvent(session, event, derived)
    }

    return result.result ?? {}
  }

  private async processEvent (session: SessionData, event: Enriched<Event>): Promise<Result> {
    switch (event.type) {
      // Messages
      case MessageEventType.CreateMessage:
        return await this.createMessage(event, session)
      case MessageEventType.UpdatePatch:
        return await this.updatePatch(event, session)
      case MessageEventType.RemovePatch:
        return await this.removePatch(event, session)
      case MessageEventType.TranslateMessage:
        return {}

      case MessageEventType.ReactionPatch:
        return await this.reactionPatch(event, session)
      case MessageEventType.AttachmentPatch:
        return await this.attachmentPatch(event, session)
      case MessageEventType.ThreadPatch:
        return await this.threadPatch(event, session)

      // Labels
      case LabelEventType.CreateLabel:
        return await this.createLabel(event)
      case LabelEventType.RemoveLabel:
        return await this.removeLabel(event)

      // Cards
      case DocEventType.UpdateDocClass:
      case DocEventType.RemoveDoc:
        return {}

      // Peers
      case PeerEventType.RemovePeer:
        return await this.removePeer(event)
      case PeerEventType.CreatePeer:
        return await this.createPeer(event)

      // Notifications
      case NotificationEventType.CreateNotification:
        return await this.createNotification(event)
      case NotificationEventType.RemoveNotifications:
        return await this.removeNotifications(event)
      case NotificationEventType.UpdateNotification:
        return await this.updateNotification(event)

      // Notification Contexts
      case NotificationEventType.CreateNotificationContext:
        return await this.createNotificationContext(event)
      case NotificationEventType.RemoveNotificationContext:
        return await this.removeNotificationContext(event)
      case NotificationEventType.UpdateNotificationContext:
        return await this.updateNotificationContext(event)
    }
  }

  private async createMessage (event: Enriched<CreateMessageEvent>, session: SessionData): Promise<Result> {
    if (event.messageId == null) {
      throw new Error('Message id is required')
    }

    const domain = session.hierarchy.getDomain(event.docClass)
    const group = await this.blob.getMessageGroupByDate(domain, event.docClass, event.docId, event.date)
    if (group == null) {
      throw new Error(
        `Cannot create message, group not found: docClass=${event.docClass} docId = ${event.docId}, messageId = ${event.messageId}, created = ${event.date.toISOString()}`
      )
    }
    const result: CreateMessageResult = {
      messageId: event.messageId,
      created: event.date,
      blobId: group.blobId
    }
    const created = await this.db.createMessageMeta(event.docClass, {
      docId: event.docId,
      id: event.messageId,
      type: event.messageType,
      creator: event.socialId,
      created: event.date,
      blobId: group.blobId
    })

    if (!created) {
      return {
        skipPropagate: true,
        result
      }
    }
    await this.blob.insertMessage(domain, event.docId, group, MessageProcessor.create(event))

    event._eventExtra.blobId = group.blobId

    return {
      result
    }
  }

  private async updatePatch (event: Enriched<UpdatePatchEvent>, session: SessionData): Promise<Result> {
    const data = {
      content: event.content,
      extra: event.extra,
      language: event.language
    }
    const domain = session.hierarchy.getDomain(event.docClass)
    const meta = await this.context.client.getMessageMeta(event.docClass, event.docId, event.messageId)

    if (meta === undefined) {
      return { skipPropagate: true }
    }

    await this.blob.updateMessage(domain, event.docId, meta.blobId, event.messageId, data, event.date)
    event._eventExtra.blobId = meta.blobId

    return {}
  }

  private async removePatch (event: Enriched<RemovePatchEvent>, session: SessionData): Promise<Result> {
    const meta = await this.context.client.getMessageMeta(event.docClass, event.docId, event.messageId)

    if (meta === undefined) {
      return { skipPropagate: true }
    }
    const domain = session.hierarchy.getDomain(event.docClass)
    await this.blob.removeMessage(domain, event.docId, meta.blobId, event.messageId)
    await this.context.client.removeMessageMeta(event.docClass, event.docId, event.messageId)
    event._eventExtra.blobId = meta.blobId
    return {}
  }

  private async reactionPatch (event: Enriched<ReactionPatchEvent>, session: SessionData): Promise<Result> {
    const meta = await this.context.client.getMessageMeta(event.docClass, event.docId, event.messageId)

    if (meta === undefined) {
      return { skipPropagate: true }
    }

    const { operation, personUuid } = event

    if (personUuid === undefined) {
      return { skipPropagate: true }
    }

    const domain = session.hierarchy.getDomain(event.docClass)
    if (operation.opcode === 'add') {
      await this.blob.addReaction(
        domain,
        event.docId,
        meta.blobId,
        event.messageId,
        operation.reaction,
        personUuid,
        event.date
      )
    } else if (operation.opcode === 'remove') {
      await this.blob.removeReaction(domain, event.docId, meta.blobId, event.messageId, operation.reaction, personUuid)
    }

    return {}
  }

  private async attachmentPatch (event: Enriched<AttachmentPatchEvent>, session: SessionData): Promise<Result> {
    const meta = await this.context.client.getMessageMeta(event.docClass, event.docId, event.messageId)
    if (meta === undefined) {
      return { skipPropagate: true }
    }

    const { operations } = event
    const domain = session.hierarchy.getDomain(event.docClass)
    for (const operation of operations) {
      if (operation.opcode === 'add') {
        const attachments: Attachment[] = operation.attachments.map(
          (it) =>
            ({
              ...it,
              created: event.date,
              creator: event.socialId
            }) as any
        )
        await this.blob.addAttachments(domain, event.docId, meta.blobId, event.messageId, attachments)
      } else if (operation.opcode === 'remove') {
        await this.blob.removeAttachments(domain, event.docId, meta.blobId, event.messageId, operation.ids)
      } else if (operation.opcode === 'set') {
        const attachments: Attachment[] = operation.attachments.map(
          (it) =>
            ({
              ...it,
              created: event.date,
              creator: event.socialId
            }) as any
        )
        await this.blob.setAttachments(domain, event.docId, meta.blobId, event.messageId, attachments)
      } else if (operation.opcode === 'update') {
        await this.blob.updateAttachments(
          domain,
          event.docId,
          meta.blobId,
          event.messageId,
          operation.attachments,
          event.date
        )
      }
    }

    return {}
  }

  private async threadPatch (event: Enriched<ThreadPatchEvent>, session: SessionData): Promise<Result> {
    const meta = await this.context.client.getMessageMeta(event.docClass, event.docId, event.messageId)
    if (meta === undefined) {
      return { skipPropagate: true }
    }

    const domain = session.hierarchy.getDomain(event.docClass)
    if (event.operation.opcode === 'attach') {
      const thread: Thread = {
        docId: event.docId,
        docClass: event.docClass,
        messageId: event.messageId,
        threadId: event.operation.threadId,
        threadType: event.operation.threadType,
        repliesCount: 0,
        lastReplyDate: new Date(),
        repliedPersons: {}
      }
      await this.db.attachThreadMeta(event.docClass, {
        docId: event.docId,
        messageId: event.messageId,
        threadId: thread.threadId,
        threadType: thread.threadType
      })
      await this.blob.attachThread(domain, event.docId, meta.blobId, event.messageId, thread)
    } else if (event.operation.opcode === 'update') {
      await this.blob.updateThread(
        domain,
        event.docId,
        meta.blobId,
        event.messageId,
        event.operation.threadId,
        event.operation.update
      )
    } else if (event.operation.opcode === 'addReply') {
      const personUuid = await this.context.client.findPersonUuid(
        {
          ctx: this.context.ctx,
          account: session.account
        },
        event.socialId
      )
      if (personUuid === undefined) return { skipPropagate: true }
      await this.blob.addThreadReply(
        domain,
        event.docId,
        meta.blobId,
        event.messageId,
        event.operation.threadId,
        personUuid,
        event.date
      )
    } else if (event.operation.opcode === 'removeReply') {
      const personUuid = await this.context.client.findPersonUuid(
        {
          ctx: this.context.ctx,
          account: session.account
        },
        event.socialId
      )

      if (personUuid === undefined) return { skipPropagate: true }
      await this.blob.removeThreadReply(
        domain,
        event.docId,
        meta.blobId,
        event.messageId,
        event.operation.threadId,
        personUuid
      )
    }

    return {}
  }

  private async createNotification (event: Enriched<CreateNotificationEvent>): Promise<Result> {
    const id = await this.db.createNotification(
      event.contextId,
      event.messageId,
      event.blobId,
      event.notificationType,
      event.read ?? false,
      event.content,
      event.creator,
      event.date
    )

    event.notificationId = id

    return {}
  }

  private async updateNotification (event: Enriched<UpdateNotificationEvent>): Promise<Result> {
    const updated = await this.db.updateNotification(
      {
        contextId: event.contextId,
        account: event.account,
        ...event.query
      },
      event.updates
    )
    if (updated === 0) return { skipPropagate: true }
    event.updated = updated
    return {}
  }

  private async removeNotifications (event: Enriched<RemoveNotificationsEvent>): Promise<Result> {
    if (event.ids.length === 0) return { skipPropagate: true }
    const ids = await this.db.removeNotifications({
      contextId: event.contextId,
      account: event.account,
      id: event.ids
    })
    event.ids = ids
    return {
      result: {
        ids
      }
    }
  }

  private async createNotificationContext (event: Enriched<CreateNotificationContextEvent>): Promise<Result> {
    const id = await this.db.createNotificationContext(
      event.docClass,
      event.docId,
      event.account,
      event.lastUpdate,
      event.lastView,
      event.lastNotify
    )

    event.contextId = id
    return {
      result: { id }
    }
  }

  private async removeNotificationContext (event: Enriched<RemoveNotificationContextEvent>): Promise<Result> {
    const id = await this.db.removeContext({
      id: event.contextId,
      account: event.account
    })

    if (id == null) return { skipPropagate: true }
    return {}
  }

  async updateNotificationContext (event: Enriched<UpdateNotificationContextEvent>): Promise<Result> {
    await this.db.updateContext(
      {
        id: event.contextId,
        account: event.account
      },
      event.updates
    )

    return {}
  }

  private async createLabel (event: Enriched<CreateLabelEvent>): Promise<Result> {
    await this.db.createLabel(event.docClass, event.docId, event.labelId, event.account, event.date)

    return {}
  }

  private async removeLabel (event: Enriched<RemoveLabelEvent>): Promise<Result> {
    await this.db.removeLabels({
      labelId: event.labelId,
      docId: event.docId,
      docClass: event.docClass,
      account: event.account
    })

    return {}
  }

  private async createPeer (event: Enriched<CreatePeerEvent>): Promise<Result> {
    await this.db.createPeer(event.workspaceId, event.cardId, event.kind, event.value, event.extra ?? {}, event.date)
    return {}
  }

  private async removePeer (event: Enriched<RemovePeerEvent>): Promise<Result> {
    await this.db.removePeer(event.workspaceId, event.cardId, event.kind, event.value)
    return {}
  }

  close (): void {
    this.db.close()
  }
}
