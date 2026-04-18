/* eslint-disable @typescript-eslint/unbound-method */
import type { MeasureContext, Tx } from '@intabiafusion/core'
import {
  createMongoAdapter,
  createMongoDestroyAdapter,
  createMongoTxAdapter,
  shutdownMongo
} from '@intabiafusion/mongo'
import { setMetadata } from '@intabiafusion/platform'
import {
  createPostgreeDestroyAdapter,
  createPostgresAdapter,
  createPostgresTxAdapter,
  shutdownPostgres
} from '@intabiafusion/postgres'
import serverClientPlugin from '@intabiafusion/server-client'
import { type PlatformQueue } from '@intabiafusion/server-core'
import {
  registerAdapterFactory,
  registerDestroyFactory,
  registerServerPlugins,
  registerStringLoaders,
  registerTxAdapterFactory,
  setAdapterSecurity
} from '@intabiafusion/server-pipeline'
import serverToken from '@intabiafusion/server-token'

import { WorkspaceManager } from './manager'

// Register close on process exit.
process.on('exit', () => {
  shutdownPostgres().catch((err) => {
    console.error(err)
  })
  shutdownMongo().catch((err) => {
    console.error(err)
  })
})

export async function startIndexer (
  ctx: MeasureContext,
  opt: {
    queue: PlatformQueue
    model: Tx[]
    dbURL: string
    serverSecret: string
    accountsUrl: string
  }
): Promise<() => void> {
  // Prepare statements are controlled via POSTGRES_OPTIONS (e.g. {"prepare": true}).
  // The old DB_PREPARE env var is removed; do not rely on it.

  setMetadata(serverToken.metadata.Secret, opt.serverSecret)
  setMetadata(serverToken.metadata.Service, 'rating')
  setMetadata(serverClientPlugin.metadata.Endpoint, opt.accountsUrl)

  registerTxAdapterFactory('mongodb', createMongoTxAdapter)
  registerAdapterFactory('mongodb', createMongoAdapter)
  registerDestroyFactory('mongodb', createMongoDestroyAdapter)

  registerTxAdapterFactory('postgresql', createPostgresTxAdapter, true)
  registerAdapterFactory('postgresql', createPostgresAdapter, true)
  registerDestroyFactory('postgresql', createPostgreeDestroyAdapter, true)
  setAdapterSecurity('postgresql', true)

  registerServerPlugins()
  registerStringLoaders()

  const manager = new WorkspaceManager(ctx, opt.model, { ...opt })
  await manager.startRatingCalculator()

  const close = (): void => {
    void manager.shutdown()
    void opt.queue.shutdown()
  }

  return close
}
