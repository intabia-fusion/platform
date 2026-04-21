//
// Copyright © 2026 Intabia Fusion Inc.
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

import core, {
  AccountUuid,
  Class,
  Doc,
  Hierarchy,
  MeasureContext,
  ModelDb,
  PersonId,
  Ref,
  systemAccountUuid,
  Tx,
  TxCreateDoc,
  TxCUD,
  TxProcessor,
  TxRemoveDoc,
  TxUpdateDoc,
  WorkspaceUuid
} from '@hcengineering/core'
import activity from '@hcengineering/activity'
import { generateToken } from '@hcengineering/server-token'
import { createRestClient } from '@hcengineering/api-client'
import { StorageAdapter } from '@hcengineering/storage'
import notification, { InboxNotification, TxNotificationType } from '@hcengineering/notification'
import { buildStorageFromConfig, storageConfigFrom } from '@hcengineering/server-storage'
import pulse, { WorkspacesNotification } from '@hcengineering/pulse'
import { QueueUserEvent, QueueUserMessage } from '@hcengineering/server-core'
import { getAccountClient } from '@hcengineering/server-client'
import { PersonSpace } from '@hcengineering/contact'

import Workspace from './workspace'
import {
  getTransactorApiEndpoint,
  getUserWorkspaces,
  getWorkspaceInfo,
  isTxTrigger,
  MAX_NOTIFICATION_TYPE_PRIORITY
} from './utils'
import config from './config'

export class Worker {
  private readonly sysHierarchy = new Hierarchy()
  private readonly sysModel = new ModelDb(this.sysHierarchy)

  private readonly workspaces = new Map<WorkspaceUuid, Workspace>()

  private readonly txTypes: TxNotificationType[] = []
  private readonly triggerClasses: Ref<Class<Doc>>[]

  private readonly storage: StorageAdapter

  private readonly interval: NodeJS.Timeout | undefined = undefined
  private readonly lazyInitInterval: NodeJS.Timeout | undefined = undefined
  private readonly lazyInitSet = new Set<AccountUuid>()

  private readonly userNotifyStatusMap = new Map<AccountUuid, Record<WorkspaceUuid, boolean>>()
  private readonly userMetaCache = new Map<
  AccountUuid,
  Map<WorkspaceUuid, { socialId: PersonId, spaceId: Ref<PersonSpace> }>
  >()

  private readonly userWorkspacesCache = new Map<AccountUuid, WorkspaceUuid[]>()
  private readonly userLastActivity = new Map<AccountUuid, number>()

  private readonly userUpdateTimers = new Map<AccountUuid, NodeJS.Timeout>()
  private readonly pendingWorkspaces = new Map<WorkspaceUuid, Promise<Workspace | undefined>>()
  private readonly connectedUsers = new Map<AccountUuid, Set<WorkspaceUuid>>()
  private readonly initPromises = new Map<AccountUuid, Promise<void>>()

  constructor (
    private readonly ctx: MeasureContext,
    private readonly modelTxes: Tx[]
  ) {
    for (const tx of modelTxes) {
      this.sysHierarchy.tx(tx)
    }
    this.sysModel.addTxes(ctx, modelTxes, true)

    this.storage = buildStorageFromConfig(storageConfigFrom(config.StorageConfig))
    this.txTypes = this.sysModel
      .findAllSync(notification.class.TxNotificationType, {})
      .sort((a, b) => (a.priority ?? MAX_NOTIFICATION_TYPE_PRIORITY) - (b.priority ?? MAX_NOTIFICATION_TYPE_PRIORITY))
    this.triggerClasses = [
      notification.class.ReadState,
      activity.class.ActivityMessage,
      ...this.txTypes.map((it) => it.objectClass)
    ].filter((it) => it !== core.class.Doc)

    this.interval = setInterval(
      () => {
        const now = Date.now()
        for (const [uuid, workspace] of this.workspaces.entries()) {
          if (workspace.isInProgress()) continue
          const time = workspace.getLastTxDate() ?? 0
          const diff = now - time
          if (diff < 5 * 60 * 1000) continue
          void workspace.close()
          this.workspaces.delete(uuid)
        }

        const userInactivityLimit = 20 * 60 * 1000 // 20 minutes
        for (const [user, lastTime] of this.userLastActivity.entries()) {
          if (now - lastTime > userInactivityLimit) {
            this.lazyInitSet.delete(user)
            this.userNotifyStatusMap.delete(user)
            this.userWorkspacesCache.delete(user)
            this.userMetaCache.delete(user)
            this.userLastActivity.delete(user)
            this.connectedUsers.delete(user)
          }
        }
      },
      5 * 60 * 1000 // 5 minutes
    )

    this.lazyInitInterval = setInterval(() => {
      if (this.lazyInitSet.size === 0) return
      const users = Array.from(this.lazyInitSet).slice(0, 10)
      for (const user of users) {
        this.lazyInitSet.delete(user)
        const ws = this.connectedUsers.get(user) ?? new Set()
        if (ws.size > 0) {
          void this.initNotifyStatus(ctx, ws, user).catch(console.error)
        }
      }
    }, 1000)
  }

  // Initializing connected user during service startup
  public async syncSessions (): Promise<void> {
    const endpoints = config.TransactorEndpoints
    const token = generateToken(systemAccountUuid, undefined, { service: config.ServiceId })
    for (const endpoint of endpoints) {
      try {
        const client = createRestClient(endpoint, '', token)
        const users = await client.getSessions()
        for (const [_account, workspaces] of Object.entries(users)) {
          const account = _account as AccountUuid
          const current = this.connectedUsers.get(account) ?? new Set()
          for (const wsUuid of workspaces) {
            current.add(wsUuid)
          }

          this.userLastActivity.set(account, Date.now())
          if (!this.userNotifyStatusMap.has(account)) {
            this.lazyInitSet.add(account)
          }
        }
      } catch (e) {
        this.ctx.error(`Failed to fetch sessions from transactor ${endpoint}`, { e, endpoint })
      }
    }
  }

  async tx (ctx: MeasureContext, ws: WorkspaceUuid, _tx: Tx): Promise<void> {
    if (!TxProcessor.isExtendsCUD(_tx._class)) return

    const tx = _tx as TxCUD<Doc>

    if (this.sysHierarchy.isDerived(tx.objectClass, notification.class.InboxNotification)) {
      await this.updateUserNotifyStatus(ctx, ws, tx as TxCUD<InboxNotification>)
    }

    const exists = this.workspaces.get(ws)

    if (exists !== undefined) {
      await exists.tx(tx)
      return
    }

    if (!isTxTrigger(this.sysHierarchy, tx, this.triggerClasses, this.txTypes)) {
      return
    }

    const workspace = await this.getWorkspaceClient(ctx, ws)

    if (workspace != null) {
      await workspace.tx(tx)
    }
  }

  async user (ctx: MeasureContext, ws: WorkspaceUuid, message: QueueUserMessage): Promise<void> {
    if (message.type === QueueUserEvent.login) {
      let connectedWorkspaces = this.connectedUsers.get(message.user)
      if (connectedWorkspaces === undefined) {
        connectedWorkspaces = new Set()
        this.connectedUsers.set(message.user, connectedWorkspaces)
      }
      connectedWorkspaces.add(ws)

      this.userLastActivity.set(message.user, Date.now())
      if (!this.userNotifyStatusMap.has(message.user)) {
        this.lazyInitSet.add(message.user)
      } else {
        this.scheduleUserNotifyStatusUpdate(ctx, message.user)
      }
    } else if (message.type === QueueUserEvent.logout) {
      this.connectedUsers.get(message.user)?.delete(ws)
    }
  }

  private async ensureNotifyStatusInitialized (
    ctx: MeasureContext,
    wsUuid: WorkspaceUuid,
    user: AccountUuid
  ): Promise<void> {
    if (this.lazyInitSet.has(user)) {
      this.lazyInitSet.delete(user)
    }
    if (!this.userNotifyStatusMap.has(user)) {
      await this.initNotifyStatus(ctx, new Set([wsUuid]), user)
    }
  }

  private async initNotifyStatus (
    ctx: MeasureContext,
    targetWorkspaces: Set<WorkspaceUuid>,
    user: AccountUuid
  ): Promise<void> {
    let promise = this.initPromises.get(user)
    if (promise != null) {
      await promise
      return
    }

    promise = this._initNotifyStatus(ctx, targetWorkspaces, user)
    this.initPromises.set(user, promise)
    try {
      await promise
    } finally {
      this.initPromises.delete(user)
    }
  }

  private async _initNotifyStatus (
    ctx: MeasureContext,
    targetWorkspaces: Set<WorkspaceUuid>,
    user: AccountUuid
  ): Promise<void> {
    if (targetWorkspaces.size === 0) return

    const workspaces = await this.getUserWorkspacesCached(user, targetWorkspaces)
    if (workspaces.length === 0) return
    if (workspaces.length === 1 && targetWorkspaces.has(workspaces[0])) return

    const notifyStatus: Record<WorkspaceUuid, boolean> = {}
    for (const _wsUuid of workspaces) {
      try {
        const wsClient = await this.getWorkspaceClient(ctx, _wsUuid)
        if (wsClient == null) continue

        const unread = await wsClient.client.findOne(
          notification.class.InboxNotification,
          {
            user,
            isViewed: false,
            archived: false
          },
          { limit: 1 }
        )

        notifyStatus[_wsUuid] = unread != null
      } catch (e) {
        console.error(e)
      }
    }

    this.userNotifyStatusMap.set(user, notifyStatus)

    const res: Record<
    WorkspaceUuid,
    {
      wsClient: Workspace
      tx: TxCreateDoc<WorkspacesNotification>
    }
    > = {}

    for (const wsUuid of targetWorkspaces) {
      if (workspaces.length === 1 && workspaces[0] === wsUuid) continue

      const userMeta = await this.getCachedUserMeta(ctx, user, wsUuid)
      if (userMeta === undefined) continue

      const connectedWsClient = await this.getWorkspaceClient(ctx, wsUuid)
      if (connectedWsClient == null) continue

      res[wsUuid] = {
        wsClient: connectedWsClient,
        tx: connectedWsClient.client.txFactory.createTxCreateDoc<WorkspacesNotification>(
          pulse.class.WorkspacesNotification,
          userMeta.spaceId as any,
          {
            account: user,
            ...notifyStatus
          },
          undefined,
          undefined,
          userMeta.socialId as any
        )
      }
    }

    await Promise.allSettled(
      Object.entries(res).map(async ([wsId, { tx, wsClient }]) => {
        try {
          await wsClient.client.apply(tx)
        } catch (e) {
          ctx.error(`Failed to apply init notification status to workspace ${wsId} for user ${user}`, { e })
        }
      })
    )
  }

  private async getUserWorkspacesCached (
    user: AccountUuid,
    targetWorkspaces = new Set<WorkspaceUuid>()
  ): Promise<WorkspaceUuid[]> {
    const cached = this.userWorkspacesCache.get(user)

    if (cached != null) {
      const cachedSet = new Set(cached)

      const hasAllTargets = [...targetWorkspaces].every((target) => cachedSet.has(target))
      if (hasAllTargets) return cached

      this.userWorkspacesCache.delete(user)
    }

    const workspaces = await getUserWorkspaces(user)
    const uuids = workspaces.map((w) => w.uuid)

    this.userWorkspacesCache.set(user, uuids)

    return uuids
  }

  private scheduleUserNotifyStatusUpdate (ctx: MeasureContext, user: AccountUuid): void {
    const userConnected = this.connectedUsers.get(user)
    if (userConnected === undefined || userConnected.size === 0) return

    const existing = this.userUpdateTimers.get(user)
    if (existing !== undefined) {
      clearTimeout(existing)
    }

    const timer = setTimeout(() => {
      this.userUpdateTimers.delete(user)
      this.applyWorkspaceNotifyStatus(ctx, user).catch((e) => {
        console.error(`Failed to apply debounced notification status for user ${user}`, e)
      })
    }, 1000)

    this.userUpdateTimers.set(user, timer)
  }

  private async getCachedUserMeta (
    ctx: MeasureContext,
    user: AccountUuid,
    wsUuid: WorkspaceUuid
  ): Promise<{ socialId: PersonId, spaceId: Ref<PersonSpace> } | undefined> {
    let userCache = this.userMetaCache.get(user)
    if (userCache === undefined) {
      userCache = new Map()
      this.userMetaCache.set(user, userCache)
    }

    const cached = userCache.get(wsUuid)
    if (cached !== undefined) return cached

    try {
      const wsClient = await this.getWorkspaceClient(ctx, wsUuid)
      if (wsClient == null) return undefined

      const token = generateToken(user, wsUuid)
      const socialIds = await getAccountClient(token).getSocialIds(false)
      const space = (await wsClient.cache.getPersonSpaces([user]))[0]

      if (socialIds.length > 0 && space != null) {
        const data = { socialId: socialIds[0]._id, spaceId: space._id }
        userCache.set(wsUuid, data)
        return data
      }
    } catch (e) {
      console.error(`Failed to get cached data for user ${user} in workspace ${wsUuid}`, e)
    }

    return undefined
  }

  private async updateUserNotifyStatus (
    ctx: MeasureContext,
    wsUuid: WorkspaceUuid,
    _tx: TxCUD<InboxNotification>
  ): Promise<void> {
    if (_tx._class === core.class.TxCreateDoc) {
      const tx = _tx as TxCreateDoc<InboxNotification>
      const notification = TxProcessor.createDoc2Doc(tx)
      const user = notification.user
      this.userLastActivity.set(user, Date.now())
      await this.ensureNotifyStatusInitialized(ctx, wsUuid, user)

      const current = this.userNotifyStatusMap.get(user)
      if (current?.[wsUuid] === true) return

      const workspaces = await this.getUserWorkspacesCached(user, new Set([wsUuid]))
      if (workspaces.length === 0) return
      if (workspaces.length === 1 && workspaces[0] === wsUuid) return

      const notifyStatus = current ?? {}
      notifyStatus[wsUuid] = true
      this.userNotifyStatusMap.set(user, notifyStatus)

      this.scheduleUserNotifyStatusUpdate(ctx, user)
    } else if (_tx._class === core.class.TxRemoveDoc) {
      const tx = _tx as TxRemoveDoc<InboxNotification>
      const wsClient = await this.getWorkspaceClient(ctx, wsUuid)
      if (wsClient == null) return

      const space = await wsClient.cache.findPersonSpace(tx.objectSpace as Ref<PersonSpace>)
      const user = space?.account
      if (user == null) return

      this.userLastActivity.set(user, Date.now())
      await this.ensureNotifyStatusInitialized(ctx, wsUuid, user)

      const current = this.userNotifyStatusMap.get(user)
      if (current?.[wsUuid] !== true) return

      const workspaces = await this.getUserWorkspacesCached(user, new Set([wsUuid]))
      if (workspaces.length === 0) return
      if (workspaces.length === 1 && workspaces[0] === wsUuid) return

      const unread = await wsClient.client.findOne(
        notification.class.InboxNotification,
        {
          user,
          isViewed: false,
          archived: false
        },
        { limit: 1 }
      )
      const notify = unread != null

      const notifyStatus = current ?? {}
      if (notifyStatus[wsUuid] === notify) return

      notifyStatus[wsUuid] = notify
      this.userNotifyStatusMap.set(user, notifyStatus)

      this.scheduleUserNotifyStatusUpdate(ctx, user)
    } else if (_tx._class === core.class.TxUpdateDoc) {
      const tx = _tx as TxUpdateDoc<InboxNotification>
      if (tx.operations.isViewed == null) return

      const ws = await this.getWorkspaceClient(ctx, wsUuid)
      if (ws == null) return

      const n = await ws.client.findOne(notification.class.InboxNotification, { _id: tx.objectId })
      if (n == null) return

      const user = n.user
      this.userLastActivity.set(user, Date.now())
      await this.ensureNotifyStatusInitialized(ctx, wsUuid, user)

      const workspaces = await this.getUserWorkspacesCached(user, new Set([wsUuid]))
      if (workspaces.length === 0) return
      if (workspaces.length === 1 && workspaces[0] === wsUuid) return

      const current = this.userNotifyStatusMap.get(user)
      const isNotified = current?.[wsUuid] === true

      if (isNotified && !tx.operations.isViewed) return
      if (!isNotified && tx.operations.isViewed) return

      const unread = await ws.client.findOne(
        notification.class.InboxNotification,
        {
          user: n.user,
          isViewed: false,
          archived: false
        },
        { limit: 1 }
      )
      const notify = unread != null
      const notifyStatus = current ?? {}
      notifyStatus[wsUuid] = notify
      this.userNotifyStatusMap.set(user, notifyStatus)

      this.scheduleUserNotifyStatusUpdate(ctx, user)
    }
  }

  private async applyWorkspaceNotifyStatus (ctx: MeasureContext, user: AccountUuid): Promise<void> {
    const userConnected = this.connectedUsers.get(user)
    if (userConnected === undefined || userConnected.size === 0) return

    const workspaces = await this.getUserWorkspacesCached(user)
    if (workspaces.length <= 1) return

    const current = this.userNotifyStatusMap.get(user) ?? {}

    const res: Record<
    WorkspaceUuid,
    {
      wsClient: Workspace
      tx: TxCreateDoc<WorkspacesNotification>
    }
    > = {}

    for (const _wsUuid of workspaces) {
      if (!userConnected.has(_wsUuid)) continue

      const data = await this.getCachedUserMeta(ctx, user, _wsUuid)
      if (data === undefined) continue

      const wsClient = await this.getWorkspaceClient(ctx, _wsUuid)
      if (wsClient == null) continue

      res[_wsUuid] = {
        wsClient,
        tx: wsClient.client.txFactory.createTxCreateDoc<WorkspacesNotification>(
          pulse.class.WorkspacesNotification,
          data.spaceId as any,
          {
            account: user,
            ...current
          },
          undefined,
          undefined,
          data.socialId as any
        )
      }
    }

    await Promise.allSettled(
      Object.entries(res).map(async ([wsId, { tx, wsClient }]) => {
        try {
          await wsClient.client.apply(tx)
        } catch (e) {
          console.error(`Failed to apply notification status to workspace ${wsId} for user ${user}`, e)
        }
      })
    )
  }

  private async getWorkspaceClient (ctx: MeasureContext, ws: WorkspaceUuid): Promise<Workspace | undefined> {
    const exists = this.workspaces.get(ws)
    if (exists !== undefined) return exists

    const pending = this.pendingWorkspaces.get(ws)
    if (pending !== undefined) return await pending

    const promise = (async () => {
      try {
        const token = generateToken(systemAccountUuid, ws, { service: config.ServiceId })
        const wsInfo = await getWorkspaceInfo(token)
        if (wsInfo === undefined) return undefined

        const endpoint = getTransactorApiEndpoint(wsInfo)
        if (endpoint === undefined) return undefined

        const client = createRestClient(endpoint, ws, token)

        const { model, hierarchy } = await client.getModel(true)

        const workspace = await Workspace.create(
          ctx.newChild(ws, {}),
          wsInfo,
          hierarchy,
          model,
          this.modelTxes,
          this.storage,
          client,
          this.txTypes
        )

        this.workspaces.set(ws, workspace)
        return workspace
      } finally {
        this.pendingWorkspaces.delete(ws)
      }
    })()

    this.pendingWorkspaces.set(ws, promise)
    return await promise
  }

  public close (): void {
    clearInterval(this.interval)
    if (this.lazyInitInterval != null) clearInterval(this.lazyInitInterval)
    for (const timer of this.userUpdateTimers.values()) {
      clearTimeout(timer)
    }
    this.userUpdateTimers.clear()
    this.connectedUsers.clear()
    this.lazyInitSet.clear()
  }
}
