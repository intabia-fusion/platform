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
  type FindLabelsParams,
  type LabelID,
  type Label
} from '@hcengineering/communication-types'
import {
  type AccountUuid,
  Doc,
  Ref,
  Class
} from '@hcengineering/core'
import { Domain, LabelQuery, LabelUpdate } from '@hcengineering/communication-sdk-types'

import { BaseDb } from './base'
import { toLabel } from './mapping'
import { DbModel, DbModelFilter, DbModelUpdate } from '../schema'

export class LabelsDb extends BaseDb {
  async createLabel (
    docClass: Ref<Class<Doc>>,
    docId: Ref<Doc>,
    label: LabelID,
    account: AccountUuid,
    created: Date
  ): Promise<void> {
    const db: DbModel<Domain.Label> = {
      workspace_id: this.workspace,
      domain: this.hierarchy.getDomain(docClass),
      doc_id: docId,
      doc_class: docClass,
      label_id: label,
      account,
      created
    }
    const { sql, values } = this.getInsertSql(Domain.Label, db, [], {
      conflictColumns: ['workspace_id', 'domain', 'label_id', 'doc_id', 'account'],
      conflictAction: 'DO NOTHING'
    })
    await this.execute(sql, values, 'insert label')
  }

  async removeLabels (query: LabelQuery): Promise<void> {
    const filter: DbModelFilter<Domain.Label> = []

    if (query.docClass != null) {
      filter.push({
        column: 'domain',
        value: this.hierarchy.getDomain(query.docClass)
      })
    }

    if (query.docId != null) {
      filter.push({
        column: 'doc_id',
        value: query.docId
      })
    }

    if (query.labelId != null) {
      filter.push({
        column: 'label_id',
        value: query.labelId
      })
    }

    if (query.account != null) {
      filter.push({
        column: 'account',
        value: query.account
      })
    }

    if (filter.length === 0) return

    filter.unshift({
      column: 'workspace_id',
      value: this.workspace
    })

    const { sql, values } = this.getDeleteSql(Domain.Label, filter)

    await this.execute(sql, values, 'remove labels')
  }

  async updateLabels (query: LabelQuery, update: LabelUpdate): Promise<void> {
    const dbUpdate: DbModelUpdate<Domain.Label> = []

    const filter: DbModelFilter<Domain.Label> = [
      {
        column: 'workspace_id',
        value: this.workspace
      }
    ]

    if (query.docClass != null) {
      filter.push({
        column: 'domain',
        value: this.hierarchy.getDomain(query.docClass)
      })
    }

    if (query.docId != null) {
      filter.push({
        column: 'doc_id',
        value: query.docId
      })
    }

    if (query.labelId != null) {
      filter.push({
        column: 'label_id',
        value: query.labelId
      })
    }

    if (query.account != null) {
      filter.push({
        column: 'account',
        value: query.account
      })
    }

    // if (update.docClass != null) {
    //   dbUpdate.push({
    //     column: 'doc_class',
    //     value: update.docClass
    //   })
    // }

    if (dbUpdate.length === 0) return

    const { sql, values } = this.getUpdateSql(Domain.Label, filter, dbUpdate)

    await this.execute(sql, values, 'update labels')
  }

  async findLabels (params: FindLabelsParams): Promise<Label[]> {
    const select = `SELECT *
                    FROM ${Domain.Label} l`

    const { where, values } = this.buildWhere(params)

    const limit = this.buildLimit(params.limit)
    const orderBy = this.buildOrderBy(params.order, 'l.created')
    const sql = [select, where, orderBy, limit].join(' ')

    const result = await this.execute(sql, values, 'find labels')

    return result.map((it: any) => toLabel(it))
  }

  buildWhere (params: FindLabelsParams, startIndex: number = 0, prefix = 'l.'): { where: string, values: any[] } {
    const where: string[] = []
    const values: any[] = []
    let index = startIndex + 1

    where.push(`${prefix}workspace_id = $${index++}::uuid`)
    values.push(this.workspace)

    if (params.docClass != null) {
      const types = Array.isArray(params.docClass) ? params.docClass : [params.docClass]

      if (types.length === 1) {
        where.push(`${prefix}doc_class = $${index++}::varchar`)
        values.push(types[0])
      } else {
        where.push(`${prefix}doc_class = ANY($${index++}::varchar[])`)
        values.push(types)
      }
    }

    if (params.docId != null) {
      where.push(`${prefix}doc_id = $${index++}::varchar`)
      values.push(params.docId)
    }

    if (params.labelId != null) {
      const labels = Array.isArray(params.labelId) ? params.labelId : [params.labelId]
      if (labels.length === 1) {
        where.push(`${prefix}label_id = $${index++}::varchar`)
        values.push(labels[0])
      } else {
        where.push(`${prefix}label_id = ANY($${index++}::varchar[])`)
        values.push(labels)
      }
    }

    if (params.account != null) {
      where.push(`${prefix}account = $${index++}::uuid`)
      values.push(params.account)
    }

    return { where: `WHERE ${where.join(' AND ')}`, values }
  }
}
