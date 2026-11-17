//
// Copyright © 2026 Intabia Fusion.
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

import { type ChatMessage } from '@hcengineering/chunter'
import { type BlobType, type Class, type Doc, type Domain, type Ref, toIdMap } from '@hcengineering/core'
import { type MigrateUpdate, type MigrationClient, type MigrationDocumentQuery } from '@hcengineering/model'
import notification, {
  type CommonNotification,
  type ContextNotification,
  type DocNotifyContext,
  collapseUnreadMessages,
  compactNotificationMessage,
  excerptMarkup,
  getUnreadMessagesTotal,
  isOversizedChatMessage,
  isOversizedMarkup,
  type UnreadMention,
  type UnreadMessage,
  type UnreadReaction
} from '@hcengineering/notification'
import { type Asset } from '@hcengineering/platform'
import activity, { type ActivityMessage, type Reaction } from '@hcengineering/activity'
import { DOMAIN_ACTIVITY, DOMAIN_REACTION } from '@hcengineering/model-activity'
import { type Attachment } from '@hcengineering/attachment'
import { DOMAIN_ATTACHMENT } from '@hcengineering/model-attachment'

import { DOMAIN_DOC_NOTIFY } from '../index'
import {
  type ActivityInboxNotification,
  type CommonInboxNotification,
  type DocNotifyContextOld,
  DOMAIN_NOTIFICATION,
  type InboxNotification,
  type MentionInboxNotification,
  type ReactionInboxNotification
} from './types'

async function getDoc<T extends Doc = Doc> (
  client: MigrationClient,
  _id: Ref<Doc>,
  _class: Ref<Class<Doc>>,
  cache: Map<Ref<Doc>, Doc>
): Promise<T | undefined> {
  if (_id == null) {
    return undefined
  }
  const current = cache.get(_id)
  if (current != null) {
    return current as T
  }

  const domain = client.hierarchy.findDomain(_class)
  if (domain == null) return
  const doc = (await client.find<Doc>(domain, { _id }))[0]
  if (doc != null && !client.hierarchy.hasClass(doc._class)) return
  if (doc != null) {
    cache.set(_id, doc)
  }
  return doc as any as T
}

function getTimestamp (doc: InboxNotification): number {
  return doc.createdOn ?? doc.modifiedOn ?? 0
}

async function mapToContextNotification (
  client: MigrationClient,
  inboxNotification: InboxNotification,
  reactionMap: Map<Ref<Reaction>, Reaction>,
  cache: Map<Ref<Doc>, Doc>,
  attachmentsByMessage: Map<Ref<ActivityMessage>, BlobType[]>
): Promise<ContextNotification | null> {
  const createdOn = getTimestamp(inboxNotification)
  const createdBy = inboxNotification.createdBy ?? inboxNotification.modifiedBy

  const _class = inboxNotification._class

  if (_class === 'notification:class:ActivityInboxNotification') {
    const activityNotif = inboxNotification as ActivityInboxNotification
    const message = await getDoc<ActivityMessage>(
      client,
      activityNotif.attachedTo,
      activityNotif.attachedToClass,
      cache
    )
    if (message == null) return null

    const attachments = attachmentsByMessage.get(activityNotif.attachedTo) ?? []

    return {
      type: 'message',
      id: activityNotif.attachedTo,
      messageId: activityNotif.attachedTo,
      message: compactNotificationMessage(message, client.hierarchy),
      truncated: isOversizedChatMessage(message) || undefined,
      attachments,
      createdBy,
      createdOn
    }
  } else if (_class === 'notification:class:ReactionInboxNotification') {
    const reactNotif = inboxNotification as ReactionInboxNotification
    const reaction = reactionMap.get(reactNotif.ref)
    if (reaction == null) return null
    const message = await getDoc<ActivityMessage>(client, reactNotif.attachedTo, reactNotif.attachedToClass, cache)
    if (message == null) return null

    const attachments = attachmentsByMessage.get(reactNotif.attachedTo) ?? []

    return {
      type: 'reaction',
      id: reactNotif.ref,
      messageId: reactNotif.attachedTo,
      message: compactNotificationMessage(message, client.hierarchy),
      truncated: isOversizedChatMessage(message) || undefined,
      attachments,
      reaction,
      createdBy,
      createdOn
    }
  } else if (_class === 'notification:class:MentionInboxNotification') {
    const mentionNotif = inboxNotification as MentionInboxNotification
    const message =
      mentionNotif.mentionedIn != null &&
      mentionNotif.mentionedInClass != null &&
      client.hierarchy.isDerived(mentionNotif.mentionedInClass, activity.class.ActivityMessage)
        ? await getDoc<ActivityMessage>(client, mentionNotif.mentionedIn, mentionNotif.mentionedInClass, cache)
        : undefined
    const markup = message?.message ?? mentionNotif.markup ?? ''

    const attachments = message != null ? (attachmentsByMessage.get(message._id) ?? []) : []

    return {
      type: 'mention',
      id: inboxNotification._id,
      messageId: message?._id,
      markup: isOversizedMarkup(markup) ? excerptMarkup(markup) : markup,
      truncated: isOversizedMarkup(markup) || undefined,
      attachments,
      createdBy,
      createdOn
    }
  } else if (_class === 'notification:class:CommonInboxNotification') {
    return mapToCommonNotification(inboxNotification as CommonInboxNotification)
  }

  return null
}

function mapToCommonNotification (inboxNotification: CommonInboxNotification): CommonNotification {
  const createdOn = getTimestamp(inboxNotification)
  const createdBy = inboxNotification.createdBy ?? inboxNotification.modifiedBy

  const messageIntl = inboxNotification.message
  const markup = inboxNotification.markup

  let icon: Asset | undefined
  let header: CommonNotification['header']

  if (inboxNotification.icon != null) {
    icon = inboxNotification.icon
  }

  if (inboxNotification.header !== undefined) {
    header = {
      objectId: inboxNotification.headerObjectId,
      objectClass: inboxNotification.headerObjectClass,
      titleIntl: inboxNotification.header,
      icon: inboxNotification.headerIcon
    }
  }

  return {
    type: 'common',
    id: inboxNotification._id,
    header,
    messageIntl,
    intlParams: {
      ...inboxNotification.intlParams,
      ...inboxNotification.props
    },
    intlParamsNotLocalized: inboxNotification.intlParamsNotLocalized,
    markup,
    icon,
    iconProps: inboxNotification.iconProps,
    createdBy,
    createdOn
  }
}

export async function migrateNotificationsToEmbedded (client: MigrationClient): Promise<void> {
  let processed = 0
  let failed = 0

  const iterator = await client.traverse<DocNotifyContextOld>(DOMAIN_DOC_NOTIFY, {
    _class: notification.class.DocNotifyContext,
    latestNotifications: { $exists: false }
  })

  try {
    while (true) {
      const contextsBatch = (await iterator.next(500)) ?? []

      if (contextsBatch.length === 0) break

      const chunkSize = 100
      for (let i = 0; i < contextsBatch.length; i += chunkSize) {
        const chunk = contextsBatch.slice(i, i + chunkSize)
        try {
          const chunkIds = chunk.map((c) => c._id).filter((id) => id != null)
          const toRemove = new Set<Ref<DocNotifyContextOld>>()
          const chunkNotifications = await client.find<InboxNotification>(DOMAIN_NOTIFICATION, {
            docNotifyContext: { $in: chunkIds }
          })

          const reactionIds = new Set<Ref<Reaction>>()
          for (const n of chunkNotifications) {
            if (n._class === 'notification:class:ReactionInboxNotification') {
              const ref = (n as ReactionInboxNotification).ref
              if (ref != null) {
                reactionIds.add(ref)
              }
            }
          }

          const cleanReactionIds = Array.from(reactionIds).filter((id) => id != null)
          const reactions =
            cleanReactionIds.length > 0
              ? await client.find<Reaction>(DOMAIN_REACTION, { _id: { $in: cleanReactionIds } })
              : []

          const reactionMap = toIdMap(reactions)

          const objectIdsByDomain = new Map<Domain, Ref<Doc>[]>()
          for (const context of chunk) {
            const objectId = context.objectId
            const objectClass = context.objectClass

            if (objectId != null && objectClass != null) {
              const domain = client.hierarchy.findDomain(objectClass)
              if (domain !== undefined) {
                let list = objectIdsByDomain.get(domain)
                if (list === undefined) {
                  list = []
                  objectIdsByDomain.set(domain, list)
                }
                list.push(objectId)
              }
            }
          }

          const objectsMap = new Map<Ref<Doc>, Doc>()
          for (const [domain, ids] of objectIdsByDomain.entries()) {
            const cleanIds = ids.filter((id) => id != null)
            if (cleanIds.length === 0) continue
            const docs = await client.find<Doc>(domain, { _id: { $in: cleanIds } })
            for (const doc of docs) {
              if (!client.hierarchy.hasClass(doc._class)) continue
              objectsMap.set(doc._id, doc)
            }
          }

          const parentIdsByDomain = new Map<Domain, Ref<Doc>[]>()
          for (const doc of objectsMap.values()) {
            if (client.hierarchy.isDerived(doc._class, activity.class.ActivityMessage)) {
              const message = doc as ActivityMessage
              const parentId = message.attachedTo
              const parentClass = message.attachedToClass
              if (parentId != null && parentClass != null) {
                const parentDomain = client.hierarchy.findDomain(parentClass)
                if (parentDomain !== undefined) {
                  let list = parentIdsByDomain.get(parentDomain)
                  if (list === undefined) {
                    list = []
                    parentIdsByDomain.set(parentDomain, list)
                  }
                  list.push(parentId)
                }
              }
            }
          }

          const parentObjectMap = new Map<Ref<Doc>, Doc>()
          for (const [domain, ids] of parentIdsByDomain.entries()) {
            const cleanIds = ids.filter((id) => id != null)
            if (cleanIds.length === 0) continue
            const docs = await client.find<Doc>(domain, { _id: { $in: cleanIds } })
            for (const doc of docs) {
              if (!client.hierarchy.hasClass(doc._class)) continue
              parentObjectMap.set(doc._id, doc)
            }
          }

          // Combine both maps for reference lookups
          const cache = new Map<Ref<Doc>, Doc>([...objectsMap, ...parentObjectMap])

          // Fetch all ActivityMessage documents referenced by chunkNotifications in the chunk
          const activityIds = new Set<Ref<ActivityMessage>>()
          for (const n of chunkNotifications) {
            if (n._class === 'notification:class:ActivityInboxNotification') {
              const attachedTo = (n as ActivityInboxNotification).attachedTo
              if (attachedTo != null) {
                activityIds.add(attachedTo)
              }
            } else if (n._class === 'notification:class:ReactionInboxNotification') {
              const attachedTo = (n as ReactionInboxNotification).attachedTo
              if (attachedTo != null) {
                activityIds.add(attachedTo)
              }
            } else if (n._class === 'notification:class:MentionInboxNotification') {
              const mentionNotif = n as MentionInboxNotification
              if (
                mentionNotif.mentionedIn != null &&
                client.hierarchy.isDerived(mentionNotif.mentionedInClass, activity.class.ActivityMessage)
              ) {
                activityIds.add(mentionNotif.mentionedIn as Ref<ActivityMessage>)
              }
            }
          }

          const cleanActivityIds = Array.from(activityIds).filter((id) => id != null)
          const loadAttachments = new Set<Ref<ActivityMessage>>()
          if (cleanActivityIds.length > 0) {
            const activityMessages = await client.find<ActivityMessage>(DOMAIN_ACTIVITY, {
              _id: { $in: cleanActivityIds }
            })
            for (const msg of activityMessages) {
              cache.set(msg._id, msg)

              if (((msg as ChatMessage)?.attachments ?? 0) > 0) {
                loadAttachments.add(msg._id)
              }
            }
          }

          const attachmentsByMessage = new Map<Ref<ActivityMessage>, BlobType[]>()

          const cleanLoadAttachments = Array.from(loadAttachments).filter((id) => id != null)
          if (cleanLoadAttachments.length > 0) {
            const attachments = await client.find<Attachment>(DOMAIN_ATTACHMENT, {
              attachedTo: { $in: cleanLoadAttachments }
            })
            for (const att of attachments) {
              let list = attachmentsByMessage.get(att.attachedTo as Ref<ActivityMessage>)
              if (list === undefined) {
                list = []
                attachmentsByMessage.set(att.attachedTo as Ref<ActivityMessage>, list)
              }
              list.push({
                file: att.file,
                type: att.type,
                name: att.name,
                size: att.size,
                metadata: att.metadata
              })
            }
          }

          const updates: {
            filter: MigrationDocumentQuery<DocNotifyContextOld>
            update: MigrateUpdate<DocNotifyContext>
          }[] = []

          for (const context of chunk) {
            const inboxNotifications = chunkNotifications.filter((n) => n.docNotifyContext === context._id)
            const targetDoc = await getDoc(client, context.objectId, context.objectClass, cache)

            if (targetDoc == null) {
              toRemove.add(context._id)
              continue
            }

            // The thread's own message; what the document looks like comes from its preview
            const message = client.hierarchy.isDerived(targetDoc._class, activity.class.ActivityMessage)
              ? compactNotificationMessage(targetDoc as ActivityMessage, client.hierarchy)
              : undefined

            // Sort notifications by createdOn ascending (oldest first)
            inboxNotifications.sort((a, b) => getTimestamp(a) - getTimestamp(b))

            const unreadMessages: UnreadMessage[] = []
            const unreadReactions: UnreadReaction[] = []
            const unreadMentions: UnreadMention[] = []
            const unreadCommons: CommonNotification[] = []

            for (const inboxNotification of inboxNotifications) {
              const isViewed = inboxNotification.isViewed
              if (!isViewed) {
                const notifClass = inboxNotification._class
                if (notifClass === 'notification:class:ActivityInboxNotification') {
                  const activityNotif = inboxNotification as ActivityInboxNotification
                  unreadMessages.push({
                    id: activityNotif.attachedTo,
                    createdOn: getTimestamp(activityNotif),
                    notified: true
                  })
                } else if (notifClass === 'notification:class:ReactionInboxNotification') {
                  const reactNotif = inboxNotification as ReactionInboxNotification
                  unreadReactions.push({
                    id: reactNotif.ref,
                    attachedTo: reactNotif.attachedTo
                  })
                } else if (notifClass === 'notification:class:MentionInboxNotification') {
                  const mentionNotif = inboxNotification as MentionInboxNotification
                  if (
                    mentionNotif.mentionedInClass != null &&
                    client.hierarchy.isDerived(mentionNotif.mentionedInClass, activity.class.ActivityMessage)
                  ) {
                    unreadMessages.push({
                      id: mentionNotif.mentionedIn as Ref<ActivityMessage>,
                      createdOn: getTimestamp(mentionNotif),
                      notified: true,
                      mentioned: true
                    })
                  } else {
                    unreadMentions.push({
                      id: inboxNotification._id
                    })
                  }
                } else if (notifClass === 'notification:class:CommonInboxNotification') {
                  unreadCommons.push(mapToCommonNotification(inboxNotification as CommonInboxNotification))
                }
              }
            }

            // Keep up to 5 latest context notifications
            const latestNotifications: ContextNotification[] = []

            for (const n of [...inboxNotifications].reverse()) {
              if (latestNotifications.length === 5) break
              const t = await mapToContextNotification(client, n, reactionMap, cache, attachmentsByMessage)
              if (t == null) continue
              latestNotifications.push(t)
            }

            // Every migrated message entry is `notified`, so the message part of unreadCount is the total.
            const unreadMessagesCount = getUnreadMessagesTotal(unreadMessages)
            const unreadCount =
              unreadMessagesCount + unreadMentions.length + unreadCommons.length + unreadReactions.length
            const lastNotify =
              inboxNotifications.length > 0 ? getTimestamp(inboxNotifications[inboxNotifications.length - 1]) : 0

            updates.push({
              filter: { _id: context._id },
              update: {
                latestNotifications,
                unreadReactions,
                unreadMentions,
                // Kept flat up to the limit, older entries folded into chunks like the service does on append.
                unreadMessages: collapseUnreadMessages(unreadMessages),
                unreadCommons,
                unreadCount,
                unreadMessagesCount,
                notifiedMessagesCount: unreadMessagesCount,
                lastNotify,
                message
              }
            })
          }

          if (updates.length > 0) {
            await client.bulk(DOMAIN_DOC_NOTIFY, updates)
          }

          if (toRemove.size > 0) {
            const toRemoveArray = Array.from(toRemove).filter((id) => id != null)
            if (toRemoveArray.length > 0) {
              await client.deleteMany(DOMAIN_DOC_NOTIFY, {
                _id: { $in: toRemoveArray }
              })
              await client.deleteMany(DOMAIN_NOTIFICATION, {
                docNotifyContext: { $in: toRemoveArray }
              })
            }
          }

          // Delete the migrated notifications for this chunk of contexts
          if (chunkIds.length > 0) {
            await client.deleteMany(DOMAIN_NOTIFICATION, {
              docNotifyContext: { $in: chunkIds }
            })
          }

          processed += chunk.length
          client.logger.log('...processed embedded notification chunk by contexts', { count: processed })
        } catch (err: any) {
          // One broken context must not stop the upgrade of the workspace: the chunk keeps its old
          // notifications, stays without `latestNotifications` and is picked up by the next run.
          failed += chunk.length
          client.logger.error('Failed to migrate a chunk of contexts to embedded notifications, skipped', {
            err,
            contextIds: chunk.map((c) => c._id)
          })
        }
      }
    }
  } finally {
    await iterator.close()
  }

  if (failed > 0) {
    client.logger.error('Contexts left unmigrated to embedded notifications, rerun the upgrade after the fix', {
      failed
    })
  }
}
