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
  FindMessagesMetaParams,
  FindThreadMetaParams,
  type MessageID,
  MessageMeta,
  type ThreadMeta
} from '@hcengineering/communication-types'
import { Doc, Ref, Class } from '@hcengineering/core'
import {
  Domain,
  ThreadMetaUpdate,
  ThreadMetaQuery,
  CreateMessageMetaAttrs,
  CreateThreadMetaAttrs
} from '@hcengineering/communication-sdk-types'

import { BaseDb } from './base'
import { DbModel, DbModelFilter, schemas } from '../schema'
import { toMessageMeta, toThreadMeta } from './mapping'

export class MessagesDb extends BaseDb {
  // Message Index
  public async createMessageMeta (docClass: Ref<Class<Doc>>, attrs: CreateMessageMetaAttrs): Promise<boolean> {
    const model: DbModel<Domain.MessageIndex> = {
      workspace_id: this.workspace,
      domain: this.hierarchy.getDomain(docClass),
      doc_id: attrs.docId,
      message_id: attrs.id,
      message_type: attrs.type,
      created: attrs.created,
      creator: attrs.creator,
      blob_id: attrs.blobId
    }
    const insertSql = this.getInsertSql(Domain.MessageIndex, model, [], {
      conflictColumns: ['workspace_id', 'domain', 'doc_id', 'message_id'],
      conflictAction: 'DO NOTHING'
    })

    const result = await this.execute(insertSql.sql, insertSql.values, 'insert message meta')

    return result.count !== 0
  }

  async removeMessageMeta (docClass: Ref<Class<Doc>>, docId: Ref<Doc>, messageId: MessageID | null): Promise<void> {
    const filter: DbModelFilter<Domain.MessageIndex> = [
      {
        column: 'workspace_id',
        value: this.workspace
      },
      {
        column: 'domain',
        value: this.hierarchy.getDomain(docClass)
      },
      {
        column: 'doc_id',
        value: docId
      },
      ...(messageId != null
        ? [
            {
              column: 'message_id',
              value: messageId
            } as const
          ]
        : [])
    ]

    const { sql, values } = this.getDeleteSql(Domain.MessageIndex, filter)

    await this.execute(sql, values, 'remove message meta')
  }

  public async findMessagesMeta (params: FindMessagesMetaParams): Promise<MessageMeta[]> {
    const select = `SELECT *
                      FROM ${Domain.MessageIndex} mi
                      `
    const limit = this.buildLimit(params.limit)
    const orderBy = this.buildOrderBy(params.order, 'mi.created')
    const { where, values } = this.buildMessageMetaWhere(params)

    const sql = [select, where, orderBy, limit].join(' ')
    const result = await this.execute(sql, values, 'find message meta')
    return result.map((it: any) => toMessageMeta(it))
  }

  private buildMessageMetaWhere (params: FindMessagesMetaParams): { where: string, values: any[] } {
    const where: string[] = []
    const values: any[] = []
    const schema = schemas[Domain.MessageIndex]

    let index = 1

    where.push(`mi.workspace_id = $${index++}::${schema.workspace_id}`)
    values.push(this.workspace)

    if (params.docClass != null) {
      where.push(`mi.domain = $${index++}::${schema.domain}`)
      values.push(this.hierarchy.getDomain(params.docClass))
    }

    if (params.docId != null) {
      where.push(`mi.doc_id = $${index++}::${schema.doc_id}`)
      values.push(params.docId)
    }

    if (params.id != null) {
      where.push(`mi.message_id = $${index++}::${schema.message_id}`)
      values.push(params.id)
    }

    if (params.creator != null) {
      where.push(`mi.creator = $${index++}::${schema.creator}`)
      values.push(params.creator)
    }

    return { where: `WHERE ${where.join(' AND ')}`, values }
  }

  // Thread Index
  async attachThreadMeta (docClass: Ref<Class<Doc>>, attrs: CreateThreadMetaAttrs): Promise<void> {
    const db: DbModel<Domain.ThreadIndex> = {
      workspace_id: this.workspace,
      domain: this.hierarchy.getDomain(docClass),
      doc_id: attrs.docId,
      doc_class: docClass,
      message_id: attrs.messageId,
      thread_id: attrs.threadId,
      thread_type: attrs.threadType
    }

    const { sql, values } = this.getInsertSql(Domain.ThreadIndex, db)

    await this.execute(sql, values, 'insert thread')
  }

  async updateThreadMeta (query: ThreadMetaQuery, update: ThreadMetaUpdate): Promise<void> {
    const set: string[] = []
    const values: any[] = []

    let index = 1

    if (update.threadType != null) {
      set.push(`thread_type = $${index++}::varchar`)
      values.push(update.threadType)
    }

    if (set.length === 0) return

    const updateSql = `UPDATE ${Domain.ThreadIndex}`
    const setSql = 'SET ' + set.join(', ')
    let where = `WHERE workspace_id = $${index++}::uuid`

    values.push(this.workspace)

    if (query.docClass != null) {
      where += ` AND domain= $${index++}::varchar`
      values.push(this.hierarchy.getDomain(query.docClass))
    }

    if (query.docId != null) {
      where += ` AND doc_id = $${index++}::varchar`
      values.push(query.docId)
    }

    if (query.messageId != null) {
      where += ` AND message_id = $${index++}::varchar`
      values.push(query.messageId)
    }
    if (query.threadId != null) {
      where += ` AND thread_id = $${index++}::varchar`
      values.push(query.threadId)
    }

    const sql = [updateSql, setSql, where].join(' ')

    await this.execute(sql, values, 'update thread')
  }

  async removeThreadMeta (query: ThreadMetaQuery): Promise<void> {
    const filter: DbModelFilter<Domain.ThreadIndex> = [
      {
        column: 'workspace_id',
        value: this.workspace
      }
    ]

    if (query.docClass != null) filter.push({ column: 'domain', value: this.hierarchy.getDomain(query.docClass) })
    if (query.docId != null) filter.push({ column: 'doc_id', value: query.docId })

    if (query.messageId != null) filter.push({ column: 'message_id', value: query.messageId })
    if (query.threadId != null) filter.push({ column: 'thread_id', value: query.threadId })

    const { sql, values } = this.getDeleteSql(Domain.ThreadIndex, filter)

    await this.execute(sql, values, 'remove threads')
  }

  async findThreadMeta (params: FindThreadMetaParams): Promise<ThreadMeta[]> {
    const { where, values } = this.buildThreadMetaWhere(params)
    const select = `
            SELECT *
            FROM ${Domain.ThreadIndex} t
        `

    const limit = this.buildLimit(params.limit)
    const orderBy = this.buildOrderBy(params.order, 't.date')

    const sql = [select, where, orderBy, limit].join(' ')
    const result = await this.execute(sql, values, 'find threads')

    return result.map((it: any) => toThreadMeta(it))
  }

  private buildThreadMetaWhere (
    params: FindThreadMetaParams,
    startIndex: number = 0,
    prefix: string = 't.'
  ): { where: string, values: any[] } {
    const where: string[] = []
    const values: any[] = []
    let index = startIndex + 1

    where.push(`${prefix}workspace_id = $${index++}::uuid`)
    values.push(this.workspace)

    if (params.docId != null) {
      where.push(`${prefix}doc_id = $${index++}::varchar`)
      values.push(params.docId)
    }

    if (params.messageId != null) {
      where.push(`${prefix}message_id = $${index++}::varchar`)
      values.push(params.messageId)
    }

    if (params.threadId != null) {
      where.push(`${prefix}thread_id = $${index++}::varchar`)
      values.push(params.threadId)
    }

    return { where: `WHERE ${where.join(' AND ')}`, values }
  }
}
