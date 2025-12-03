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
  type EventResult,
  MessageEventType,
  NotificationEventType,
  type Event,
  type SessionData,
  PeerEventType
} from '@hcengineering/communication-sdk-types'
import {
  type BlobID,
  type CardID,
  type CardType,
  type ContextID,
  type FindLabelsParams,
  type FindMessagesGroupParams,
  type FindNotificationContextParams,
  type FindNotificationsParams,
  type Label,
  type LabelID,
  type MessageID,
  type MessagesGroup,
  type Notification,
  type NotificationContext,
  NotificationType,
  SortingOrder
} from '@hcengineering/communication-types'
import { z, ZodString, ZodType, ZodTypeDef } from 'zod'
import { isBlobAttachmentType, isLinkPreviewAttachmentType } from '@hcengineering/communication-shared'
import type { AccountUuid, Ref, Class, Doc } from '@hcengineering/core'

import type { Enriched, Middleware, Subscription } from '../types'
import { BaseMiddleware } from './base'
import { ApiError } from '../error'

export class ValidateMiddleware extends BaseMiddleware implements Middleware {
  private validate<T>(data: unknown, schema: z.ZodType<T, ZodTypeDef, any>): T {
    const validationResult = schema.safeParse(data)
    if (!validationResult.success) {
      const errors = validationResult.error.errors.map((err) => err.message)
      this.context.ctx.error(validationResult.error.message, data as any)
      throw ApiError.badRequest(errors.join(', '))
    }
    return validationResult.data
  }

  async findMessagesGroups (session: SessionData, params: unknown): Promise<MessagesGroup[]> {
    const validParams: FindMessagesGroupParams = this.validate(params, FindMessagesGroupsParamsSchema)
    return await this.provideFindMessagesGroups(session, validParams)
  }

  async findNotificationContexts (
    session: SessionData,
    params: unknown,
    queryId?: Subscription
  ): Promise<NotificationContext[]> {
    const validParams: FindNotificationContextParams = this.validate(params, FindNotificationContextParamsSchema)
    return await this.provideFindNotificationContexts(session, validParams, queryId)
  }

  async findNotifications (session: SessionData, params: unknown, queryId?: Subscription): Promise<Notification[]> {
    const validParams: FindNotificationsParams = this.validate(params, FindNotificationsParamsSchema)
    return await this.provideFindNotifications(session, validParams, queryId)
  }

  async findLabels (session: SessionData, params: unknown, queryId?: Subscription): Promise<Label[]> {
    const validParams: FindLabelsParams = this.validate(params, FindLabelsParamsSchema)
    return await this.provideFindLabels(session, validParams, queryId)
  }

  async event (session: SessionData, event: Enriched<Event>, derived: boolean): Promise<EventResult> {
    if (derived) return await this.provideEvent(session, event, derived)
    switch (event.type) {
      case MessageEventType.CreateMessage:
        this.validate(event, CreateMessageEventSchema)
        break
      case MessageEventType.UpdatePatch:
        this.validate(event, UpdatePatchEventSchema)
        break
      case MessageEventType.RemovePatch:
        this.validate(event, RemovePatchEventSchema)
        break
      case MessageEventType.ReactionPatch:
        this.validate(event, ReactionPatchEventSchema)
        break
      case MessageEventType.AttachmentPatch:
        this.validate(event, AttachmentPatchEventSchema)
        event.operations.forEach((op) => {
          if (op.opcode === 'add' || op.opcode === 'set') {
            op.attachments.forEach((att) => {
              if (isLinkPreviewAttachmentType(att.mimeType)) {
                this.validate(att.params, LinkPreviewParamsSchema)
              } else if (isBlobAttachmentType(att.mimeType)) {
                this.validate(att.params, BlobParamsSchema)
              }
            })
          }
        })
        break
      case MessageEventType.ThreadPatch:
        this.validate(event, ThreadPatchEventSchema)
        break
      case NotificationEventType.UpdateNotification:
        this.validate(event, UpdateNotificationsEventSchema)
        break
      case NotificationEventType.RemoveNotificationContext:
        this.validate(event, RemoveNotificationContextEventSchema)
        break
      case NotificationEventType.UpdateNotificationContext:
        this.validate(event, UpdateNotificationContextEventSchema)
        break
      case PeerEventType.CreatePeer:
        this.validate(event, CreatePeerEventSchema)
        break
      case PeerEventType.RemovePeer:
        this.validate(event, RemovePeerEventSchema)
        break
    }
    return await this.provideEvent(session, deserializeEvent(event), derived)
  }
}

function brandedString<Type extends string> (base: ZodString): ZodType<Type, ZodTypeDef, string> {
  return base.transform((s): Type => s as Type)
}

const WorkspaceUuidSchema = z.string().uuid()
const AccountUuidSchema = brandedString<AccountUuid>(z.string())
const BlobIDSchema = brandedString<BlobID>(z.string().uuid())
const AttachmentIDSchema = z.string().uuid()
const DocIDSchema = brandedString<Ref<Doc>>(z.string().nonempty())
const DocClassSchema = brandedString<Ref<Class<Doc>>>(z.string().nonempty())
const CardIDSchema = brandedString<CardID>(z.string())
const CardTypeSchema = brandedString<CardType>(z.string())
const ContextIDSchema = brandedString<ContextID>(z.string())
const DateSchema = z.coerce.date()
const LabelIDSchema = brandedString<LabelID>(z.string())
const MarkdownSchema = z.string()
const MessageExtraSchema = z.any()
const MessageIDSchema = brandedString<MessageID>(z.string())
const MessageTypeSchema = z.string()
const SocialIDSchema = z.string()
const SortingOrderSchema = z.union([z.literal(SortingOrder.Ascending), z.literal(SortingOrder.Descending)])
const NotificationTypeSchema = z.nativeEnum(NotificationType)

const BlobParamsSchema = z.object({
  blobId: BlobIDSchema,
  mimeType: z.string(),
  fileName: z.string(),
  size: z.number(),
  metadata: z.record(z.string(), z.any()).optional()
})

const LinkPreviewParamsSchema = z
  .object({
    url: z.string(),
    host: z.string(),
    title: z.string().optional(),
    description: z.string().optional(),
    siteName: z.string().optional(),
    iconUrl: z.string().optional(),
    previewImage: z
      .object({
        url: z.string(),
        width: z.number().optional(),
        height: z.number().optional()
      })
      .optional()
  })
  .strict()

const AttachmentDataSchema = z.object({
  id: AttachmentIDSchema,
  mimeType: z.string(),
  params: z.record(z.string(), z.any())
})

const AttachmentUpdateDataSchema = z.object({
  id: AttachmentIDSchema,
  params: z.record(z.string(), z.any())
})

// Find params
const DateOrRecordSchema = z.union([DateSchema, z.record(DateSchema)])

const FindParamsSchema = z
  .object({
    order: SortingOrderSchema.optional(),
    limit: z.number().optional()
  })
  .strict()

const FindNotificationContextParamsSchema = FindParamsSchema.extend({
  id: ContextIDSchema.optional(),
  docId: DocIDSchema.optional(),
  docClass: DocClassSchema.optional(),
  lastNotify: DateOrRecordSchema.optional(),
  account: z.union([AccountUuidSchema, z.array(AccountUuidSchema)]).optional(),
  notifications: z
    .object({
      type: NotificationTypeSchema.optional(),
      limit: z.number(),
      order: SortingOrderSchema,
      read: z.boolean().optional(),
      total: z.boolean().optional()
    })
    .optional()
}).strict()

const FindMessagesGroupsParamsSchema = FindParamsSchema.extend({
  docId: DocIDSchema,
  docClass: DocClassSchema,
  id: MessageIDSchema.optional(),
  blobId: BlobIDSchema.optional(),
  fromDate: DateOrRecordSchema.optional(),
  toDate: DateOrRecordSchema.optional()
}).strict()

const FindNotificationsParamsSchema = FindParamsSchema.extend({
  contextId: ContextIDSchema.optional(),
  type: NotificationTypeSchema.optional(),
  read: z.boolean().optional(),
  created: DateOrRecordSchema.optional(),
  account: z.union([AccountUuidSchema, z.array(AccountUuidSchema)]).optional(),
  docId: DocIDSchema.optional(),
  docClass: DocClassSchema.optional(),
  total: z.boolean().optional()
}).strict()

const FindLabelsParamsSchema = FindParamsSchema.extend({
  labelId: z.union([LabelIDSchema, z.array(LabelIDSchema)]).optional(),
  docId: DocIDSchema.optional(),
  docClass: DocClassSchema.optional(),
  account: AccountUuidSchema.optional()
}).strict()

// Events

const BaseEventSchema = z
  .object({
    _id: z.string().optional(),
    _eventExtra: z.record(z.any()).optional(),
    socialId: SocialIDSchema,
    date: DateSchema
  })
  .strict()

// Message events
const CreateMessageEventSchema = BaseEventSchema.extend({
  type: z.literal(MessageEventType.CreateMessage),

  docId: DocIDSchema,
  docClass: DocClassSchema,

  messageId: brandedString<MessageID>(z.string().max(22)).optional(),
  messageType: MessageTypeSchema,

  content: MarkdownSchema,
  extra: MessageExtraSchema.optional(),

  language: z.string().optional(),

  options: z
    .object({
      skipLinkPreviews: z.boolean().optional(),
      noNotify: z.boolean().optional(),
      ignoreMentions: z.boolean().optional()
    })
    .optional()
}).strict()

const UpdatePatchEventSchema = BaseEventSchema.extend({
  type: z.literal(MessageEventType.UpdatePatch),
  docId: DocIDSchema,
  docClass: DocClassSchema,
  messageId: MessageIDSchema.optional(),

  content: MarkdownSchema.optional(),
  extra: z.record(z.any()).optional(),
  language: z.string().optional(),

  options: z
    .object({
      skipLinkPreviewsUpdate: z.boolean().optional(),
      ignoreMentions: z.boolean().optional()
    })
    .optional()
}).strict()

const RemovePatchEventSchema = BaseEventSchema.extend({
  type: z.literal(MessageEventType.RemovePatch),
  docId: DocIDSchema,
  docClass: DocClassSchema,
  messageId: MessageIDSchema.optional(),
  messageType: MessageTypeSchema.optional()
}).strict()

const ReactionOperationSchema = z.union([
  z.object({ opcode: z.literal('add'), reaction: z.string() }),
  z.object({ opcode: z.literal('remove'), reaction: z.string() })
])

const ReactionPatchEventSchema = BaseEventSchema.extend({
  type: z.literal(MessageEventType.ReactionPatch),
  docId: DocIDSchema,
  docClass: DocClassSchema,
  messageId: MessageIDSchema,
  operation: ReactionOperationSchema,
  personUuid: z.string()
}).strict()

const AttachmentOperationSchema = z.union([
  z.object({ opcode: z.literal('add'), attachments: z.array(AttachmentDataSchema).nonempty() }),
  z.object({ opcode: z.literal('remove'), ids: z.array(AttachmentIDSchema).nonempty() }),
  z.object({ opcode: z.literal('set'), attachments: z.array(AttachmentDataSchema).nonempty() }),
  z.object({ opcode: z.literal('update'), attachments: z.array(AttachmentUpdateDataSchema).nonempty() })
])

const AttachmentPatchEventSchema = BaseEventSchema.extend({
  type: z.literal(MessageEventType.AttachmentPatch),
  docId: DocIDSchema,
  docClass: DocClassSchema,
  messageId: MessageIDSchema,
  operations: z.array(AttachmentOperationSchema).nonempty()
}).strict()

const ThreadPatchEventSchema = BaseEventSchema.extend({
  type: z.literal(MessageEventType.ThreadPatch),
  docId: DocIDSchema,
  docClass: DocClassSchema,
  messageId: MessageIDSchema,
  operation: z.object({ opcode: z.literal('attach'), threadId: CardIDSchema, threadType: CardTypeSchema }),
  personUuid: z.string()
}).strict()

// Notification events
const UpdateNotificationsEventSchema = BaseEventSchema.extend({
  type: z.literal(NotificationEventType.UpdateNotification),
  contextId: ContextIDSchema,
  account: AccountUuidSchema,
  query: z.object({
    id: z.string().optional(),
    type: z.string().optional(),
    untilDate: DateSchema.optional()
  }),
  updates: z.object({
    read: z.boolean()
  })
}).strict()

const RemoveNotificationContextEventSchema = BaseEventSchema.extend({
  type: z.literal(NotificationEventType.RemoveNotificationContext),
  contextId: ContextIDSchema,
  account: AccountUuidSchema
}).strict()

const UpdateNotificationContextEventSchema = BaseEventSchema.extend({
  type: z.literal(NotificationEventType.UpdateNotificationContext),
  contextId: ContextIDSchema,
  account: AccountUuidSchema,
  updates: z.object({
    lastView: DateSchema.optional()
  })
}).strict()

const CreatePeerEventSchema = BaseEventSchema.extend({
  type: z.literal(PeerEventType.CreatePeer),
  workspaceId: WorkspaceUuidSchema,
  cardId: CardIDSchema,
  kind: z.string().nonempty(),
  value: z.string().nonempty(),
  extra: z.record(z.any()).optional(),
  options: z
    .object({
      newValue: z.boolean().optional()
    })
    .optional()
}).strict()

const RemovePeerEventSchema = BaseEventSchema.extend({
  type: z.literal(PeerEventType.RemovePeer),
  workspaceId: WorkspaceUuidSchema,
  cardId: CardIDSchema,
  kind: z.string().nonempty(),
  value: z.string().nonempty()
}).strict()

function deserializeEvent (event: Enriched<Event>): Enriched<Event> {
  switch (event.type) {
    case NotificationEventType.UpdateNotificationContext:
      event.updates.lastView = deserializeDate(event.updates.lastView)
      event.updates.lastNotify = deserializeDate(event.updates.lastNotify)
      event.updates.lastUpdate = deserializeDate(event.updates.lastUpdate)
      break
    case NotificationEventType.UpdateNotification:
      event.query.untilDate = deserializeDate(event.query.untilDate)
      break
  }

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  event.date = deserializeDate(event.date)!
  return event
}

function deserializeDate (date?: Date | string | undefined | null): Date | undefined {
  if (date == null) return undefined
  if (date instanceof Date) return date
  return new Date(date)
}
