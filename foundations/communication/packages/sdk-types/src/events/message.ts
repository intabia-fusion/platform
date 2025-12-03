import type {
  CardID,
  MessageID,
  Markdown,
  SocialID,
  BlobID,
  MessageType,
  CardType,
  MessageExtra,
  AttachmentData,
  AttachmentID,
  AttachmentUpdateData,
  Emoji
} from '@hcengineering/communication-types'
import type { Ref, Class, Doc, PersonUuid } from '@hcengineering/core'

import type { BaseEvent } from './common'

export enum MessageEventType {
  // Public events
  CreateMessage = 'createMessage',
  UpdatePatch = 'updatePatch',
  RemovePatch = 'removePatch',
  ReactionPatch = 'reactionPatch',
  AttachmentPatch = 'attachmentPatch',
  ThreadPatch = 'threadPatch',
  TranslateMessage = 'translateMessage'
}

export type PatchEvent =
  | UpdatePatchEvent
  | RemovePatchEvent
  | ReactionPatchEvent
  | AttachmentPatchEvent
  | ThreadPatchEvent

export type MessageEvent = CreateMessageEvent | PatchEvent | TranslateMessageEvent

export interface CreateMessageOptions {
  // Available for regular users (Not implemented yet)
  skipLinkPreviews?: boolean
  // Available only for system
  noNotify?: boolean
  // Dont add to collaborators mentioned users
  ignoreMentions?: boolean
}
export interface UpdatePatchOptions {
  // Available for regular users (Not implemented yet)
  skipLinkPreviewsUpdate?: boolean
  // Dont add to collaborators mentioned users
  ignoreMentions?: boolean
}

export interface CreateMessageEvent extends BaseEvent {
  type: MessageEventType.CreateMessage

  docId: Ref<Doc>
  docClass: Ref<Class<Doc>>

  messageId?: MessageID
  messageType: MessageType

  content: Markdown
  language?: string
  extra?: MessageExtra

  options?: CreateMessageOptions
}

export interface TranslateMessageEvent extends BaseEvent {
  type: MessageEventType.TranslateMessage

  docId: Ref<Doc>
  docClass: Ref<Class<Doc>>

  messageId: MessageID
  content: Markdown
  language: string
}

// Available for author and system
export interface UpdatePatchEvent extends BaseEvent {
  type: MessageEventType.UpdatePatch

  docId: Ref<Doc>
  docClass: Ref<Class<Doc>>
  messageId: MessageID

  content?: Markdown
  extra?: MessageExtra
  language?: string

  options?: UpdatePatchOptions
}

// Available for author and system
export interface RemovePatchEvent extends BaseEvent {
  type: MessageEventType.RemovePatch

  docId: Ref<Doc>
  docClass: Ref<Class<Doc>>
  messageId: MessageID
  messageType?: MessageType// Set by server
}

export interface AddReactionOperation {
  opcode: 'add'
  reaction: Emoji
}

export interface RemoveReactionOperation {
  opcode: 'remove'
  reaction: Emoji
}

// For any user
export interface ReactionPatchEvent extends BaseEvent {
  type: MessageEventType.ReactionPatch

  docId: Ref<Doc>
  docClass: Ref<Class<Doc>>
  messageId: MessageID

  operation: AddReactionOperation | RemoveReactionOperation

  personUuid?: PersonUuid // Set by server
}

export interface AddAttachmentsOperation {
  opcode: 'add'
  attachments: AttachmentData[]
}

export interface RemoveAttachmentsOperation {
  opcode: 'remove'
  ids: AttachmentID[]
}

export interface SetAttachmentsOperation {
  opcode: 'set'
  attachments: AttachmentData[]
}

export interface UpdateAttachmentsOperation {
  opcode: 'update'
  attachments: AttachmentUpdateData[]
}

// For system and message author
export interface AttachmentPatchEvent extends BaseEvent {
  type: MessageEventType.AttachmentPatch

  docId: Ref<Doc>
  docClass: Ref<Class<Doc>>
  messageId: MessageID

  operations: (
    | AddAttachmentsOperation
    | RemoveAttachmentsOperation
    | SetAttachmentsOperation
    | UpdateAttachmentsOperation
  )[]
}

// For any user
export interface AttachThreadOperation {
  opcode: 'attach'
  threadId: CardID
  threadType: CardType
}

// For system
export interface UpdateThreadOperation {
  opcode: 'update'
  threadId: CardID
  update: {
    threadType: CardType
  }
}

// For system
export interface AddReplyOperation {
  opcode: 'addReply'
  threadId: CardID
}

// For system
export interface RemoveReplyOperation {
  opcode: 'removeReply'
  threadId: CardID
}

export interface ThreadPatchEvent extends BaseEvent {
  type: MessageEventType.ThreadPatch

  docId: Ref<Doc>
  docClass: Ref<Class<Doc>>
  messageId: MessageID

  operation: AttachThreadOperation | UpdateThreadOperation | AddReplyOperation | RemoveReplyOperation

  personUuid?: PersonUuid // Set by server
}

export interface CreateMessageResult {
  messageId: MessageID
  created: Date
  blobId: BlobID
}

export type MessageEventResult = CreateMessageResult
