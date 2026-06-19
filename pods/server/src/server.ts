/* eslint-disable @typescript-eslint/unbound-method */
//
// Copyright © 2022 Hardcore Engineering Inc.
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
  type BrandingMap,
  type MeasureContext,
  type Tx,
  type WorkspaceIds,
  type WorkspaceUuid
} from '@hcengineering/core'
import { buildStorageFromConfig } from '@hcengineering/server-storage'

import { startSessionManager } from '@hcengineering/server'
import {
  type CommunicationCallbacks,
  LimitCategory,
  type PlanLimits,
  type PlatformQueue,
  QueueTopic,
  QueueWorkspaceEvent,
  type QueueWorkspaceLimitsMessage,
  type SessionManager,
  type StorageConfiguration
} from '@hcengineering/server-core'

import { Api as CommunicationApi } from '@hcengineering/communication-server'
import {
  createServerPipeline,
  registerAdapterFactory,
  registerDestroyFactory,
  registerServerPlugins,
  registerStringLoaders,
  registerTxAdapterFactory
} from '@hcengineering/server-pipeline'
import {
  createPostgreeDestroyAdapter,
  createPostgresAdapter,
  createPostgresTxAdapter,
  shutdownPostgres
} from '@hcengineering/postgres'
import { LIMITS_PROVIDER_VAR, PLAN_LIMITS_MAP_KEY } from '@hcengineering/middleware'
import { readFileSync } from 'node:fs'
import { AccountLimitsProvider } from './limitsProvider'
import { startHttpServer } from './server_http'
import type { ServerApi } from '@hcengineering/communication-sdk-types'
const model = JSON.parse(readFileSync(process.env.MODEL_JSON ?? 'model.json').toString()) as Tx[]

registerStringLoaders()

// Register close on process exit.
process.on('exit', () => {
  shutdownPostgres().catch((err) => {
    console.error(err)
  })
})
/**
 * @public
 */
export function start (
  metrics: MeasureContext,
  dbUrl: string,
  opt: {
    queue: PlatformQueue
    fulltextUrl: string
    storageConfig: StorageConfiguration
    port: number
    brandingMap: BrandingMap
    communicationApiEnabled: boolean

    enableCompression?: boolean

    accountsUrl: string

    profiling?: {
      start: () => void
      stop: () => Promise<string | undefined>
    }
  }
): { shutdown: () => Promise<void>, sessionManager: SessionManager } {
  registerTxAdapterFactory('postgresql', createPostgresTxAdapter, true)
  registerAdapterFactory('postgresql', createPostgresAdapter, true)
  registerDestroyFactory('postgresql', createPostgreeDestroyAdapter, true)

  // Prepare statements are controlled via POSTGRES_OPTIONS (e.g. {"prepare": true}).
  // The old DB_PREPARE env var is removed; do not rely on it.

  registerServerPlugins()

  const externalStorage = buildStorageFromConfig(opt.storageConfig)

  const communicationApiFactory = async (
    ctx: MeasureContext,
    workspace: WorkspaceIds,
    broadcastSessions: CommunicationCallbacks
  ): Promise<ServerApi> => {
    if (!opt.communicationApiEnabled) {
      return {
        findMessagesMeta: async () => [],
        findMessagesGroups: async () => [],
        findNotificationContexts: async () => [],
        findCollaborators: async () => [],
        findNotifications: async () => [],
        findLabels: async () => [],
        findPeers: async () => [],
        subscribeCard: () => {},
        unsubscribeCard: () => {},
        event: async () => {
          return {}
        },
        closeSession: async () => {},
        close: async () => {}
      }
    }

    return await CommunicationApi.create(
      ctx.newChild('💬 communication api', {}, { span: false }),
      workspace.uuid,
      dbUrl,
      broadcastSessions
    )
  }
  // Shared across all per-workspace pipelines in this process; updated live by the consumer below.
  const planLimitsMap = new Map<WorkspaceUuid, PlanLimits>()
  const limitsProvider = new AccountLimitsProvider(opt.accountsUrl)

  const limitsConsumer =
    opt.queue != null
      ? opt.queue.createBatchConsumer<QueueWorkspaceLimitsMessage>(
        metrics.newChild('payment-limits-consumer', {}, { span: false }),
        QueueTopic.Workspace,
        opt.queue.getClientId(), // per-instance group: every instance keeps its own map, must get all events
        async (ctx, msgs) => {
          for (const m of msgs) {
            const v = m.value
            if (v.type !== QueueWorkspaceEvent.LimitsChanged) continue
            if (v.category === LimitCategory.Plan) {
              // Plan/limits changed: refresh the snapshot so middlewares pick it up without restart.
              try {
                planLimitsMap.set(m.workspace, await limitsProvider.getPlanLimits(m.workspace))
                ctx.info('plan limits refreshed', { workspace: m.workspace })
              } catch (err: any) {
                ctx.error('failed to refresh plan limits', { workspace: m.workspace, err })
              }
            }
          }
        },
        { batchSize: 100, batchTimeout: 500 }
      )
      : undefined

  const pipelineFactory = createServerPipeline(
    metrics,
    dbUrl,
    model,
    {
      ...opt,
      externalStorage,
      queue: opt.queue,
      communicationApiFactory,
      pipelineContextVars: {
        [LIMITS_PROVIDER_VAR]: limitsProvider,
        [PLAN_LIMITS_MAP_KEY]: planLimitsMap
      }
    },
    {}
  )

  const sessionManager = startSessionManager(metrics, {
    pipelineFactory,
    brandingMap: opt.brandingMap,
    enableCompression: opt.enableCompression,
    accountsUrl: opt.accountsUrl,
    profiling: opt.profiling,
    queue: opt.queue
  })
  const shutdown = startHttpServer(metrics, sessionManager, opt.port, opt.accountsUrl, externalStorage)
  return {
    shutdown: async () => {
      await limitsConsumer?.close()
      await externalStorage.close()
      await sessionManager.closeWorkspaces(metrics)
      await shutdown()
    },
    sessionManager
  }
}
