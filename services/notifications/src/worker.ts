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
  type PlatformQueue,
  type PlatformQueueProducer,
  type QueueOnlineUserTx,
  QueueTopic,
  QueueUserEvent,
  type QueueUserMessage
} from '@hcengineering/server-core'
import { getAccountClient } from '@hcengineering/server-client'
import { PersonSpace } from '@hcengineering/contact'
import { aiBotEmailSocialKey } from '@hcengineering/ai-bot'

import Workspace from './workspace'
import {
  getTransactorApiEndpoint,
  getUserWorkspaces,
  getWorkspaceInfo,
  isTxTrigger,
  MAX_NOTIFICATION_TYPE_PRIORITY
} from './utils'
import config from './config'
import { UserState } from './types'

export class Worker {
  private readonly sysHierarchy = new Hierarchy()
  private readonly sysModel = new ModelDb(this.sysHierarchy)

  private readonly workspaces = new Map<WorkspaceUuid, Workspace>()

  private readonly txTypes: TxNotificationType[] = []
  private readonly triggerClasses: Ref<Class<Doc>>[]

  private readonly storage: StorageAdapter

  private readonly interval: NodeJS.Timeout | undefined = undefined
  private readonly lazyInitInterval: NodeJS.Timeout | undefined = undefined

  private readonly userStates = new Map<AccountUuid, UserState>()

  private readonly pendingWorkspaces = new Map<WorkspaceUuid, Promise<Workspace | undefined>>()
  private readonly onlineUserTxProducer: PlatformQueueProducer<QueueOnlineUserTx>

  private aiBotAccountUuid?: AccountUuid

  constructor (
    private readonly ctx: MeasureContext,
    private readonly modelTxes: Tx[],
    private readonly queue: PlatformQueue
  ) {
    for (const tx of modelTxes) {
      this.sysHierarchy.tx(tx)
    }
    this.sysModel.addTxes(ctx, modelTxes, true)

    this.onlineUserTxProducer = this.queue.getProducer(ctx.newChild('online-user-tx-producer', {}, { span: false }), QueueTopic.OnlineUserTx)

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
        const logoutGracePeriod = 60 * 1000 // 1 minute
        for (const [user, state] of this.userStates.entries()) {
          if (now - state.lastActivityOn > userInactivityLimit) {
            this.clearUserState(user, state)
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

    this.lazyInitInterval = setInterval(() => {
      const now = Date.now()
      const usersToInit = Array.from(this.userStates.entries())
        .filter(([, state]) => state.needsInitialization && state.initPromise == null && now >= (state.nextInitAttempt ?? 0))
        .slice(0, 100)

      for (const [user, state] of usersToInit) {
        state.needsInitialization = false
        if (state.connectedWorkspaces.size > 0) {
          void this.initNotifyStatus(ctx, state.connectedWorkspaces, user)
            .then((success) => {
              if (!success) {
                if (state.initRetries < 5) {
                  state.initRetries++
                  state.needsInitialization = true
                  state.nextInitAttempt = Date.now() + 5000
                } else {
                  this.ctx.error('Failed to initialize notify status after 5 retries', { user })
                  state.initRetries = 0
                }
              } else {
                state.initRetries = 0
                state.nextInitAttempt = undefined
              }
            })
            .catch((e) => {
              if (state.initRetries < 5) {
                this.ctx.error('Unhandled error during lazy notify status init', { user, e })
                state.initRetries++
                state.needsInitialization = true
                state.nextInitAttempt = Date.now() + 5000
              } else {
                this.ctx.error('Failed to initialize notify status after 5 retries (Unhandled error)', { user, e })
                state.initRetries = 0
              }
            })
        }
      }
    }, 1000)
  }

  private getOrCreateUserState (user: AccountUuid): UserState {
    let state = this.userStates.get(user)
    if (state === undefined) {
      state = {
        lastActivityOn: Date.now(),
        connectedWorkspaces: new Set(),
        isNotifyStatusInitialized: false,
        needsInitialization: false,
        initRetries: 0,
        unreadStatusByWorkspace: {},
        spaceIdByWorkspace: new Map(),
        loggedOutAt: new Map()
      }
      this.userStates.set(user, state)
    }
    return state
  }

  private clearUserState (user: AccountUuid, state: UserState): void {
    if (state.debounceTimer !== undefined) {
      clearTimeout(state.debounceTimer)
    }
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

        if (!state.isNotifyStatusInitialized && !state.needsInitialization) {
          state.needsInitialization = true
        }
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

    // Activity-based discovery: if the modifier is not a system account,
    // they must be online and connected to this workspace.
    const socialId = tx.modifiedBy
    if (socialId === aiBotEmailSocialKey) return
    if (socialId != null && socialId !== core.account.System) {
      const account = await workspace.cache.getAccountBySocialId(socialId)
      if (account != null) {
        if (account === this.aiBotAccountUuid) return
        const state = this.getOrCreateUserState(account)
        if (!state.connectedWorkspaces.has(ws)) {
          state.connectedWorkspaces.add(ws)
          state.lastActivityOn = Date.now()
          void this.ensureNotifyStatusInitialized(ctx, ws, account).catch((e) => {
            ctx.error('Failed to async init notify status during tx processing', { e, account, ws })
          })
        }
      }
    }

    await workspace.tx(tx)
  }

  async user (ctx: MeasureContext, ws: WorkspaceUuid, message: QueueUserMessage): Promise<void> {
    if (message.type === QueueUserEvent.rehydrated) {
      this.ctx.info('Account service rehydrated, triggering session sync')
      void this.syncSessions()
      return
    }

    if (message.type === QueueUserEvent.login) {
      if (message.user === this.aiBotAccountUuid) return
      const state = this.getOrCreateUserState(message.user)

      state.loggedOutAt.delete(ws)
      state.connectedWorkspaces.add(ws)
      state.lastActivityOn = Date.now()

      if (!state.isNotifyStatusInitialized || !(ws in state.unreadStatusByWorkspace)) {
        state.needsInitialization = true
      } else {
        this.scheduleUserNotifyStatusUpdate(ctx, message.user)
      }
    } else if (message.type === QueueUserEvent.logout) {
      if (message.user === this.aiBotAccountUuid) return
      const state = this.userStates.get(message.user)
      if (state != null && message.sessions === 0) {
        state.loggedOutAt.set(ws, message.timestamp)
      }
    }
  }

  private async ensureNotifyStatusInitialized (
    ctx: MeasureContext,
    wsUuid: WorkspaceUuid,
    user: AccountUuid
  ): Promise<void> {
    const state = this.getOrCreateUserState(user)
    state.needsInitialization = false

    if (!state.isNotifyStatusInitialized) {
      await this.initNotifyStatus(ctx, new Set([wsUuid]), user)
    }
  }

  private async initNotifyStatus (
    ctx: MeasureContext,
    targetWorkspaces: Set<WorkspaceUuid>,
    user: AccountUuid
  ): Promise<boolean> {
    const state = this.getOrCreateUserState(user)

    while (state.initPromise != null) {
      await state.initPromise
    }

    const hasAllTargets = [...targetWorkspaces].every(ws => ws in state.unreadStatusByWorkspace)
    if (hasAllTargets) return true

    state.initPromise = this._initNotifyStatus(ctx, targetWorkspaces, user)
    try {
      return await state.initPromise
    } finally {
      state.initPromise = undefined
    }
  }

  private async _initNotifyStatus (
    ctx: MeasureContext,
    targetWorkspaces: Set<WorkspaceUuid>,
    user: AccountUuid
  ): Promise<boolean> {
    const state = this.getOrCreateUserState(user)

    if (targetWorkspaces.size === 0) {
      state.isNotifyStatusInitialized = true
      return true
    }

    const workspaces = await this.getUserWorkspacesCached(user, targetWorkspaces)
    if (workspaces.length === 0) {
      state.isNotifyStatusInitialized = true
      return true
    }

    let hasErrors = false
    for (const _wsUuid of workspaces) {
      if (_wsUuid in state.unreadStatusByWorkspace) continue

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

        state.unreadStatusByWorkspace[_wsUuid] = unread != null
      } catch (e) {
        console.error(`Failed to init notify status for user ${user} in workspace ${_wsUuid}`, e)
        hasErrors = true
      }
    }

    if (hasErrors) return false

    state.isNotifyStatusInitialized = true
    await this.applyWorkspaceNotifyStatus(ctx, user)
    return true
  }

  private async getUserWorkspacesCached (
    user: AccountUuid,
    targetWorkspaces = new Set<WorkspaceUuid>()
  ): Promise<WorkspaceUuid[]> {
    const state = this.getOrCreateUserState(user)

    // Если статусы уже были однажды проинициализированы,
    // используем ключи unreadStatusByWorkspace как актуальный список воркспейсов.
    if (state.isNotifyStatusInitialized) {
      const cachedWorkspaces = Object.keys(state.unreadStatusByWorkspace)
      const cachedSet = new Set(cachedWorkspaces)

      const hasAllTargets = [...targetWorkspaces].every((target) => cachedSet.has(target))
      if (hasAllTargets) {
        return cachedWorkspaces as WorkspaceUuid[]
      }
    }

    // Если кэша нет или пользователь был добавлен в новый воркспейс,
    // запрашиваем актуальный список из сервиса аккаунтов.
    const workspaces = await getUserWorkspaces(user)
    const uuids = workspaces.map((w) => w.uuid)

    // При инвалидации кэша удаляем старые воркспейсы (откуда пользователя могли удалить)
    const newWorkspacesSet = new Set(uuids)
    for (const _ws of Object.keys(state.unreadStatusByWorkspace)) {
      const ws = _ws as WorkspaceUuid
      if (!newWorkspacesSet.has(ws)) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete state.unreadStatusByWorkspace[ws]
        state.spaceIdByWorkspace.delete(ws)
        state.connectedWorkspaces.delete(ws)
      }
    }

    return uuids
  }

  private scheduleUserNotifyStatusUpdate (ctx: MeasureContext, user: AccountUuid): void {
    const state = this.userStates.get(user)
    if (state == null) return

    if (state.debounceTimer != null) return

    state.debounceTimer = setTimeout(() => {
      state.debounceTimer = undefined
      this.applyWorkspaceNotifyStatus(ctx, user).catch((e) => {
        console.error(`Failed to apply debounced notification status for user ${user}`, e)
      })
    }, 1000)
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
      console.error(`Failed to get space data for user ${user} in workspace ${wsUuid}`, e)
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
    if (user == null || user === this.aiBotAccountUuid) return

    const state = this.userStates.get(user)
    if (state == null) return

    state.lastActivityOn = Date.now()
    await this.ensureNotifyStatusInitialized(ctx, wsUuid, user)

    const workspaces = await this.getUserWorkspacesCached(user, new Set([wsUuid]))
    if (workspaces.length <= 1) return

    if (_tx._class === core.class.TxCreateDoc) {
      const tx = _tx as TxCreateDoc<InboxNotification>
      const doc = TxProcessor.createDoc2Doc(tx)
      if (doc.isViewed || doc.archived) return

      if (state.unreadStatusByWorkspace[wsUuid]) return

      state.unreadStatusByWorkspace[wsUuid] = true
      this.scheduleUserNotifyStatusUpdate(ctx, user)
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

      state.unreadStatusByWorkspace[wsUuid] = notify
      this.scheduleUserNotifyStatusUpdate(ctx, user)
    }
  }

  private async applyWorkspaceNotifyStatus (ctx: MeasureContext, user: AccountUuid): Promise<void> {
    if (user === this.aiBotAccountUuid) return
    const state = this.userStates.get(user)
    if (state == null || state.connectedWorkspaces.size === 0) return

    for (const wsUuid of state.connectedWorkspaces) {
      const spaceId = await this.getPersonSpaceId(ctx, user, wsUuid)
      if (spaceId === undefined) continue

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
      }
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
    for (const state of this.userStates.values()) {
      if (state.debounceTimer !== undefined) {
        clearTimeout(state.debounceTimer)
      }
    }
    this.userStates.clear()
  }
}
