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
  CreateMessageEvent,
  type Event,
  MessageEventType,
  PatchEvent,
  RemovePatchEvent,
  ThreadPatchEvent
} from '@hcengineering/communication-sdk-types'
import { CardPeer, MessageType, Peer } from '@hcengineering/communication-types'
import { generateId } from '@hcengineering/core'

import type { Enriched, TriggerCtx, TriggerFn, Triggers } from '../types'
import { generateMessageId } from '../messageId'

async function addThreadReply (ctx: TriggerCtx, event: Enriched<CreateMessageEvent>): Promise<Event[]> {
  if (event.messageType !== MessageType.Text || event.extra?.threadRoot === true) {
    return []
  }
  const { docClass, docId, socialId, date } = event

  const domain = ctx.hierarchy.getDomain(docClass)
  if (domain !== 'card') return []

  const thread = (await ctx.client.db.findThreadMeta({ threadId: docId, limit: 1 }))[0]

  if (thread === undefined) return []

  return [
    {
      type: MessageEventType.ThreadPatch,
      docClass: thread.docClass,
      docId: thread.docId,
      messageId: thread.messageId,
      operation: {
        opcode: 'addReply',
        threadId: thread.threadId
      },
      socialId,
      date
    }
  ]
}

async function removeThreadReply (ctx: TriggerCtx, event: Enriched<RemovePatchEvent>): Promise<Event[]> {
  const { docClass, docId } = event

  const domain = ctx.hierarchy.getDomain(docClass)
  if (domain !== 'card') return []

  const thread = (await ctx.client.db.findThreadMeta({ threadId: docId, limit: 1 }))[0]
  if (thread === undefined) return []

  return [
    {
      type: MessageEventType.ThreadPatch,
      docClass,
      docId,
      messageId: thread.messageId,
      operation: {
        opcode: 'removeReply',
        threadId: thread.threadId
      },
      date: event.date,
      socialId: event.socialId
    }
  ]
}

async function onThreadAttached (ctx: TriggerCtx, event: Enriched<ThreadPatchEvent>): Promise<Event[]> {
  if (event.operation.opcode !== 'attach') return []
  const message = await ctx.client.findMessage(event.docClass, event.docId, event.messageId, { attachments: true })

  if (message === undefined) return []

  const result: Event[] = []

  if (message.type === MessageType.Activity || message.extra?.threadRoot === true) {
    return []
  }

  const messageId = generateMessageId()

  result.push({
    messageId,
    type: MessageEventType.CreateMessage,
    messageType: message.type,
    docId: event.operation.threadId,
    docClass: event.operation.threadType,
    content: message.content,
    extra: { ...message.extra, threadRoot: true },
    socialId: message.creator,
    date: message.created,
    options: {
      noNotify: true
    }
  })

  result.push({
    type: MessageEventType.AttachmentPatch,
    docId: event.operation.threadId,
    docClass: event.operation.threadType,
    messageId,
    operations: [
      {
        opcode: 'add',
        attachments: message.attachments.map((it) => ({
          id: it.id,
          mimeType: it.mimeType,
          params: it.params
        }))
      }
    ],
    socialId: message.creator,
    date: message.created
  })

  return result
}

async function checkPeers (ctx: TriggerCtx, event: Enriched<CreateMessageEvent | PatchEvent>): Promise<Event[]> {
  const domain = ctx.hierarchy.getDomain(event.docClass)
  if (domain !== 'card') return []

  if (ctx.processedPeersEvents.has(event._id)) return []
  if (event.type === MessageEventType.CreateMessage) {
    if (event.messageType === MessageType.Activity) {
      return []
    }
  }

  if (event.type === MessageEventType.ThreadPatch) {
    return []
  }

  const cardPeers = new Set(
    (((event._eventExtra.peers ?? []) as Peer[]).filter((it) => it.kind === 'card') as CardPeer[])
      .flatMap((it) => it.members)
      .filter((it) => it.workspaceId === ctx.workspace && it.cardId !== event.docId)
      .map((it) => it.cardId)
  )

  if (cardPeers.size === 0) return []
  const res: Event[] = []

  for (const peer of cardPeers) {
    const ev = {
      ...event,
      _id: generateId(),
      cardId: peer
    }

    ctx.processedPeersEvents.add(ev._id)

    res.push(ev)
  }

  return res
}

const triggers: Triggers = [
  ['add_thread_reply_on_message_created', MessageEventType.CreateMessage, addThreadReply as TriggerFn],
  ['remove_reply_on_messages_removed', MessageEventType.RemovePatch, removeThreadReply as TriggerFn],

  ['on_thread_created', MessageEventType.ThreadPatch, onThreadAttached as TriggerFn],

  ['check_peers_on_message_created', MessageEventType.CreateMessage, checkPeers as TriggerFn],
  ['check_peers_on_update_patch', MessageEventType.UpdatePatch, checkPeers as TriggerFn],
  ['check_peers_on_remove_patch', MessageEventType.RemovePatch, checkPeers as TriggerFn],
  ['check_peers_on_reaction_patch', MessageEventType.ReactionPatch, checkPeers as TriggerFn],
  ['check_peers_on_attachment_patch', MessageEventType.AttachmentPatch, checkPeers as TriggerFn],
  ['check_peers_on_thread_patch', MessageEventType.ThreadPatch, checkPeers as TriggerFn]
]

export default triggers
