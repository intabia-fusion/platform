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
  type Doc,
  Hierarchy,
  type MeasureContext,
  ModelDb,
  systemAccountUuid,
  type Tx,
  type TxCUD,
  TxProcessor,
  type WorkspaceUuid,
  type Branding
} from '@hcengineering/core'
import { loadBrandingMap } from '@hcengineering/server-core'
import { generateToken } from '@hcengineering/server-token'
import { createRestClient } from '@hcengineering/api-client'
import { type StorageAdapter } from '@hcengineering/storage'
import { buildStorageFromConfig, storageConfigFrom } from '@hcengineering/server-storage'
import activity from '@hcengineering/activity'
import notification from '@hcengineering/notification'

import Workspace from './workspace'
import { getTransactorApiEndpoint, getWorkspaceInfo } from './utils'
import config from './config'

export class Worker {
  private readonly sysHierarchy = new Hierarchy()
  private readonly sysModel = new ModelDb(this.sysHierarchy)

  private readonly workspaces = new Map<WorkspaceUuid, Workspace>()
  private readonly loadingWorkspaces = new Map<WorkspaceUuid, Promise<Workspace | undefined>>()
  private readonly storage: StorageAdapter
  private readonly brandingMap = loadBrandingMap(config.BrandingPath)

  private readonly interval: NodeJS.Timeout | undefined = undefined

  constructor (
    ctx: MeasureContext,
    private readonly modelTxes: Tx[]
  ) {
    for (const tx of modelTxes) {
      this.sysHierarchy.tx(tx)
    }
    this.sysModel.addTxes(ctx, modelTxes, true)

    this.storage = buildStorageFromConfig(storageConfigFrom(config.StorageConfig))

    this.interval = setInterval(
      () => {
        const now = Date.now()
        for (const [uuid, workspace] of Array.from(this.workspaces.entries())) {
          if (workspace.isInProgress()) continue
          const time = workspace.getLastTxDate() ?? 0
          const diff = now - time
          if (diff < 10 * 60 * 1000) continue
          workspace.close().catch((e) => {
            console.error('Error closing workspace', e)
          })
          this.workspaces.delete(uuid)
        }
      },
      5 * 60 * 1000
    )
  }

  async tx (ctx: MeasureContext, ws: WorkspaceUuid, _tx: Tx): Promise<void> {
    if (!TxProcessor.isExtendsCUD(_tx._class)) return

    const tx = _tx as TxCUD<Doc>

    if (this.sysHierarchy.isDerived(tx.objectClass, notification.class.DocNotifyContext)) return
    if (this.sysHierarchy.isDerived(tx.objectClass, notification.class.InboxNotification)) return
    if (this.sysHierarchy.isDerived(tx.objectClass, notification.class.BrowserNotification)) return
    if (this.sysHierarchy.isDerived(tx.objectClass, notification.class.ReadState)) return
    if (this.sysHierarchy.isDerived(tx.objectClass, activity.class.ActivityMessage)) return

    const exists = this.workspaces.get(ws)

    if (exists !== undefined) {
      await exists.tx(tx)
      return
    }

    if (tx.space === core.space.DerivedTx) return

    const loading = this.loadingWorkspaces.get(ws)
    if (loading !== undefined) {
      const resolveWs = await loading
      if (resolveWs !== undefined) {
        await resolveWs.tx(tx)
      }
      return
    }

    const loadWsPromise = this.initWorkspace(ctx, ws)
    this.loadingWorkspaces.set(ws, loadWsPromise)

    try {
      const workspace = await loadWsPromise
      if (workspace !== undefined) {
        await workspace.tx(tx)
      }
    } finally {
      this.loadingWorkspaces.delete(ws)
    }
  }

  private async initWorkspace (ctx: MeasureContext, ws: WorkspaceUuid): Promise<Workspace | undefined> {
    const token = generateToken(systemAccountUuid, ws, { service: config.ServiceId })
    const wsInfo = await getWorkspaceInfo(token)
    if (wsInfo === undefined) return

    const endpoint = getTransactorApiEndpoint(wsInfo)
    if (endpoint === undefined) return

    const client = createRestClient(endpoint, ws, token)

    const { model, hierarchy } = await client.getModel(true)

    const branding: Branding | undefined =
      wsInfo.branding !== undefined && wsInfo.branding !== ''
        ? this.brandingMap[wsInfo.branding]
        : this.brandingMap[Object.keys(this.brandingMap)[0]]

    console.log(wsInfo.branding, branding)
    const workspace = await Workspace.create(
      ctx.newChild(ws, {}),
      wsInfo,
      hierarchy,
      model,
      this.modelTxes,
      this.storage,
      client,
      branding
    )

    this.workspaces.set(ws, workspace)

    return workspace
  }

  public close (): void {
    clearInterval(this.interval)
  }
}
