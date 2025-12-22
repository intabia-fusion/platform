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
  DocEventType,
  MessageEventType,
  NotificationEventType,
  type Event,
  UpdateClassDocEvent,
  RemoveDocEvent
} from '@hcengineering/communication-sdk-types'
import { type ActivityTypeUpdate, ActivityUpdateType, CardType, MessageType } from '@hcengineering/communication-types'

import type { Enriched, TriggerCtx, TriggerFn, Triggers } from '../types'

async function createActivityOnCardTypeUpdate (ctx: TriggerCtx, event: UpdateClassDocEvent): Promise<Event[]> {
  const prevDomain = ctx.hierarchy.getDomain(event.docClass)
  const newDomain = ctx.hierarchy.getDomain(event.newClass)

  if (prevDomain !== 'card' || newDomain !== 'card') return []

  const updateDate: ActivityTypeUpdate = {
    type: ActivityUpdateType.Type,
    newType: event.newClass as CardType
  }

  return [
    {
      type: MessageEventType.CreateMessage,
      messageType: MessageType.Activity,
      docId: event.docId,
      docClass: event.newClass,
      content: 'Changed type',
      socialId: event.socialId,
      date: event.date,
      extra: {
        action: 'update',
        update: updateDate
      }
    }
  ]
}

async function onDocClassUpdate (ctx: TriggerCtx, event: Enriched<UpdateClassDocEvent>): Promise<Event[]> {
  await ctx.client.db.updateLabels({ docClass: event.docClass, docId: event.docId }, { docClass: event.newClass })

  const prevDomain = ctx.hierarchy.getDomain(event.docClass)
  const newDomain = ctx.hierarchy.getDomain(event.newClass)

  if (prevDomain !== 'card' || newDomain !== 'card') return []

  const thread = (await ctx.client.db.findThreadMeta({ threadId: event.docId, limit: 1 }))[0]
  if (thread === undefined) return []

  return [
    {
      type: MessageEventType.ThreadPatch,
      docId: thread.docId,
      docClass: thread.docClass,
      messageId: thread.messageId,
      operation: {
        opcode: 'update',
        threadId: thread.threadId,
        update: {
          threadType: event.newClass as CardType
        }
      },
      socialId: event.socialId,
      date: event.date
    }
  ]
}

async function removeCardLabels (ctx: TriggerCtx, event: RemoveDocEvent): Promise<Event[]> {
  await ctx.client.db.removeLabels({ docClass: event.docClass, docId: event.docId })
  return []
}

async function removeCardThreads (ctx: TriggerCtx, event: RemoveDocEvent): Promise<Event[]> {
  await ctx.client.db.removeThreadMeta({ docId: event.docId, docClass: event.docClass })

  const domain = ctx.hierarchy.getDomain(event.docClass)
  const isCard = domain === 'card'

  if (!isCard) return []

  const toRemove = await ctx.client.db.findThreadMeta({ threadId: event.docId })
  for (const thread of toRemove) {
    const meta = await ctx.client.getMessageMeta(thread.docClass, thread.docId, thread.messageId)
    if (meta === undefined) continue
    await ctx.client.blob.removeThread(domain, thread.docId, meta.blobId, thread.messageId, thread.threadId)
  }

  await ctx.client.db.removeThreadMeta({ threadId: event.docId })

  return []
}

async function removeDocMeta (ctx: TriggerCtx, event: RemoveDocEvent): Promise<Event[]> {
  await ctx.client.removeAllDocMessageMeta(event.docClass, event.docId)

  return []
}

async function removeNotificationContexts (ctx: TriggerCtx, event: RemoveDocEvent): Promise<Event[]> {
  const result: Event[] = []
  const contexts = await ctx.client.db.findNotificationContexts({ docClass: event.docClass, docId: event.docId })
  for (const context of contexts) {
    result.push({
      type: NotificationEventType.RemoveNotificationContext,
      contextId: context.id,
      account: context.account,
      date: new Date(),
      socialId: event.socialId
    })
  }
  return result
}

const triggers: Triggers = [
  ['on_doc_type_updates', DocEventType.UpdateClassDoc, onDocClassUpdate as TriggerFn],
  ['create_activity_on_doc_type_updates', DocEventType.UpdateClassDoc, createActivityOnCardTypeUpdate as TriggerFn],

  ['remove_labels_on_doc_removed', DocEventType.RemoveDoc, removeCardLabels as TriggerFn],
  ['remove_threads_on_doc_removed', DocEventType.RemoveDoc, removeCardThreads as TriggerFn],
  ['remove_doc_meta_on_doc_removed', DocEventType.RemoveDoc, removeDocMeta as TriggerFn],
  ['remove_notification_contexts_on_doc_removed', DocEventType.RemoveDoc, removeNotificationContexts as TriggerFn]
]

export default triggers
