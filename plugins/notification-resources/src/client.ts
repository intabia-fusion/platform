//
// Copyright © 2023 Hardcore Engineering Inc.
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
  type ReadState,
  type UnreadContext
} from '@hcengineering/notification'
import { addTxListener, createQuery, getClient, onClient } from '@hcengineering/presentation'
import { get, writable } from 'svelte/store'

export class NotificationClientImpl implements NotificationClient {
  protected static _instance: NotificationClientImpl | undefined = undefined

  readonly totalUnreadCount = writable<number>(0)

  readonly contextByDoc = writable<Map<Ref<Doc>, DocNotifyContext | null>>(new Map())
  readonly contextById = writable<Map<Ref<DocNotifyContext>, DocNotifyContext | null>>(new Map())
  readonly unreadByDoc = writable<Map<Ref<Doc>, UnreadContext>>(new Map())

  readonly readStateByDoc = writable<Map<Ref<Doc>, ReadState | null>>(new Map())

  readonly docSettingByDoc = writable<Map<Ref<Doc>, DocNotificationSetting | null>>(new Map())

  private readonly readStatePromises = new Map<Ref<Doc>, Promise<ReadState | undefined>>()
  private readonly docSettingPromises = new Map<Ref<Doc>, Promise<DocNotificationSetting | undefined>>()
  private readonly contextByIdPromises = new Map<Ref<DocNotifyContext>, Promise<DocNotifyContext | undefined>>()
  private readonly contextByDocPromises = new Map<Ref<Doc>, Promise<DocNotifyContext | undefined>>()

  // A list renders one component per row, each asking for its own context, so without this every
  // row would issue its own findAll. Requests made in the same tick are collected here and sent as
  // a single $in query.
  private pendingByDoc: Array<Ref<Doc>> = []
  private pendingByDocFlush: Promise<DocNotifyContext[]> | undefined = undefined
  private pendingById: Array<Ref<DocNotifyContext>> = []
  private pendingByIdFlush: Promise<DocNotifyContext[]> | undefined = undefined

  // Same coalescing as pendingByDoc/pendingById, for the per-doc ReadState/DocNotificationSetting lookups.
  private pendingReadState: Array<Ref<Doc>> = []
  private pendingReadStateFlush: Promise<Map<Ref<Doc>, ReadState>> | undefined = undefined
  private pendingDocSetting: Array<Ref<Doc>> = []
  private pendingDocSettingFlush: Promise<Map<Ref<Doc>, DocNotificationSetting>> | undefined = undefined

  public readonly clearingAllInbox = writable(false)
  public readonly readingAllInbox = writable(false)

  private readonly inboxUnreadQuery = createQuery(true)
  private readonly chatUnreadQuery = createQuery(true)
  private inboxUnread: UnreadContext[] = []
  private chatUnread: UnreadContext[] = []

  static createClient (): NotificationClientImpl {
    NotificationClientImpl._instance = new NotificationClientImpl()
    return NotificationClientImpl._instance
  }

  static getClient (): NotificationClientImpl {
    NotificationClientImpl._instance ??= new NotificationClientImpl()
    return NotificationClientImpl._instance
  }

  private constructor () {
    onClient(this.init.bind(this))
  }

  clear (): void {
    this.contextByDoc.set(new Map())
    this.contextById.set(new Map())
    this.readStateByDoc.set(new Map())
    this.docSettingByDoc.set(new Map())

    this.readStatePromises.clear()
    this.docSettingPromises.clear()
    this.contextByIdPromises.clear()
    this.contextByDocPromises.clear()

    this.pendingByDoc = []
    this.pendingById = []
    this.pendingReadState = []
    this.pendingDocSetting = []

    this.totalUnreadCount.set(0)
    this.inboxUnread = []
    this.chatUnread = []
    this.unreadByDoc.set(new Map())
  }

  private async init (_client: Client, account: Account): Promise<void> {
    this.clear()

    const projection = { objectId: 1, objectClass: 1, unreadCount: 1, unreadMessagesCount: 1, modifiedOn: 1 } as const
    this.inboxUnreadQuery.query(
      notification.class.DocNotifyContext,
      { user: account.uuid, unreadCount: { $gt: 0 } },
      (res) => {
        this.inboxUnread = res
        this.publishUnread()
      },
      { projection }
    )
    this.chatUnreadQuery.query(
      notification.class.DocNotifyContext,
      { user: account.uuid, unreadMessagesCount: { $gt: 0 } },
      (res) => {
        this.chatUnread = res
        this.publishUnread()
      },
      { projection }
    )
  }

  private publishUnread (): void {
    this.totalUnreadCount.set(this.inboxUnread.reduce((acc, it) => acc + it.unreadCount, 0))
    const byDoc = new Map<Ref<Doc>, UnreadContext>()
    for (const it of [...this.inboxUnread, ...this.chatUnread]) {
      byDoc.set(it.objectId, it)
    }
    this.unreadByDoc.set(byDoc)
  }

  async loadReadState (attachedTo: Ref<Doc>): Promise<void> {
    await this.ensureReadState(attachedTo)
  }

  async getReadState (attachedTo: Ref<Doc>): Promise<ReadState | undefined> {
    return await this.ensureReadState(attachedTo)
  }

  private async ensureReadState (attachedTo: Ref<Doc>): Promise<ReadState | undefined> {
    const current = get(this.readStateByDoc).get(attachedTo)
    if (current !== undefined && current !== null) {
      return current
    }
    const promise = this.readStatePromises.get(attachedTo)
    if (promise !== undefined) {
      return await promise
    }

    this.pendingReadState.push(attachedTo)

    this.pendingReadStateFlush ??= Promise.resolve().then(async () => {
      const ids = this.pendingReadState
      this.pendingReadState = []
      this.pendingReadStateFlush = undefined
      return await this.loadReadStates(ids)
    })

    const loadPromise = this.pendingReadStateFlush.then((map) => map.get(attachedTo))
    this.readStatePromises.set(attachedTo, loadPromise)
    try {
      return await loadPromise
    } finally {
      this.readStatePromises.delete(attachedTo)
    }
  }

  private async loadReadStates (ids: Array<Ref<Doc>>): Promise<Map<Ref<Doc>, ReadState>> {
    const client = getClient()
    const states = await client.findAll(notification.class.ReadState, { attachedTo: { $in: ids } })

    const statesByDoc = new Map<Ref<Doc>, ReadState>()
    for (const state of states) {
      statesByDoc.set(state.attachedTo, state)
    }

    this.readStateByDoc.update((map) => {
      for (const id of ids) {
        map.set(id, statesByDoc.get(id) ?? null)
      }
      return map
    })

    return statesByDoc
  }

  async loadDocSetting (attachedTo: Ref<Doc>): Promise<void> {
    await this.ensureDocSetting(attachedTo)
  }

  async getDocSetting (attachedTo: Ref<Doc>): Promise<DocNotificationSetting | undefined> {
    return await this.ensureDocSetting(attachedTo)
  }

  private async ensureDocSetting (attachedTo: Ref<Doc>): Promise<DocNotificationSetting | undefined> {
    const current = get(this.docSettingByDoc).get(attachedTo)
    if (current !== undefined && current !== null) {
      return current
    }
    const promise = this.docSettingPromises.get(attachedTo)
    if (promise !== undefined) {
      return await promise
    }

    this.pendingDocSetting.push(attachedTo)

    this.pendingDocSettingFlush ??= Promise.resolve().then(async () => {
      const ids = this.pendingDocSetting
      this.pendingDocSetting = []
      this.pendingDocSettingFlush = undefined
      return await this.loadDocSettings(ids)
    })

    const loadPromise = this.pendingDocSettingFlush.then((map) => map.get(attachedTo))
    this.docSettingPromises.set(attachedTo, loadPromise)
    try {
      return await loadPromise
    } finally {
      this.docSettingPromises.delete(attachedTo)
    }
  }

  private async loadDocSettings (ids: Array<Ref<Doc>>): Promise<Map<Ref<Doc>, DocNotificationSetting>> {
    const client = getClient()
    const settings = await client.findAll(notification.class.DocNotificationSetting, {
      attachedTo: { $in: ids },
      account: getCurrentAccount().uuid
    })

    const settingsByDoc = new Map<Ref<Doc>, DocNotificationSetting>()
    for (const setting of settings) {
      settingsByDoc.set(setting.attachedTo, setting)
    }

    this.docSettingByDoc.update((map) => {
      for (const id of ids) {
        map.set(id, settingsByDoc.get(id) ?? null)
      }
      return map
    })

    return settingsByDoc
  }

  public async loadContextById (_id: Ref<DocNotifyContext>): Promise<void> {
    await this.batchContextById(_id)
  }

  public async getContextById (_id: Ref<DocNotifyContext>): Promise<DocNotifyContext | undefined> {
    return await this.batchContextById(_id)
  }

  // Coalesces same-tick single-id requests into one ensureContextsById call.
  private async batchContextById (_id: Ref<DocNotifyContext>): Promise<DocNotifyContext | undefined> {
    const cached = get(this.contextById).get(_id)
    if (cached !== undefined) return cached ?? undefined

    this.pendingById.push(_id)

    this.pendingByIdFlush ??= Promise.resolve().then(async () => {
      const ids = this.pendingById
      this.pendingById = []
      this.pendingByIdFlush = undefined
      return await this.ensureContextsById(ids)
    })

    await this.pendingByIdFlush
    return get(this.contextById).get(_id) ?? undefined
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
    const promisesToWait: Array<Promise<DocNotifyContext | undefined>> = []
    const results: DocNotifyContext[] = []

    for (const id of ids) {
      const current = contextById.get(id)
      if (current !== undefined && current !== null) {
        results.push(current)
      } else {
        const promise = this.contextByIdPromises.get(id)
        if (promise !== undefined) {
          promisesToWait.push(promise)
        } else {
          toLoad.push(id)
        }
      }
    }

    if (toLoad.length > 0) {
      const loadPromise = (async () => {
        try {
          const client = getClient()
          const contexts = await client.findAll(notification.class.DocNotifyContext, {
            _id: { $in: toLoad },
            user: getCurrentAccount().uuid
          })

          const contextsMap = new Map<Ref<DocNotifyContext>, DocNotifyContext>()
          for (const ctx of contexts) {
            contextsMap.set(ctx._id, ctx)
          }

          this.contextById.update((state) => {
            for (const id of toLoad) {
              const ctx = contextsMap.get(id)
              state.set(id, ctx ?? null)
            }
            return state
          })

          this.contextByDoc.update((state) => {
            for (const ctx of contexts) {
              state.set(ctx.objectId, ctx)
            }
            return state
          })

          return contextsMap
        } finally {
          for (const id of toLoad) {
            this.contextByIdPromises.delete(id)
          }
        }
      })()

      for (const id of toLoad) {
        const idPromise = loadPromise.then((map) => map.get(id))
        this.contextByIdPromises.set(id, idPromise)
        promisesToWait.push(idPromise)
      }

      this.contextById.update((state) => {
        for (const id of toLoad) {
          state.set(id, null)
        }
        return state
      })
    }

    if (promisesToWait.length > 0) {
      const waited = await Promise.all(promisesToWait)
      for (const ctx of waited) {
        if (ctx !== undefined) {
          results.push(ctx)
        }
      }
    }

    return results
  }

  public async loadContextByDoc (doc?: Ref<Doc>): Promise<void> {
    if (doc == null) return
    await this.batchContextsByDoc([doc])
  }

  public async getContextByDoc (doc?: Ref<Doc>): Promise<DocNotifyContext | undefined> {
    if (doc == null) return undefined
    await this.batchContextsByDoc([doc])
    return get(this.contextByDoc).get(doc) ?? undefined
  }

  public async loadContextsByDoc (docs: Array<Ref<Doc>>): Promise<void> {
    await this.batchContextsByDoc(docs)
  }

  public async getContextsByDoc (docs: Array<Ref<Doc>>): Promise<DocNotifyContext[]> {
    await this.batchContextsByDoc(docs)
    const contextByDoc = get(this.contextByDoc)
    return docs.map((doc) => contextByDoc.get(doc)).filter((it): it is DocNotifyContext => it != null)
  }

  // Coalesces every request of the same tick, single or plural (one navigator section asks for all
  // of its docs at once, and several sections mount together), into one ensureContextsByDoc call.
  private async batchContextsByDoc (docs: Array<Ref<Doc>>): Promise<void> {
    const cached = get(this.contextByDoc)
    const missing = docs.filter((doc) => cached.get(doc) === undefined)
    if (missing.length === 0) return

    this.pendingByDoc.push(...missing)

    this.pendingByDocFlush ??= Promise.resolve().then(async () => {
      const pending = Array.from(new Set(this.pendingByDoc))
      this.pendingByDoc = []
      this.pendingByDocFlush = undefined
      return await this.ensureContextsByDoc(pending)
    })

    await this.pendingByDocFlush
  }

  private async ensureContextsByDoc (docs: Array<Ref<Doc>>): Promise<DocNotifyContext[]> {
    const contextByDoc = get(this.contextByDoc)
    const toLoad: Array<Ref<Doc>> = []
    const promisesToWait: Array<Promise<DocNotifyContext | undefined>> = []
    const results: DocNotifyContext[] = []

    for (const doc of docs) {
      const current = contextByDoc.get(doc)
      if (current !== undefined && current !== null) {
        results.push(current)
      } else {
        const promise = this.contextByDocPromises.get(doc)
        if (promise !== undefined) {
          promisesToWait.push(promise)
        } else {
          toLoad.push(doc)
        }
      }
    }

    if (toLoad.length > 0) {
      const loadPromise = (async () => {
        try {
          const client = getClient()
          const contexts = await client.findAll(notification.class.DocNotifyContext, {
            objectId: { $in: toLoad },
            user: getCurrentAccount().uuid
          })

          const contextsMap = new Map<Ref<Doc>, DocNotifyContext>()
          for (const ctx of contexts) {
            contextsMap.set(ctx.objectId, ctx)
          }

          this.contextById.update((state) => {
            for (const ctx of contexts) {
              state.set(ctx._id, ctx)
            }
            return state
          })

          this.contextByDoc.update((state) => {
            for (const doc of toLoad) {
              const ctx = contextsMap.get(doc)
              state.set(doc, ctx ?? null)
            }
            return state
          })

          return contextsMap
        } finally {
          for (const doc of toLoad) {
            this.contextByDocPromises.delete(doc)
          }
        }
      })()

      for (const doc of toLoad) {
        const docPromise = loadPromise.then((map) => map.get(doc))
        this.contextByDocPromises.set(doc, docPromise)
        promisesToWait.push(docPromise)
      }

      this.contextByDoc.update((state) => {
        for (const doc of toLoad) {
          state.set(doc, null)
        }
        return state
      })
    }

    if (promisesToWait.length > 0) {
      const waited = await Promise.all(promisesToWait)
      for (const ctx of waited) {
        if (ctx !== undefined) {
          results.push(ctx)
        }
      }
    }

    return results
  }

  async readDoc (_id: Ref<Doc>): Promise<void> {
    const me = getCurrentAccount()
    if (me.role === AccountRole.ReadOnlyGuest) return

    const client = getClient()
    const op = client.apply(undefined, 'readDoc', true)
    await this.readNotificationsWithoutMessage(_id, op)
    await this.forceReadDocState(_id, op)
    await op.commit()
  }

  async readNotificationsWithoutMessage (_id: Ref<Doc>, op?: TxOperations): Promise<void> {
    const me = getCurrentAccount()
    if (me.role === AccountRole.ReadOnlyGuest) return

    const client = getClient()
    const docNotifyContext = await this.getContextByDoc(_id)

    if (docNotifyContext == null) return

    const commonIds = docNotifyContext.unreadCommons.map((n) => n.id)
    const mentionIds = docNotifyContext.unreadMentions.map((n) => n.id)

    if (commonIds.length === 0 && mentionIds.length === 0) return

    await (op ?? client).createDoc(notification.class.ReadNotificationAction, docNotifyContext.space, {
      attachedTo: docNotifyContext.objectId,
      attachedToClass: docNotifyContext.objectClass,
      account: me.uuid,
      commonIds,
      mentionIds
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

    await this.forceReadDocState(doc._id)
  }

  public async forceReadDocState (attachedTo: Ref<Doc>, op?: TxOperations): Promise<boolean> {
    const me = getCurrentAccount()
    const state = await this.getReadState(attachedTo)
    if (state != null) {
      await (op ?? getClient()).update(state, {
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

    if (get(this.clearingAllInbox)) return

    try {
      this.clearingAllInbox.set(true)
      const contexts = await ops.findAll(
        notification.class.DocNotifyContext,
        {
          user: getCurrentAccount().uuid
        },
        { projection: { _id: 1, _class: 1, space: 1, objectId: 1 } }
      )
      for (const context of contexts) {
        await ops.removeDoc(context._class, context.space, context._id)
        await this.forceReadDocState(context.objectId, ops)
      }
      await ops.commit()
    } finally {
      this.clearingAllInbox.set(false)
    }
  }

  async readAll (): Promise<void> {
    const ops = getClient().apply(undefined, 'readAll', true)

    if (get(this.readingAllInbox) || get(this.clearingAllInbox)) return

    try {
      this.readingAllInbox.set(true)
      const contexts = await ops.findAll(
        notification.class.DocNotifyContext,
        {
          user: getCurrentAccount().uuid,
          unreadCount: { $gt: 0 }
        },
        {
          projection: {
            _id: 1,
            _class: 1,
            space: 1,
            objectId: 1,
            objectClass: 1,
            unreadReactions: 1,
            unreadCommons: 1,
            unreadMentions: 1
          }
        }
      )
      for (const context of contexts) {
        const reactionIds = context.unreadReactions?.map((n) => n.id) ?? []
        const commonIds = context.unreadCommons?.map((n) => n.id) ?? []
        const mentionIds = context.unreadMentions?.map((n) => n.id) ?? []

        if (reactionIds.length > 0 || commonIds.length > 0 || mentionIds.length > 0) {
          await ops.createDoc(notification.class.ReadNotificationAction, context.space, {
            attachedTo: context.objectId,
            attachedToClass: context.objectClass,
            account: getCurrentAccount().uuid,
            reactionIds,
            commonIds,
            mentionIds
          })
        }
        await this.forceReadDocState(context.objectId, ops)
      }
      await ops.commit()
    } finally {
      this.readingAllInbox.set(false)
    }
  }
}

addTxListener((txes: Tx[]) => {
  const notificationClient = NotificationClientImpl.getClient()

  for (const tx of txes) {
    switch (tx._class) {
      case core.class.TxCreateDoc: {
        const createTx = tx as TxCreateDoc<Doc>
        if (createTx.objectClass === notification.class.ReadState) {
          const state = TxProcessor.createDoc2Doc(createTx as TxCreateDoc<ReadState>)
          const current = get(notificationClient.readStateByDoc).get(state.attachedTo)
          if (current == null) {
            notificationClient.readStateByDoc.update((readStateByDoc) => {
              return readStateByDoc.set(state.attachedTo, state)
            })
          }
        } else if (createTx.objectClass === notification.class.DocNotificationSetting) {
          const setting = TxProcessor.createDoc2Doc(createTx as TxCreateDoc<DocNotificationSetting>)
          const current = get(notificationClient.docSettingByDoc).get(setting.attachedTo)
          if (current == null) {
            notificationClient.docSettingByDoc.update((docSettingsByDoc) => {
              return docSettingsByDoc.set(setting.attachedTo, setting)
            })
          }
        } else if (createTx.objectClass === notification.class.DocNotifyContext) {
          const context = TxProcessor.createDoc2Doc(createTx as TxCreateDoc<DocNotifyContext>)
          const current = get(notificationClient.contextByDoc).get(context.objectId)
          if (current == null) {
            notificationClient.contextById.update((state) => {
              return state.set(context._id, context)
            })
            notificationClient.contextByDoc.update((state) => {
              return state.set(context.objectId, context)
            })
          }
        }
        break
      }

      case core.class.TxUpdateDoc: {
        const updateTx = tx as TxUpdateDoc<Doc>
        if (updateTx.objectClass === notification.class.ReadState) {
          let attachedTo = updateTx.attachedTo
          if (attachedTo == null) {
            const state = Array.from(get(notificationClient.readStateByDoc).values())
              .filter(notEmpty)
              .find((it) => it._id === (updateTx.objectId as Ref<ReadState>))
            if (state != null) {
              attachedTo = state.attachedTo
            }
          }
          if (attachedTo != null) {
            const finalAttachedTo = attachedTo
            notificationClient.readStateByDoc.update((stateByDoc) => {
              const current = stateByDoc.get(finalAttachedTo)
              if (current == null) return stateByDoc

              return stateByDoc.set(
                finalAttachedTo,
                TxProcessor.updateDoc2Doc(current, updateTx as TxUpdateDoc<ReadState>)
              )
            })
          }
        } else if (updateTx.objectClass === notification.class.DocNotificationSetting) {
          let attachedTo = updateTx.attachedTo
          if (attachedTo == null) {
            const setting = Array.from(get(notificationClient.docSettingByDoc).values())
              .filter(notEmpty)
              .find((it) => it._id === (updateTx.objectId as Ref<DocNotificationSetting>))
            if (setting != null) {
              attachedTo = setting.attachedTo
            }
          }
          if (attachedTo != null) {
            const finalAttachedTo = attachedTo
            notificationClient.docSettingByDoc.update((stateByDoc) => {
              const current = stateByDoc.get(finalAttachedTo)
              if (current == null) return stateByDoc

              return stateByDoc.set(
                finalAttachedTo,
                TxProcessor.updateDoc2Doc(current, updateTx as TxUpdateDoc<DocNotificationSetting>)
              )
            })
          }
        } else if (updateTx.objectClass === notification.class.DocNotifyContext) {
          const contextId = updateTx.objectId as Ref<DocNotifyContext>
          const context = get(notificationClient.contextById).get(contextId)
          if (context != null) {
            const updated = TxProcessor.updateDoc2Doc(context, updateTx as TxUpdateDoc<DocNotifyContext>)

            notificationClient.contextById.update((state) => {
              return state.set(context._id, updated)
            })
            notificationClient.contextByDoc.update((state) => {
              return state.set(context.objectId, updated)
            })
          }
        }
        break
      }

      case core.class.TxRemoveDoc: {
        const removeTx = tx as TxRemoveDoc<Doc>
        if (removeTx.objectClass === notification.class.ReadState) {
          const stateById = new Map(
            Array.from(get(notificationClient.readStateByDoc).values())
              .filter(notEmpty)
              .map((it) => [it._id, it])
          )
          const state = stateById.get(removeTx.objectId as Ref<ReadState>)
          if (state != null) {
            notificationClient.readStateByDoc.update((stateByDoc) => {
              stateByDoc.delete(state.attachedTo)
              return stateByDoc
            })
          }
        } else if (removeTx.objectClass === notification.class.DocNotificationSetting) {
          const settingById = new Map(
            Array.from(get(notificationClient.docSettingByDoc).values())
              .filter(notEmpty)
              .map((it) => [it._id, it])
          )
          const state = settingById.get(removeTx.objectId as Ref<DocNotificationSetting>)
          if (state != null) {
            notificationClient.docSettingByDoc.update((settingByDoc) => {
              settingByDoc.delete(state.attachedTo)
              return settingByDoc
            })
          }
        } else if (removeTx.objectClass === notification.class.DocNotifyContext) {
          const contextId = removeTx.objectId as Ref<DocNotifyContext>
          const context = get(notificationClient.contextById).get(contextId)
          if (context != null) {
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
        break
      }
    }
  }
})
