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

import {
  Class,
  Doc,
  Domain,
  MeasureContext,
  PersonUuid,
  Ref,
  SortingOrder,
  systemAccountUuid,
  WorkspaceUuid
} from '@hcengineering/core'
import { getWorkspaceClient, type HulylakeWorkspaceClient, type JsonPatch } from '@hcengineering/hulylake-client'
import { generateToken } from '@hcengineering/server-token'
import {
  Attachment,
  AttachmentID,
  AttachmentUpdateData,
  BlobID,
  CardID,
  CardType,
  FindMessagesGroupParams,
  Markdown,
  Message,
  MessageDoc,
  MessageExtra,
  MessageID,
  MessagesDoc,
  MessagesGroup,
  MessagesGroupDoc,
  MessagesGroupsDoc,
  Thread
  , ComparisonOperator
} from '@hcengineering/communication-types'
import { v4 as uuid } from 'uuid'

import { Metadata } from './types'
import { buildMessagesBlobUrl, buildMessagesGroupsUrl } from '@hcengineering/communication-shared'

export class Blob {
  private readonly client: HulylakeWorkspaceClient
  // Groups sored by fromDate
  private readonly messageGroupsByDocId = new Map<Domain, Map<Ref<Doc>, MessagesGroup[]>>()
  private readonly messageGroupsPromises = new Map<Domain, Map<Ref<Doc>, Promise<MessagesGroup[]>>>()
  private readonly messageGroupCreationPromises = new Map<Domain, Map<Ref<Doc>, Promise<MessagesGroup>>>()

  private readonly retryOptions = {
    maxRetries: 3,
    isRetryable: () => true,
    delayStrategy: {
      getDelay: () => 1000
    }
  } as const

  constructor (private readonly ctx: MeasureContext, private readonly workspace: WorkspaceUuid, private readonly metadata: Metadata) {
    this.client = getWorkspaceClient(metadata.hulylakeUrl, workspace, generateToken(systemAccountUuid, workspace, undefined, metadata.secret))
  }

  public async getMessageGroupByDate (domain: Domain, docClass: Ref<Class<Doc>>, docId: Ref<Doc>, date: Date, create = true): Promise<MessagesGroup | undefined> {
    const all = await this.getAllMessageGroups(domain, docId)
    const ts = date.getTime()
    const match = all.find(g => g.fromDate.getTime() <= ts && g.toDate.getTime() >= ts)

    if (match != null) return match

    const lastGroup = all[all.length - 1]
    if (lastGroup != null && lastGroup.fromDate.getTime() <= ts && lastGroup.count < this.metadata.messagesPerBlob) {
      return lastGroup
    }

    const firstGroup = all[0]
    if (firstGroup != null && firstGroup.fromDate.getTime() >= ts && firstGroup.count < this.metadata.messagesPerBlob) {
      return firstGroup
    }

    if (create) return await this.createMessageGroup(domain, docClass, docId, date)

    return undefined
  }

  public async findMessagesGroups (domain: Domain, params: FindMessagesGroupParams): Promise<MessagesGroup[]> {
    const { docId, fromDate, toDate, blobId, limit, order } = params
    const groups = await this.getAllMessageGroups(domain, docId)

    if (order === SortingOrder.Ascending) {
      groups.sort((a, b) => a.fromDate.getTime() - b.fromDate.getTime())
    } else if (order === SortingOrder.Descending) {
      groups.sort((a, b) => b.fromDate.getTime() - a.fromDate.getTime())
    }

    if (fromDate == null && toDate == null && blobId == null && limit == null) {
      return groups
    }

    const result: MessagesGroup[] = []
    for (const group of groups) {
      if (blobId != null && group.blobId !== blobId) continue
      if (fromDate != null && !matchDate(group.fromDate, fromDate)) continue
      if (toDate != null && !matchDate(group.toDate, toDate)) continue

      result.push(group)

      if (limit != null && result.length >= limit) break
    }

    return result
  }

  public async updateDocClass (domain: Domain, docId: Ref<Doc>, newClass: Ref<Class<Doc>>): Promise<void> {
    const patches: JsonPatch[] = [{
      op: 'replace',
      path: '/docClass',
      value: newClass
    }]

    const groups = await this.getAllMessageGroups(domain, docId)

    await Promise.all(groups.map(g => this.patchJson(domain, docId, g.blobId, patches)))
  }

  public async insertMessage (domain: Domain, docId: Ref<Doc>, group: MessagesGroup, message: Message): Promise<void> {
    const updateToDate = message.created.getTime() > group.toDate.getTime()
    const updateFromDate = message.created.getTime() < group.fromDate.getTime()

    const serializedMessage = this.serializeMessage(message)
    const patches: JsonPatch[] = [
      {
        hop: 'add',
        path: `/messages/${message.id}`,
        value: serializedMessage,
        safe: true
      },
      ...(updateToDate
        ? [
            {
              op: 'replace',
              path: '/toDate',
              value: message.created
            } as const
          ]
        : []),
      ...(updateFromDate
        ? [
            {
              hop: 'add',
              path: '/fromDate',
              value: message.created
            } as const
          ]
        : [])
    ]
    await this.patchJson(domain, docId, group.blobId, patches)
    void this.incrementMessagesCount(domain, docId, group.blobId, updateToDate ? message.created : undefined, updateFromDate ? message.created : undefined)
  }

  public async updateMessage (domain: Domain, docId: Ref<Doc>, blobId: BlobID, messageId: MessageID, update: {
    language?: string
    content?: Markdown
    extra?: MessageExtra
  }, date: Date): Promise<void> {
    const patches: JsonPatch[] = []

    if (update.content != null) {
      patches.push({
        op: 'replace',
        path: `/messages/${messageId}/content`,
        value: update.content
      })
    }

    if (update.extra != null) {
      patches.push({
        op: 'replace',
        path: `/messages/${messageId}/extra`,
        value: update.extra
      })
    }

    if (update.language != null) {
      patches.push({
        op: 'replace',
        path: `/messages/${messageId}/language`,
        value: update.language
      })
    }

    if (patches.length === 0) return

    if (update.content != null || update.extra != null) {
      patches.push({
        op: 'replace',
        path: `/messages/${messageId}/modified`,
        value: date
      })
    }

    await this.patchJson(domain, docId, blobId, patches)
  }

  public async removeMessage (domain: Domain, docId: Ref<Doc>, blobId: BlobID, messageId: MessageID): Promise<void> {
    const patches: JsonPatch[] = [
      {
        hop: 'remove',
        path: `/messages/${messageId}`,
        safe: true
      } as const
    ]

    await this.patchJson(domain, docId, blobId, patches)
    void this.decrementMessagesCount(domain, docId, blobId)
  }

  public async addReaction (domain: Domain, docId: Ref<Doc>, blobId: BlobID, messageId: MessageID, emoji: string, person: PersonUuid, date: Date): Promise<void> {
    const patches: JsonPatch[] = [
      {
        hop: 'add',
        path: `/messages/${messageId}/reactions/${emoji}`,
        value: {},
        safe: true
      },
      {
        hop: 'add',
        path: `/messages/${messageId}/reactions/${emoji}/${person}`,
        value: {
          count: 1,
          date
        },
        safe: true
      }
    ]
    await this.patchJson(domain, docId, blobId, patches)
  }

  public async removeReaction (domain: Domain, docId: Ref<Doc>, blobId: BlobID, messageId: MessageID, emoji: string, person: PersonUuid): Promise<void> {
    const patches: JsonPatch[] = [
      {
        hop: 'remove',
        path: `/messages/${messageId}/reactions/${emoji}/${person}`,
        safe: true
      }
    ]
    await this.patchJson(domain, docId, blobId, patches)
  }

  public async addAttachments (domain: Domain, docId: Ref<Doc>, blobId: BlobID, messageId: MessageID, attachments: Attachment[]): Promise<void> {
    const patches: JsonPatch[] = []

    for (const attachment of attachments) {
      patches.push({
        op: 'add',
        path: `/messages/${messageId}/attachments/${attachment.id}`,
        value: attachment
      })
    }
    await this.patchJson(domain, docId, blobId, patches)
  }

  public async removeAttachments (domain: Domain, docId: Ref<Doc>, blobId: BlobID, messageId: MessageID, attachmentIds: AttachmentID[]): Promise<void> {
    const patches: JsonPatch[] = []

    for (const attachmentId of attachmentIds) {
      patches.push({
        hop: 'remove',
        path: `/messages/${messageId}/attachments/${attachmentId}`,
        safe: true
      })
    }
    await this.patchJson(domain, docId, blobId, patches)
  }

  public async setAttachments (domain: Domain, docId: Ref<Doc>, blobId: BlobID, messageId: MessageID, attachments: Attachment[]): Promise<void> {
    const patches: JsonPatch[] = [{
      op: 'replace',
      path: `/messages/${messageId}/attachments`,
      value: {}
    }]

    for (const attachment of attachments) {
      patches.push({
        op: 'add',
        path: `/messages/${messageId}/attachments/${attachment.id}`,
        value: attachment
      })
    }
    await this.patchJson(domain, docId, blobId, patches)
  }

  public async updateAttachments (domain: Domain, docId: Ref<Doc>, blobId: BlobID, messageId: MessageID, updates: AttachmentUpdateData[], date: Date): Promise<void> {
    const patches: JsonPatch[] = []
    for (const update of updates) {
      const keys = Object.keys(update.params)
      if (keys.length === 0) continue
      for (const key of keys) {
        patches.push({
          op: 'add',
          path: `/messages/${messageId}/attachments/${update.id}/params/${key}`,
          value: update.params[key]
        })
      }
      patches.push({
        op: 'add',
        path: `/messages/${messageId}/attachments/${update.id}/modified`,
        value: date.toISOString()
      })
    }

    await this.patchJson(domain, docId, blobId, patches)
  }

  public async attachThread (domain: Domain, docId: Ref<Doc>, blobId: BlobID, messageId: MessageID, thread: Thread): Promise<void> {
    const patches: JsonPatch[] = [
      {
        op: 'add',
        path: `/messages/${messageId}/threads/${thread.threadId}`,
        value: thread
      }
    ]
    await this.patchJson(domain, docId, blobId, patches)
  }

  public async updateThread (domain: Domain, docId: Ref<Doc>, blobId: BlobID, messageId: MessageID, threadId: CardID, update: { threadType: CardType }): Promise<void> {
    const patches: JsonPatch[] = [
      {
        op: 'add',
        path: `/messages/${messageId}/threads/${threadId}/threadType`,
        value: update.threadType
      }
    ]
    await this.patchJson(domain, docId, blobId, patches)
  }

  public async addThreadReply (domain: Domain, docId: Ref<Doc>, blobId: BlobID, messageId: MessageID, threadId: CardID, person: PersonUuid, date: Date): Promise<void> {
    const patches: JsonPatch[] =
      [
        {
          hop: 'inc',
          path: `/messages/${messageId}/threads/${threadId}/repliesCount`,
          value: 1
        },
        {
          op: 'add',
          path: `/messages/${messageId}/threads/${threadId}/lastReply`,
          value: date
        },
        {
          hop: 'inc',
          path: `/messages/${messageId}/threads/${threadId}/repliedPersons/${person}`,
          value: 1
        }
      ]

    await this.patchJson(domain, docId, blobId, patches)
  }

  public async removeThreadReply (domain: Domain, docId: Ref<Doc>, blobId: BlobID, messageId: MessageID, threadId: CardID, person: PersonUuid): Promise<void> {
    const patches: JsonPatch[] =
      [
        {
          hop: 'inc',
          path: `/messages/${messageId}/threads/${threadId}/repliesCount`,
          value: -1
        },
        {
          hop: 'inc',
          path: `/messages/${messageId}/threads/${threadId}/repliedPersons/${person}`,
          value: -1
        }
      ]

    await this.patchJson(domain, docId, blobId, patches)
  }

  public async removeThread (domain: Domain, docId: Ref<Doc>, blobId: BlobID, messageId: MessageID, threadId: CardID): Promise<void> {
    const patches: JsonPatch[] = [
      {
        hop: 'remove',
        path: `/messages/${messageId}/threads/${threadId}`,
        safe: true
      }
    ]
    await this.patchJson(domain, docId, blobId, patches)
  }

  private async patchJson (domain: Domain, docId: Ref<Doc>, blobId: BlobID, patches: JsonPatch[]): Promise<void> {
    await this.client.patchJson(buildMessagesBlobUrl(domain, docId, blobId), patches, undefined, this.retryOptions)
  }

  private setMessageGroups (domain: Domain, docId: Ref<Doc>, groups: MessagesGroup[]): void {
    const sorted = groups.sort((a, b) => a.fromDate.getTime() - b.fromDate.getTime())
    const map = this.messageGroupsByDocId.get(domain)
    if (map != null) {
      map.set(docId, sorted)
    } else {
      this.messageGroupsByDocId.set(domain, new Map([[docId, sorted]]))
    }
  }

  private setMessageGroupsPromises (domain: Domain, docId: Ref<Doc>, promise: Promise<MessagesGroup[]>): void {
    const map = this.messageGroupsPromises.get(domain)
    if (map != null) {
      map.set(docId, promise)
    } else {
      this.messageGroupsPromises.set(domain, new Map([[docId, promise]]))
    }
  }

  private setMessageGroupCreationPromise (domain: Domain, docId: Ref<Doc>, promise: Promise<MessagesGroup>): void {
    const map = this.messageGroupCreationPromises.get(domain)
    if (map != null) {
      map.set(docId, promise)
    } else {
      this.messageGroupCreationPromises.set(domain, new Map([[docId, promise]]))
    }
  }

  private async getAllMessageGroups (domain: Domain, docId: Ref<Doc>): Promise<MessagesGroup[]> {
    const createPromise = this.messageGroupCreationPromises.get(domain)?.get(docId)

    if (createPromise != null) {
      await createPromise
    }

    const alreadyLoadedGroups = this.messageGroupsByDocId.get(domain)?.get(docId) ?? []
    if (alreadyLoadedGroups.length > 0) {
      return alreadyLoadedGroups.sort((a, b) => a.fromDate.getTime() - b.fromDate.getTime())
    }

    const existingPromise = this.messageGroupsPromises.get(domain)?.get(docId)
    if (existingPromise != null) return await existingPromise

    const promise = (async () => {
      try {
        const res = await this.client.getJson<MessagesGroupsDoc>(buildMessagesGroupsUrl(domain, docId), this.retryOptions)
        if (res.status === 404) {
          await this.createMessagesGroupBlob(domain, docId)
          this.setMessageGroups(domain, docId, [])
          return []
        }

        const groups = Object.values(res.body ?? {}).map(it => this.deserializeMessageGroup(it)).sort((a, b) => a.fromDate.getTime() - b.fromDate.getTime())
        this.setMessageGroups(domain, docId, groups)
        return groups
      } finally {
        this.messageGroupsPromises.get(domain)?.delete(docId)
      }
    })()

    this.setMessageGroupsPromises(domain, docId, promise)
    return await promise
  }

  private async createMessagesGroupBlob (domain: Domain, docId: Ref<Doc>): Promise<void> {
    await this.client.putJson(buildMessagesGroupsUrl(domain, docId), {}, undefined, this.retryOptions)
  }

  private async incrementMessagesCount (domain: Domain, docId: Ref<Doc>, blobId: BlobID, toDate?: Date, fromDate?: Date): Promise<void> {
    const groups = await this.getAllMessageGroups(domain, docId)
    const group = groups.find((g) => g.blobId === blobId)

    if (group == null) return

    this.setMessageGroups(domain, docId, groups.map((g) => g.blobId === blobId ? ({ ...g, count: g.count + 1, toDate: toDate ?? group.toDate, fromDate: fromDate ?? group.fromDate }) : g))

    const patches: JsonPatch[] = [
      {
        hop: 'inc',
        path: `/${blobId}/count`,
        value: 1
      },
      ...toDate != null
        ? [{
            op: 'replace',
            path: `/${blobId}/toDate`,
            value: toDate
          } as const]
        : [],
      ...fromDate != null
        ? [{
            hop: 'add',
            path: `/${blobId}/fromDate`,
            value: fromDate
          } as const]
        : []
    ]
    await this.client.patchJson(buildMessagesGroupsUrl(domain, docId), patches, undefined, this.retryOptions)
  }

  private async decrementMessagesCount (domain: Domain, docId: Ref<Doc>, blobId: BlobID): Promise<void> {
    const groups = await this.getAllMessageGroups(domain, docId)
    const group = groups.find((g) => g.blobId === blobId)

    if (group == null) return

    const count = group.count - 1
    group.count = count

    this.setMessageGroups(domain, docId, groups.map((g) => g.blobId === blobId ? ({ ...g, count }) : g))

    const patches: JsonPatch[] = [
      {
        hop: 'inc',
        path: `/${blobId}/count`,
        value: -1
      }
    ]
    await this.client.patchJson(buildMessagesGroupsUrl(domain, docId), patches, undefined, this.retryOptions)
  }

  private async createMessageGroup (domain: Domain, docClass: Ref<Class<Doc>>, docId: Ref<Doc>, date: Date): Promise<MessagesGroup> {
    const createPromise = this.messageGroupCreationPromises.get(domain)?.get(docId)

    if (createPromise != null) {
      await createPromise
      const group = await this.getMessageGroupByDate(domain, docClass, docId, date, false)
      if (group != null) return group
    }

    const promise = (async () => {
      try {
        const groupDoc: MessagesGroupDoc = {
          docId,
          docClass,
          blobId: uuid() as BlobID,
          fromDate: date.toISOString(),
          toDate: date.toISOString(),
          count: 0
        }
        const patches: JsonPatch[] = [
          {
            hop: 'add',
            path: `/${groupDoc.blobId}`,
            value: groupDoc,
            safe: true
          }
        ]

        await this.client.patchJson(buildMessagesGroupsUrl(domain, docId), patches, undefined, this.retryOptions)
        const group = this.deserializeMessageGroup(groupDoc)

        if ((this.messageGroupsByDocId.get(domain)?.has(docId)) === true) {
          const groups = [...this.messageGroupsByDocId.get(domain)?.get(docId) ?? [], group]
          this.setMessageGroups(domain, docId, groups)
        } else {
          this.setMessageGroups(domain, docId, [group])
        }
        await this.createMessagesBlob(domain, docClass, docId, groupDoc.blobId, date, date)

        return group
      } finally {
        this.messageGroupCreationPromises.get(domain)?.delete(docId)
      }
    })()

    this.setMessageGroupCreationPromise(domain, docId, promise)
    return await promise
  }

  private async createMessagesBlob (domain: Domain, docClass: Ref<Class<Doc>>, docId: Ref<Doc>, blobId: BlobID, from: Date, to: Date): Promise<void> {
    const initialJson: MessagesDoc = {
      docId,
      docClass,
      fromDate: from.toISOString(),
      toDate: to.toISOString(),
      language: 'original',
      messages: {}
    }

    await this.client.putJson(buildMessagesBlobUrl(domain, docId, blobId), initialJson, undefined, this.retryOptions)
  }

  private deserializeMessageGroup (group: MessagesGroupDoc): MessagesGroup {
    return {
      docId: group.docId,
      docClass: group.docClass,
      blobId: group.blobId,
      fromDate: new Date(group.fromDate),
      toDate: new Date(group.toDate),
      count: group.count
    }
  }

  private serializeMessage (message: Message): MessageDoc {
    return {
      ...message,
      language: message.language ?? null,
      extra: message.extra ?? {},
      created: message.created.toISOString(),
      modified: message.modified?.toISOString() ?? null,
      reactions: {},
      attachments: {},
      threads: {}
    }
  }
}

function matchDate (date: Date, filter: Partial<Record<ComparisonOperator, Date>> | Date): boolean {
  const ts = date.getTime()
  if (filter instanceof Date) return ts === filter.getTime()

  if (filter.greater != null && !(ts > filter.greater.getTime())) return false
  if (filter.greaterOrEqual != null && !(ts >= filter.greaterOrEqual.getTime())) return false
  if (filter.less != null && !(ts < filter.less.getTime())) return false
  if (filter.lessOrEqual != null && !(ts <= filter.lessOrEqual.getTime())) return false
  if (filter.notEqual != null && !(ts !== filter.notEqual.getTime())) return false

  return true
}
