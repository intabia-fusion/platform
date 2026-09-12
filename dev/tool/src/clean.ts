//
// Copyright © 2023 Hardcore Engineering Inc.
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
/* eslint-disable @typescript-eslint/no-unused-vars */
import { getAccountDB } from '@hcengineering/account'
import calendar from '@hcengineering/calendar'
import chunter, { type ChatMessage } from '@hcengineering/chunter'
import { loadCollabYdoc, saveCollabYdoc, yDocToBuffer } from '@hcengineering/collaboration'
import contact from '@hcengineering/contact'
import core, {
  type ArrOf,
  type BackupClient,
  type Class,
  ClassifierKind,
  type CollaborativeDoc,
  type Client as CoreClient,
  DOMAIN_BENCHMARK,
  DOMAIN_MIGRATION,
  DOMAIN_MODEL,
  DOMAIN_STATUS,
  DOMAIN_TX,
  type Doc,
  type DocumentUpdate,
  type Domain,
  type Hierarchy,
  type Markup,
  type MeasureContext,
  type MigrationState,
  type Ref,
  type RefTo,
  type RelatedDocument,
  SortingOrder,
  type Status,
  type StatusCategory,
  type Tx,
  type TxCUD,
  type TxCreateDoc,
  type TxMixin,
  TxOperations,
  TxProcessor,
  type TxRemoveDoc,
  type TxUpdateDoc,
  type WorkspaceUuid,
  type WorkspaceDataId,
  type WorkspaceIds,
  generateId,
  getObjectValue,
  toIdMap,
  updateAttribute,
  platformNow,
  platformNowDiff
} from '@hcengineering/core'
import activity, { DOMAIN_ACTIVITY } from '@hcengineering/model-activity'
import { DOMAIN_SPACE } from '@hcengineering/model-core'
import recruitModel, { defaultApplicantStatuses } from '@hcengineering/model-recruit'
import recruit, { type Applicant, type Vacancy } from '@hcengineering/recruit'
import { getTransactorEndpoint } from '@hcengineering/server-client'
import { type StorageAdapter } from '@hcengineering/server-core'
import { generateToken } from '@hcengineering/server-token'
import { connect } from '@hcengineering/server-tool'
import tags, { type TagCategory, type TagElement, type TagReference } from '@hcengineering/tags'
import task, { type ProjectType, type Task, type TaskType } from '@hcengineering/task'
import tracker from '@hcengineering/tracker'
import { deepEqual } from 'fast-equals'
import { type Db } from 'mongodb'

export async function fixMinioBW (
  ctx: MeasureContext,
  wsIds: WorkspaceIds,
  storageService: StorageAdapter
): Promise<void> {
  console.log('try clean bw miniature for ', wsIds)
  const from = new Date(new Date().setDate(new Date().getDate() - 7)).getTime()
  const list = await storageService.listStream(ctx, wsIds)
  let removed = 0
  try {
    while (true) {
      const objs = await list.next()
      if (objs.length === 0) {
        break
      }
      for (const obj of objs) {
        if (obj.modifiedOn < from) continue
        if ((obj._id as string).includes('%preview%')) {
          await storageService.remove(ctx, wsIds, [obj._id])
          removed++
          if (removed % 100 === 0) {
            console.log('removed: ', removed)
          }
        }
      }
    }
  } finally {
    await list.close()
  }
  console.log('FINISH, removed: ', removed)
}

export async function cleanRemovedTransactions (workspaceId: WorkspaceUuid, transactorUrl: string): Promise<void> {
  const connection = (await connect(transactorUrl, workspaceId, undefined, {
    mode: 'backup'
  })) as unknown as CoreClient & BackupClient
  try {
    let count = 0
    while (true) {
      const removedDocs = await connection.findAll(core.class.TxRemoveDoc, {}, { limit: 1000 })
      if (removedDocs.length === 0) {
        break
      }

      const toRemove = await connection.findAll(core.class.TxCUD, {
        objectId: { $in: removedDocs.map((it) => it.objectId) }
      })
      await connection.clean(
        DOMAIN_TX,
        toRemove.map((it) => it._id)
      )

      count += toRemove.length
      console.log('processed', count)
    }

    console.log('total docs with remove', count)
  } catch (err: any) {
    console.trace(err)
  } finally {
    await connection.close()
  }
}

export async function optimizeModel (workspaceId: WorkspaceUuid, transactorUrl: string): Promise<void> {
  const connection = (await connect(transactorUrl, workspaceId, undefined, {
    mode: 'backup',
    model: 'upgrade'
  })) as unknown as CoreClient & BackupClient
  try {
    let count = 0

    const model = connection.getModel()

    const updateTransactions = await connection.findAll(
      core.class.TxUpdateDoc,
      {
        objectSpace: core.space.Model,
        _class: core.class.TxUpdateDoc
      },
      { sort: { _id: SortingOrder.Ascending, modifiedOn: SortingOrder.Ascending }, limit: 5000 }
    )

    const toRemove: Ref<Doc>[] = []

    let i = 0
    for (const tx of updateTransactions) {
      try {
        const doc = model.findObject(tx.objectId)
        if (doc === undefined) {
          // Document is removed, we could remove update transaction at all
          toRemove.push(tx._id)
          console.log('marking update tx to remove', tx)
          continue
        }
        const opt: any = { ...tx.operations }
        const adoc = doc as any

        let uDoc: any = {}

        // Find next update operations for same doc
        for (const ops of updateTransactions.slice(i + 1).filter((it) => it.objectId === tx.objectId)) {
          uDoc = { ...uDoc, ...ops.operations }
        }

        for (const [k, v] of Object.entries(opt)) {
          // If value is same as in document or we have more transactions with same value updated.
          if (!k.startsWith('$') && (!deepEqual(adoc[k], v) || uDoc[k] !== undefined)) {
            // Current value is not we modify
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
            delete opt[k]
          }
        }
        if (Object.keys(opt).length === 0) {
          // No operations pending, remove update tx.
          toRemove.push(tx._id)
          console.log('marking update tx to remove, since not real update is performed', tx)
        }
      } finally {
        i++
      }
    }

    await connection.clean(DOMAIN_TX, toRemove)

    count += toRemove.length
    console.log('processed', count)

    console.log('total docs with remove', count)
  } catch (err: any) {
    console.trace(err)
  } finally {
    await connection.close()
  }
}
export async function cleanArchivedSpaces (workspaceId: WorkspaceUuid, transactorUrl: string): Promise<void> {
  const connection = (await connect(transactorUrl, workspaceId, undefined, {
    mode: 'backup'
  })) as unknown as CoreClient & BackupClient
  try {
    const count = 0
    const ops = new TxOperations(connection, core.account.System)
    while (true) {
      const spaces = await connection.findAll(core.class.Space, { archived: true }, { limit: 1000 })
      if (spaces.length === 0) {
        break
      }

      const h = connection.getHierarchy()
      const withDomain = h
        .getDescendants(core.class.Doc)
        .filter((it) => h.findDomain(it) !== undefined)
        .filter((it) => !h.isMixin(it))
      for (const c of withDomain) {
        while (true) {
          const docs = await connection.findAll(c, { space: { $in: spaces.map((it) => it._id) } })
          if (docs.length === 0) {
            break
          }
          console.log('removing:', c, docs.length)
          for (const d of docs) {
            await ops.remove(d)
          }
        }
      }
      for (const s of spaces) {
        await ops.remove(s)
      }
    }

    console.log('total docs with remove', count)
  } catch (err: any) {
    console.trace(err)
  } finally {
    await connection.close()
  }
}

export async function fixCommentDoubleIdCreate (workspaceId: WorkspaceUuid, transactorUrl: string): Promise<void> {
  const connection = (await connect(transactorUrl, workspaceId, undefined, {
    mode: 'backup'
  })) as unknown as CoreClient & BackupClient
  try {
    const commentTxes = await connection.findAll(core.class.TxCreateDoc, {
      objectClass: chunter.class.ChatMessage
    })
    const commentTxesRemoved = await connection.findAll(core.class.TxRemoveDoc, {
      objectClass: chunter.class.ChatMessage
    })
    const removed = new Map(commentTxesRemoved.map((it) => [it.objectId, it]))
    // Do not checked removed
    const objSet = new Set<Ref<Doc>>()
    const oldValue = new Map<Ref<Doc>, string>()
    for (const c of commentTxes) {
      const cid = c.objectId
      if (removed.has(cid)) {
        continue
      }
      const has = objSet.has(cid)
      objSet.add(cid)
      if (has) {
        // Rename duplicate entries.
        const doc = TxProcessor.createDoc2Doc<ChatMessage>(c as unknown as TxCreateDoc<ChatMessage>)
        if (doc.message !== '' && doc.message.trim() !== '<p></p>') {
          await connection.clean(DOMAIN_TX, [c._id])
          if (oldValue.get(cid) === doc.message.trim()) {
            console.log('delete tx', cid, doc.message)
          } else {
            oldValue.set(doc._id, doc.message)
            console.log('renaming', cid, doc.message)
            // Remove previous transaction.
            c.objectId = generateId()
            doc._id = c.objectId as Ref<ChatMessage>
            await connection.upload(DOMAIN_TX, [c])
            // Also we need to create snapsot
            await connection.upload(DOMAIN_ACTIVITY, [doc])
          }
        }
      }
    }
  } catch (err: any) {
    console.trace(err)
  } finally {
    await connection.close()
  }
}

const DOMAIN_TAGS = 'tags' as Domain

function groupBy<T extends Doc> (docs: T[], key: string): Record<any, T[]> {
  return docs.reduce((storage: Record<string, T[]>, item: T) => {
    const group = getObjectValue(key, item) ?? undefined

    storage[group] = storage[group] ?? []
    storage[group].push(item)

    return storage
  }, {})
}

export async function removeDuplicateIds (
  ctx: MeasureContext,
  mongodbUri: string,
  storageAdapter: StorageAdapter,
  accountsUrl: string,
  initWorkspacesStr: string
): Promise<void> {
  // TODO: FIXME
  throw new Error('Not implemented')






  //     const check = await db.collection(DOMAIN_MIGRATION).findOne({ state, plugin: { $in: plugins } })
  //     if (check != null) continue

}







//     // blobs









