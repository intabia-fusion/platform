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
  Branding,
  Class,
  Doc,
  generateId,
  Hierarchy,
  MeasureContext,
  ModelDb,
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
import { withRetry } from '@hcengineering/retry'
import pulse, { WorkspacesNotification } from '@hcengineering/pulse'
import {
  loadBrandingMap,
  type PlatformQueue,
  type PlatformQueueProducer,
  type QueueOnlineUserTx,
  QueueTopic,
  QueueUserEvent,
  type QueueUserMessage,
  userEvents
} from '@hcengineering/server-core'
import { getAccountClient } from '@hcengineering/server-client'
import { PersonSpace } from '@hcengineering/contact'
import { aiBotEmailSocialKey } from '@hcengineering/ai-bot'
import platform from '@hcengineering/platform'

import Workspace from './workspace'
import { getTransactorApiEndpoint, getWorkspaceInfo, isTxTrigger, MAX_NOTIFICATION_TYPE_PRIORITY } from './utils'
import config from './config'
import { UserState } from './types'

export class Worker {
  private readonly sysHierarchy = new Hierarchy()
  private readonly sysModel = new ModelDb(this.sysHierarchy)

  private readonly workspaces = new Map<WorkspaceUuid, Workspace>()

  private readonly txTypes: TxNotificationType[] = []
  private readonly triggerClasses: Ref<Class<Doc>>[]

  private readonly storage: StorageAdapter

  private readonly clearInterval: NodeJS.Timeout | undefined = undefined
  private readonly flushInterval: NodeJS.Timeout | undefined = undefined

  private readonly userStates = new Map<AccountUuid, UserState>()
  private readonly dirtyUsers = new Set<AccountUuid>()

  private readonly pendingWorkspaces = new Map<WorkspaceUuid, Promise<Workspace | undefined>>()
  private readonly onlineUserTxProducer: PlatformQueueProducer<QueueOnlineUserTx>
  private readonly userEventProducer: PlatformQueueProducer<QueueUserMessage>

  private aiBotAccountUuid?: AccountUuid

  private readonly brandingMap = loadBrandingMap(config.BrandingPath)

  constructor (
    private readonly ctx: MeasureContext,
    private readonly modelTxes: Tx[],
    private readonly queue: PlatformQueue
  ) {
    for (const tx of modelTxes) {
      this.sysHierarchy.tx(tx)
    }
    this.sysModel.addTxes(ctx, modelTxes, true)

    this.onlineUserTxProducer = this.queue.getProducer(
      ctx.newChild('online-user-tx-producer', {}, { span: false }),
      QueueTopic.OnlineUserTx
    )
    this.userEventProducer = this.queue.getProducer(
      ctx.newChild('user-event-producer', {}, { span: false }),
      QueueTopic.Users
    )

    this.storage = buildStorageFromConfig(storageConfigFrom(config.StorageConfig))
    this.txTypes = this.sysModel
      .findAllSync(notification.class.TxNotificationType, {})
      .sort((a, b) => (a.priority ?? MAX_NOTIFICATION_TYPE_PRIORITY) - (b.priority ?? MAX_NOTIFICATION_TYPE_PRIORITY))
    this.triggerClasses = [
      notification.class.ReadState,
      activity.class.ActivityMessage,
      ...this.txTypes.map((it) => it.objectClass)
    ].filter((it) => it !== core.class.Doc)

    this.clearInterval = setInterval(
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
        const logoutGracePeriod = 60 * 1000 // 1 minute
        for (const [user, state] of this.userStates.entries()) {
          if (now - state.lastActivityOn > userInactivityLimit) {
            this.clearUserState(user)
            continue
          }

          for (const [ws, loggedOutTime] of state.loggedOutAt.entries()) {
            if (now - loggedOutTime > logoutGracePeriod) {
              state.connectedWorkspaces.delete(ws)
              state.loggedOutAt.delete(ws)
            }
          }
        }
      },
      5 * 60 * 1000 // 5 minutes
    )

    this.flushInterval = setInterval(() => {
      void this.flushDirtyUsers()
    }, 1000)
  }

  private async flushDirtyUsers (): Promise<void> {
    if (this.dirtyUsers.size === 0) return
    const users = Array.from(this.dirtyUsers)
    this.dirtyUsers.clear()

    const chunkSize = 50
    for (let i = 0; i < users.length; i += chunkSize) {
      const chunk = users.slice(i, i + chunkSize)

      const results = await Promise.allSettled(
        chunk.map(async (user) => {
          await withRetry(
            async () => {
              await this.sendWorkspacesNotifyStatusToUser(this.ctx, user)
            },
            { maxRetries: 3 }
          )
        })
      )

      const failed = results.reduce<{ user: string, error: any }[]>((acc, result, index) => {
        if (result.status === 'rejected') {
          acc.push({ user: chunk[index], error: result.reason })
        }
        return acc
      }, [])

      if (failed.length > 0) {
        this.ctx.error('Failed to apply debounced notification status for some users', { failed })
      }
    }
  }

  private getOrCreateUserState (user: AccountUuid): UserState {
    let state = this.userStates.get(user)
    if (state === undefined) {
      state = {
        lastActivityOn: Date.now(),
        connectedWorkspaces: new Set(),
        unreadStatusByWorkspace: {},
        spaceIdByWorkspace: new Map(),
        loggedOutAt: new Map()
      }
      this.userStates.set(user, state)
    }
    return state
  }

  private async registerUserConnection (
    ctx: MeasureContext,
    ws: WorkspaceUuid,
    account: AccountUuid,
    isExplicitLogin: boolean
  ): Promise<void> {
    if (account === this.aiBotAccountUuid || account === systemAccountUuid) return
    const state = this.getOrCreateUserState(account)

    state.lastActivityOn = Date.now()
    let shouldScheduleUpdate = false

    if (isExplicitLogin || !state.connectedWorkspaces.has(ws)) {
      state.loggedOutAt.delete(ws)
      state.connectedWorkspaces.add(ws)
      shouldScheduleUpdate = true
    }

    if (state.isStatusFetched !== true) {
      await this.fetchUserNotifyStatus(account)
      state.isStatusFetched = true
      shouldScheduleUpdate = true
    }

    if (shouldScheduleUpdate) {
      this.scheduleUserNotifyStatusUpdate(ctx, account)
    }
  }

  private clearUserState (user: AccountUuid): void {
    this.dirtyUsers.delete(user)
    this.userStates.delete(user)
  }

  private async resolveAiBotAccount (ctx: MeasureContext): Promise<void> {
    if (this.aiBotAccountUuid != null) return
    try {
      const token = generateToken(systemAccountUuid, undefined, { service: config.ServiceId })
      const client = getAccountClient(token)
      const socialId = await client.findFullSocialIdBySocialKey(aiBotEmailSocialKey)
      if (socialId != null) {
        this.aiBotAccountUuid = socialId.personUuid as AccountUuid
      }
    } catch (e) {
      ctx.error('Failed to resolve AI bot account', { e })
    }
  }

  public async syncSessions (): Promise<boolean> {
    try {
      await this.resolveAiBotAccount(this.ctx)
      const token = generateToken(systemAccountUuid, undefined, { service: config.ServiceId })
      const presence = await withRetry(async () => await getAccountClient(token).getPresence({ online: true }))
      for (const p of presence) {
        const account = p.accountUuid
        if (account === this.aiBotAccountUuid) continue
        const state = this.getOrCreateUserState(account)
        state.connectedWorkspaces.add(p.workspaceUuid)
        state.lastActivityOn = Date.now()
      }
      return true
    } catch (e) {
      this.ctx.error('Failed to fetch sessions from account service', { e })
      return false
    }
  }

  async tx (ctx: MeasureContext, ws: WorkspaceUuid, _tx: Tx): Promise<void> {
    if (!TxProcessor.isExtendsCUD(_tx._class)) return

    const tx = _tx as TxCUD<Doc>

    if (this.sysHierarchy.isDerived(tx.objectClass, notification.class.InboxNotification)) {
      await this.updateUserNotifyStatus(ctx, ws, tx as TxCUD<InboxNotification>)
    }

    const exists = this.workspaces.get(ws)
    const isTrigger = isTxTrigger(this.sysHierarchy, tx, this.triggerClasses, this.txTypes)

    if (exists === undefined && !isTrigger) {
      return
    }

    const workspace = await this.getWorkspaceClient(ctx, ws)
    if (workspace == null) return

    const socialId = tx.modifiedBy
    if (socialId !== core.account.System) {
      const account = await workspace.cache.getAccountBySocialId(socialId)
      if (account != null) {
        await this.registerUserConnection(ctx, ws, account, true)
      }
    }

    await workspace.tx(tx)
  }

  async user (ctx: MeasureContext, ws: WorkspaceUuid, message: QueueUserMessage): Promise<void> {
    if (message.type === QueueUserEvent.rehydrated) {
      void this.syncSessions()
      return
    }

    if (message.type === QueueUserEvent.login) {
      await this.registerUserConnection(ctx, ws, message.user, true)
    } else if (message.type === QueueUserEvent.logout) {
      if (message.user === this.aiBotAccountUuid || message.user === systemAccountUuid) return
      const state = this.userStates.get(message.user)
      if (state != null && message.sessions === 0) {
        state.loggedOutAt.set(ws, message.timestamp)
      }
    } else if (message.type === QueueUserEvent.notifyStatusChanged) {
      if (message.user === this.aiBotAccountUuid || message.user === systemAccountUuid) return

      const state = this.userStates.get(message.user)
      if (state == null) return // No active state, no need to track or broadcast
      if (state.connectedWorkspaces.size === 0) return // No active sessions, nothing to broadcast to

      if (state.isStatusFetched !== true) {
        await this.fetchUserNotifyStatus(message.user)
        state.isStatusFetched = true
      }

      state.unreadStatusByWorkspace[ws] = message.hasUnread
      this.scheduleUserNotifyStatusUpdate(ctx, message.user)
    }
  }

  private async fetchUserNotifyStatus (user: AccountUuid): Promise<void> {
    const state = this.userStates.get(user)
    if (state == null) return

    try {
      const token = generateToken(systemAccountUuid, undefined, { service: config.ServiceId })
      const client = getAccountClient(token)
      const statuses = await client.getAccountWorkspaceBadgeStatuses(user)

      for (const status of statuses) {
        state.unreadStatusByWorkspace[status.workspaceUuid] = status.hasUnread
      }
    } catch (e) {
      this.ctx.error('Failed to fetch user notification statuses', { e, user })
      throw e
    }
  }

  private scheduleUserNotifyStatusUpdate (ctx: MeasureContext, user: AccountUuid): void {
    const state = this.userStates.get(user)
    if (state == null) return

    this.dirtyUsers.add(user)
  }

  private async getPersonSpaceId (
    ctx: MeasureContext,
    user: AccountUuid,
    wsUuid: WorkspaceUuid
  ): Promise<Ref<PersonSpace> | undefined> {
    const state = this.getOrCreateUserState(user)

    const cached = state.spaceIdByWorkspace.get(wsUuid)
    if (cached !== undefined) return cached

    try {
      const wsClient = await this.getWorkspaceClient(ctx, wsUuid)
      if (wsClient == null) return undefined

      const space = (await wsClient.cache.getPersonSpaces([user]))[0]

      if (space != null) {
        state.spaceIdByWorkspace.set(wsUuid, space._id)
        return space._id
      }
    } catch (e) {
      ctx.error('Failed to get space data for user', { e, user, wsUuid })
      throw e
    }

    return undefined
  }

  private async getTxUser (
    ctx: MeasureContext,
    wsUuid: WorkspaceUuid,
    _tx: TxCUD<InboxNotification>
  ): Promise<AccountUuid | undefined> {
    if (_tx._class === core.class.TxCreateDoc) {
      return TxProcessor.createDoc2Doc(_tx as TxCreateDoc<InboxNotification>).user
    } else if (_tx._class === core.class.TxRemoveDoc) {
      const tx = _tx as TxRemoveDoc<InboxNotification>
      const wsClient = await this.getWorkspaceClient(ctx, wsUuid)
      const space = await wsClient?.cache.findPersonSpace(tx.objectSpace as Ref<PersonSpace>)
      return space?.account
    } else if (_tx._class === core.class.TxUpdateDoc) {
      const tx = _tx as TxUpdateDoc<InboxNotification>
      if (tx.operations.isViewed == null) return undefined
      const wsClient = await this.getWorkspaceClient(ctx, wsUuid)
      const space = await wsClient?.cache.findPersonSpace(tx.objectSpace as Ref<PersonSpace>)
      return space?.account
    }
    return undefined
  }

  private async updateUserNotifyStatus (
    ctx: MeasureContext,
    wsUuid: WorkspaceUuid,
    _tx: TxCUD<InboxNotification>
  ): Promise<void> {
    const user = await this.getTxUser(ctx, wsUuid, _tx)
    if (user == null || user === this.aiBotAccountUuid || user === systemAccountUuid) return

    const state = this.getOrCreateUserState(user)

    if (state.isStatusFetched !== true) {
      await this.fetchUserNotifyStatus(user)
      state.isStatusFetched = true
    }

    state.lastActivityOn = Date.now()

    if (_tx._class === core.class.TxCreateDoc) {
      const tx = _tx as TxCreateDoc<InboxNotification>
      const doc = TxProcessor.createDoc2Doc(tx)

      if (doc.isViewed || doc.archived) return
      if (state.unreadStatusByWorkspace[wsUuid]) return

      await this.persistNotifyStatus(user, wsUuid, true, _tx.createdOn ?? _tx.modifiedOn)
      state.unreadStatusByWorkspace[wsUuid] = true
    } else {
      if (_tx._class === core.class.TxUpdateDoc) {
        const tx = _tx as TxUpdateDoc<InboxNotification>
        if (tx.operations.isViewed == null) return
        const isNotified = state.unreadStatusByWorkspace[wsUuid]
        if (isNotified && !tx.operations.isViewed) return
        if (!isNotified && tx.operations.isViewed) return
      } else if (_tx._class === core.class.TxRemoveDoc) {
        if (!state.unreadStatusByWorkspace[wsUuid]) return
      }

      const wsClient = await this.getWorkspaceClient(ctx, wsUuid)
      if (wsClient == null) return

      const unread = await wsClient.client.findOne(
        notification.class.InboxNotification,
        { user, isViewed: false, archived: false },
        { limit: 1 }
      )
      const notify = unread != null

      if (state.unreadStatusByWorkspace[wsUuid] === notify) return

      await this.persistNotifyStatus(user, wsUuid, notify, _tx.modifiedOn)
      state.unreadStatusByWorkspace[wsUuid] = notify
    }
  }

  private async persistNotifyStatus (
    user: AccountUuid,
    wsUuid: WorkspaceUuid,
    hasUnread: boolean,
    timestamp: number
  ): Promise<void> {
    try {
      await this.userEventProducer.send(
        this.ctx,
        wsUuid,
        [
          userEvents.notifyStatusChanged({
            user,
            hasUnread,
            timestamp
          })
        ],
        user
      )
    } catch (e) {
      this.ctx.error('Failed to send notifyStatusChanged to queue', { e, user, wsUuid, hasUnread })
      throw e
    }
  }

  private async sendWorkspacesNotifyStatusToUser (ctx: MeasureContext, user: AccountUuid): Promise<void> {
    if (user === this.aiBotAccountUuid || user === systemAccountUuid) return

    const state = this.userStates.get(user)
    if (state == null || state.connectedWorkspaces.size === 0 || state.isStatusFetched !== true) return

    const results = await Promise.allSettled(
      Array.from(state.connectedWorkspaces).map(async (wsUuid) => {
        const spaceId = await this.getPersonSpaceId(ctx, user, wsUuid)
        if (spaceId === undefined) return

        const tx: TxCreateDoc<WorkspacesNotification> = {
          _id: generateId(),
          _class: core.class.TxCreateDoc,
          objectId: generateId(),
          objectClass: pulse.class.WorkspacesNotification,
          objectSpace: spaceId,
          space: spaceId,
          modifiedBy: core.account.System,
          modifiedOn: Date.now(),
          createdBy: core.account.System,
          attributes: {
            account: user,
            ...state.unreadStatusByWorkspace
          }
        }

        try {
          await this.onlineUserTxProducer.send(ctx, wsUuid, [
            {
              workspaceUuid: wsUuid,
              tx,
              account: user
            }
          ])
        } catch (e) {
          ctx.error('Failed to send targeted online user transaction to queue', { e, user, wsUuid })
          throw e
        }
      })
    )

    const failed = results.filter((r) => r.status === 'rejected')
    if (failed.length > 0) {
      throw new Error(`Failed to update notify status for ${failed.length} workspaces for user ${user}`)
    }
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
        const branding: Branding | undefined =
          wsInfo.branding !== undefined && wsInfo.branding !== ''
            ? (this.brandingMap[wsInfo.branding] ?? this.brandingMap[Object.keys(this.brandingMap)[0]])
            : this.brandingMap[Object.keys(this.brandingMap)[0]]
        const workspace = await Workspace.create(
          ctx.newChild(ws, {}),
          wsInfo,
          hierarchy,
          model,
          this.modelTxes,
          this.storage,
          client,
          branding,
          this.txTypes
        )

        this.workspaces.set(ws, workspace)
        return workspace
      } catch (e: any) {
        if (e?.status?.code === platform.status.Forbidden) {
          ctx.error('Workspace is forbidden, dropping workspace initialization', { e, wsUuid: ws })
          return undefined
        }
        throw e
      } finally {
        this.pendingWorkspaces.delete(ws)
      }
    })()

    this.pendingWorkspaces.set(ws, promise)
    return await promise
  }

  public async close (): Promise<void> {
    clearInterval(this.clearInterval)
    clearInterval(this.flushInterval)
    this.userStates.clear()
    this.dirtyUsers.clear()
    await Promise.allSettled([this.userEventProducer.close, this.onlineUserTxProducer.close])
  }
}
