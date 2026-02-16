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
  Class,
  Doc,
  Hierarchy,
  MeasureContext,
  ModelDb,
  Ref,
  systemAccountUuid,
  Tx,
  TxCUD,
  TxProcessor,
  WorkspaceUuid
} from '@hcengineering/core'
import activity from '@hcengineering/activity'
import { generateToken } from '@hcengineering/server-token'
import { createRestClient } from '@hcengineering/api-client'
import { StorageAdapter } from '@hcengineering/storage'
import notification, { TxNotificationType } from '@hcengineering/notification'
import { buildStorageFromConfig, storageConfigFrom } from '@hcengineering/server-storage'

import Workspace from './workspace'
import { getTransactorApiEndpoint, getWorkspaceInfo, isTxTrigger } from './utils'
import config from './config'

export class Worker {
  private readonly sysHierarchy = new Hierarchy()
  private readonly sysModel = new ModelDb(this.sysHierarchy)

  private readonly workspaces = new Map<WorkspaceUuid, Workspace>()

  private readonly txTypes: TxNotificationType[] = []
  private readonly triggerClasses: Ref<Class<Doc>>[]

  private readonly storage: StorageAdapter

  private readonly interval: NodeJS.Timeout | undefined = undefined

  constructor (ctx: MeasureContext, modelTxes: Tx[]) {
    for (const tx of modelTxes) {
      this.sysHierarchy.tx(tx)
    }
    this.sysModel.addTxes(ctx, modelTxes, true)

    this.storage = buildStorageFromConfig(storageConfigFrom(config.StorageConfig))
    this.txTypes = this.sysModel.findAllSync(notification.class.TxNotificationType, {})
    this.triggerClasses = [activity.class.ActivityMessage, ...this.txTypes.map((it) => it.objectClass)].filter(
      (it) => it !== core.class.Doc
    )

    this.interval = setInterval(
      () => {
        const now = Date.now()
        for (const [uuid, workspace] of this.workspaces.entries()) {
          if (workspace.isInProgress()) continue
          const time = workspace.getLastTxDate() ?? 0
          const diff = now - time
          if (diff < 5 * 60 * 1000) continue
          this.workspaces.delete(uuid)
        }
      },
      5 * 60 * 1000
    )
  }

  async tx (ctx: MeasureContext, ws: WorkspaceUuid, _tx: Tx): Promise<void> {
    if (!TxProcessor.isExtendsCUD(_tx._class)) return

    const tx = _tx as TxCUD<Doc>

    const exists = this.workspaces.get(ws)

    if (exists !== undefined) {
      await exists.tx(tx)
      return
    }

    if (!isTxTrigger(this.sysHierarchy, tx, this.triggerClasses, this.txTypes)) {
      return
    }

    const token = generateToken(systemAccountUuid, ws)
    const wsInfo = await getWorkspaceInfo(token)

    const endpoint = getTransactorApiEndpoint(wsInfo)
    if (endpoint === undefined) return

    const client = createRestClient(endpoint, ws, token)

    const { model, hierarchy } = await client.getModel(true)
    const workspace = new Workspace(ctx.newChild(ws, {}), wsInfo, hierarchy, model, client, this.storage, this.txTypes)

    this.workspaces.set(ws, workspace)

    await workspace.tx(tx)
  }

  public close (): void {
    clearInterval(this.interval)
  }
}
