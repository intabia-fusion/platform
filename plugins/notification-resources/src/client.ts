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
import { type ActivityMessage } from '@hcengineering/activity'
import core, {
  type Account,
  AccountRole,
  type Client,
  type Doc,
  generateId,
  getCurrentAccount,
  notEmpty,
  type Ref,
  type Tx,
  type TxCreateDoc,
  type TxOperations,
  TxProcessor,
  type TxRemoveDoc,
  type TxUpdateDoc
} from '@hcengineering/core'
import notification, {
  type DocNotificationSetting,
  type DocNotifyContext,
  type NotificationClient,
  type ReadState
} from '@hcengineering/notification'
import { addTxListener, createQuery, getClient, onClient } from '@hcengineering/presentation'
import { get, writable } from 'svelte/store'

export class NotificationClientImpl implements NotificationClient {
  protected static _instance: NotificationClientImpl | undefined = undefined

  readonly totalUnreadCount = writable<number>(0)

  readonly contextByDoc = writable<Map<Ref<Doc>, DocNotifyContext | null>>(new Map())
  readonly contextById = writable<Map<Ref<DocNotifyContext>, DocNotifyContext | null>>(new Map())

  readonly readStateByDoc = writable<Map<Ref<Doc>, ReadState | null>>(new Map())

  readonly docSettingByDoc = writable<Map<Ref<Doc>, DocNotificationSetting | null>>(new Map())

  readonly unreadQuery = createQuery(true)

  static createClient (): NotificationClientImpl {
    NotificationClientImpl._instance = new NotificationClientImpl()
    return NotificationClientImpl._instance
  }

  static getClient (): NotificationClientImpl {
    if (NotificationClientImpl._instance === undefined) {
      NotificationClientImpl._instance = new NotificationClientImpl()
    }
    return NotificationClientImpl._instance
  }

  private constructor () {
    onClient(this.init.bind(this))
  }

  private async init (_client: Client, account: Account): Promise<void> {
    this.unreadQuery.query(
      notification.class.DocNotifyContext,
      {
        user: account.uuid,
        archived: false,
        unreadCount: { $gt: 0 }
      },
      (res) => {
        this.totalUnreadCount.set(res.reduce((acc, curr) => acc + curr.unreadCount, 0))
      },
      {
        projection: { unreadCount: 1 }
      }
    )
  }

  async loadReadState (attachedTo: Ref<Doc>): Promise<void> {
    await this.ensureReadState(attachedTo)
  }

  async getReadState (attachedTo: Ref<Doc>): Promise<ReadState | undefined> {
    return await this.ensureReadState(attachedTo)
  }

  private async ensureReadState (attachedTo: Ref<Doc>): Promise<ReadState | undefined> {
    const current = get(this.readStateByDoc).get(attachedTo)
    if (current !== undefined) return current ?? undefined

    this.readStateByDoc.update((map) => map.set(attachedTo, null))

    const client = getClient()
    const state = await client.findOne(notification.class.ReadState, { attachedTo })

    this.readStateByDoc.update((map) => map.set(attachedTo, state ?? null))

    return state
  }

  async loadDocSetting (attachedTo: Ref<Doc>): Promise<void> {
    await this.ensureDocSetting(attachedTo)
  }

  async getDocSetting (attachedTo: Ref<Doc>): Promise<DocNotificationSetting | undefined> {
    return await this.ensureDocSetting(attachedTo)
  }

  private async ensureDocSetting (attachedTo: Ref<Doc>): Promise<DocNotificationSetting | undefined> {
    const current = get(this.docSettingByDoc).get(attachedTo)
    if (current !== undefined) return current ?? undefined

    this.docSettingByDoc.update((map) => map.set(attachedTo, null))

    const client = getClient()
    const state = await client.findOne(notification.class.DocNotificationSetting, {
      attachedTo,
      account: getCurrentAccount().uuid
    })

    this.docSettingByDoc.update((map) => map.set(attachedTo, state ?? null))

    return state
  }

  public async loadContextById (_id: Ref<DocNotifyContext>): Promise<void> {
    await this.ensureContextsById([_id])
  }

  public async getContextById (_id: Ref<DocNotifyContext>): Promise<DocNotifyContext | undefined> {
    return (await this.ensureContextsById([_id]))[0]
  }

  public async loadContextsById (ids: Array<Ref<DocNotifyContext>>): Promise<void> {
    await this.ensureContextsById(ids)
  }

  public async getContextsById (ids: Array<Ref<DocNotifyContext>>): Promise<DocNotifyContext[]> {
    return await this.ensureContextsById(ids)
  }

  private async ensureContextsById (ids: Array<Ref<DocNotifyContext>>): Promise<DocNotifyContext[]> {
    const contextById = get(this.contextById)

    const toLoad: Array<Ref<DocNotifyContext>> = []
    const resultMap = new Map<Ref<DocNotifyContext>, DocNotifyContext | null>()

    for (const id of ids) {
      const current = contextById.get(id)

      if (current !== undefined) {
        resultMap.set(id, current)
      } else {
        toLoad.push(id)
      }
    }

    if (toLoad.length > 0) {
      this.contextById.update((state) => {
        for (const _id of toLoad) {
          state.set(_id, null)
        }
        return state
      })

      const client = getClient()
      const contexts = await client.findAll(notification.class.DocNotifyContext, { _id: { $in: toLoad } })

      this.contextById.update((state) => {
        for (const ctx of contexts) {
          state.set(ctx._id, ctx)
          resultMap.set(ctx._id, ctx)
        }
        return state
      })

      this.contextByDoc.update((state) => {
        for (const ctx of contexts) {
          state.set(ctx.objectId, ctx)
        }
        return state
      })
    }

    return ids.map((id) => resultMap.get(id)).filter(notEmpty)
  }

  public async loadContextByDoc (doc?: Ref<Doc>): Promise<void> {
    if (doc == null) return
    await this.ensureContextsByDoc([doc])
  }

  public async getContextByDoc (doc?: Ref<Doc>): Promise<DocNotifyContext | undefined> {
    if (doc == null) return undefined
    return (await this.ensureContextsByDoc([doc]))[0]
  }

  public async loadContextsByDoc (doc: Array<Ref<Doc>>): Promise<void> {
    await this.ensureContextsByDoc(doc)
  }

  public async getContextsByDoc (doc: Array<Ref<Doc>>): Promise<DocNotifyContext[]> {
    return await this.ensureContextsByDoc(doc)
  }

  private async ensureContextsByDoc (docs: Array<Ref<Doc>>): Promise<DocNotifyContext[]> {
    const contextByDoc = get(this.contextByDoc)

    const toLoad: Array<Ref<Doc>> = []
    const resultMap = new Map<Ref<Doc>, DocNotifyContext | null>()

    for (const doc of docs) {
      const current = contextByDoc.get(doc)

      if (current !== undefined) {
        resultMap.set(doc, current)
      } else {
        toLoad.push(doc)
      }
    }

    if (toLoad.length > 0) {
      this.contextByDoc.update((state) => {
        for (const _id of toLoad) {
          state.set(_id, null)
        }
        return state
      })

      const client = getClient()
      const contexts = await client.findAll(notification.class.DocNotifyContext, { objectId: { $in: toLoad } })

      this.contextById.update((state) => {
        for (const ctx of contexts) {
          state.set(ctx._id, ctx)
        }
        return state
      })

      this.contextByDoc.update((state) => {
        for (const ctx of contexts) {
          state.set(ctx.objectId, ctx)
          resultMap.set(ctx.objectId, ctx)
        }
        return state
      })
    }

    return docs.map((doc) => resultMap.get(doc)).filter(notEmpty)
  }

  async readDoc (_id: Ref<Doc>): Promise<void> {
    const me = getCurrentAccount()
    if (me.role === AccountRole.ReadOnlyGuest) return

    const client = getClient()
    const op = client.apply(undefined, 'readDoc', true)

    await this.forceReadDocState(op, _id)
    await op.commit()
  }

  async readNotificationsWithoutMessage (_id: Ref<Doc>): Promise<void> {
    const me = getCurrentAccount()
    if (me.role === AccountRole.ReadOnlyGuest) return

    const client = getClient()
    const docNotifyContext = await this.getContextByDoc(_id)

    if (docNotifyContext == null) return
    if (
      docNotifyContext.unreadCommons.length === 0 &&
      !docNotifyContext.unreadMentions.some((it) => it.messageId == null)
    ) {
      return
    }

    await client.update(docNotifyContext, {
      $pull: {
        unreadCommons: { id: { $in: docNotifyContext.unreadCommons.map((n) => n.id) } },
        unreadMentions: {
          id: {
            $in: docNotifyContext.unreadMentions.filter((it) => it.messageId == null).map((n) => n.id)
          }
        }
      }
    })
  }

  async forceReadDoc (doc: Doc): Promise<void> {
    const context = await this.getContextByDoc(doc._id)

    if (context !== undefined) {
      await this.readDoc(doc._id)
      return
    }

    const client = getClient()

    const current = await client.findOne(core.class.Collaborator, {
      attachedTo: doc._id,
      collaborator: getCurrentAccount().uuid
    })

    if (current === undefined) {
      await client.addCollection(core.class.Collaborator, doc.space, doc._id, doc._class, 'collaborators', {
        collaborator: getCurrentAccount().uuid
      })
    }

    await this.forceReadDocState(client, doc._id)
  }

  private async forceReadDocState (client: TxOperations, attachedTo: Ref<Doc>): Promise<boolean> {
    const me = getCurrentAccount()
    const state = await this.getReadState(attachedTo)
    if (state != null) {
      await client.update(state, {
        [me.uuid]: {
          messageId: generateId<ActivityMessage>(),
          timestamp: Date.now()
        }
      })
      return true
    }
    return false
  }

  async clearAll (): Promise<void> {
    const ops = getClient().apply(undefined, 'clearNotifications', true)

    try {
      const contexts = await ops.findAll(
        notification.class.DocNotifyContext,
        {
          user: getCurrentAccount().uuid,
          archived: false
        },
        { projection: { _id: 1, _class: 1, space: 1 } }
      )
      for (const context of contexts) {
        await ops.removeDoc(context._class, context.space, context._id)
        await this.forceReadDocState(ops, context.objectId)
      }
    } finally {
      await ops.commit()
    }
  }

  async readAll (): Promise<void> {
    const ops = getClient().apply(undefined, 'readAll', true)

    try {
      const contexts = await ops.findAll(
        notification.class.DocNotifyContext,
        {
          user: getCurrentAccount().uuid,
          unread: true
        },
        { projection: { _id: 1, _class: 1, space: 1 } }
      )
      for (const context of contexts) {
        await ops.updateDoc(context._class, context.space, context._id, {
          unreadCommons: [],
          unreadMentions: [],
          unreadReactions: [],
          unreadMessages: [],
          unreadCount: 0
        })
        await this.forceReadDocState(ops, context.objectId)
      }
    } finally {
      await ops.commit()
    }
  }
}

addTxListener((txes: Tx[]) => {
  const notificationClient = NotificationClientImpl.getClient()

  for (const tx of txes) {
    if (tx._class === core.class.TxCreateDoc) {
      const createTx = tx as TxCreateDoc<Doc>
      if (createTx.objectClass === notification.class.ReadState) {
        const state = TxProcessor.createDoc2Doc(createTx as TxCreateDoc<ReadState>)
        const current = get(notificationClient.readStateByDoc).has(state.attachedTo)
        if (current == null) {
          notificationClient.readStateByDoc.update((readStateByDoc) => {
            return readStateByDoc.set(state.attachedTo, state)
          })
        }
      }

      if (createTx.objectClass === notification.class.DocNotificationSetting) {
        const setting = TxProcessor.createDoc2Doc(createTx as TxCreateDoc<DocNotificationSetting>)
        const current = get(notificationClient.docSettingByDoc).has(setting.attachedTo)
        if (current == null) {
          notificationClient.docSettingByDoc.update((docSettingsByDoc) => {
            return docSettingsByDoc.set(setting.attachedTo, setting)
          })
        }
      }

      if (createTx.objectClass === notification.class.DocNotifyContext) {
        const context = TxProcessor.createDoc2Doc(createTx as TxCreateDoc<DocNotifyContext>)
        const current = get(notificationClient.contextById).has(context._id)
        if (current == null) {
          notificationClient.contextById.update((state) => {
            return state.set(context._id, context)
          })
          notificationClient.contextByDoc.update((state) => {
            return state.set(context.objectId, context)
          })
        }
      }
    }

    if (tx._class === core.class.TxUpdateDoc) {
      const updateTx = tx as TxUpdateDoc<Doc>
      if (updateTx.objectClass === notification.class.ReadState) {
        if (updateTx.attachedTo == null) continue
        const attachedTo = updateTx.attachedTo
        notificationClient.readStateByDoc.update((stateByDoc) => {
          const current = stateByDoc.get(attachedTo)
          if (current == null) return stateByDoc

          return stateByDoc.set(attachedTo, TxProcessor.updateDoc2Doc(current, updateTx as TxUpdateDoc<ReadState>))
        })
      }

      if (updateTx.objectClass === notification.class.DocNotificationSetting) {
        if (updateTx.attachedTo == null) continue
        const attachedTo = updateTx.attachedTo
        notificationClient.docSettingByDoc.update((stateByDoc) => {
          const current = stateByDoc.get(attachedTo)
          if (current == null) return stateByDoc

          return stateByDoc.set(
            attachedTo,
            TxProcessor.updateDoc2Doc(current, updateTx as TxUpdateDoc<DocNotificationSetting>)
          )
        })
      }

      if (updateTx.objectClass === notification.class.DocNotifyContext) {
        const contextId = updateTx.objectId as Ref<DocNotifyContext>
        const context = get(notificationClient.contextById).get(contextId)
        if (context == null) continue
        notificationClient.contextById.update((state) => {
          return state.set(context._id, TxProcessor.updateDoc2Doc(context, updateTx as TxUpdateDoc<DocNotifyContext>))
        })
        notificationClient.contextByDoc.update((state) => {
          return state.set(
            context.objectId,
            TxProcessor.updateDoc2Doc(context, updateTx as TxUpdateDoc<DocNotifyContext>)
          )
        })
      }
    }

    if (tx._class === core.class.TxRemoveDoc) {
      const removeTx = tx as TxRemoveDoc<Doc>
      if (removeTx.objectClass === notification.class.ReadState) {
        const stateById = new Map(
          Array.from(get(notificationClient.readStateByDoc).values())
            .filter(notEmpty)
            .map((it) => [it._id, it])
        )
        const state = stateById.get(removeTx.objectId as Ref<ReadState>)
        if (state == null) continue
        notificationClient.readStateByDoc.update((stateByDoc) => {
          stateByDoc.delete(state.attachedTo)
          return stateByDoc
        })
      }

      if (removeTx.objectClass === notification.class.DocNotificationSetting) {
        const settingById = new Map(
          Array.from(get(notificationClient.docSettingByDoc).values())
            .filter(notEmpty)
            .map((it) => [it._id, it])
        )
        const state = settingById.get(removeTx.objectId as Ref<DocNotificationSetting>)
        if (state == null) continue
        notificationClient.docSettingByDoc.update((settingByDoc) => {
          settingByDoc.delete(state.attachedTo)
          return settingByDoc
        })
      }

      if (removeTx.objectClass === notification.class.DocNotifyContext) {
        const contextId = removeTx.objectId as Ref<DocNotifyContext>
        const context = get(notificationClient.contextById).get(contextId)
        if (context == null) continue
        notificationClient.contextById.update((state) => {
          state.delete(context._id)
          return state
        })
        notificationClient.contextByDoc.update((state) => {
          state.delete(context.objectId)
          return state
        })
      }
    }
  }
})
