/* eslint-disable @typescript-eslint/unbound-method */
import {
  Hierarchy,
  ModelDb,
  systemAccountUuid,
  type MeasureMetricsContext,
  type WorkspaceIds,
  type WorkspaceUuid
} from '@hcengineering/core'
import {
  BroadcastMiddleware,
  DBAdapterInitMiddleware,
  DBAdapterMiddleware,
  DomainFindMiddleware,
  DomainTxMiddleware,
  FullTextMiddleware,
  LowLevelMiddleware,
  ModelMiddleware,
  QueryJoinMiddleware,
  QueueMiddleware,
  TxMiddleware
} from '@hcengineering/middleware'
import {
  createDummyStorageAdapter,
  createPipeline,
  type MiddlewareCreator,
  type Pipeline,
  type PipelineContext,
  type PlatformQueue
} from '@hcengineering/server-core'
import {
  createEmptyBroadcastOps,
  getConfig,
  registerAdapterFactory,
  registerDestroyFactory,
  registerServerPlugins,
  registerStringLoaders,
  registerTxAdapterFactory
} from '@hcengineering/server-pipeline'
import serverToken, { generateToken } from '@hcengineering/server-token'
import { randomUUID } from 'crypto'

/* eslint-disable @typescript-eslint/unbound-method */

import { setMetadata } from '@hcengineering/platform'
import {
  createPostgreeDestroyAdapter,
  createPostgresAdapter,
  createPostgresTxAdapter,
  getDBClient,
  setDBExtraOptions
} from '@hcengineering/postgres'
import serverClientPlugin from '@hcengineering/server-client'
import serverCore from '@hcengineering/server-core'

import { execFile } from 'child_process'
import { promisify } from 'util'
import { createElasticAdapter } from '@hcengineering/elastic'
import { elasticUrl, kafkaBrokers, postgresUrl } from '@hcengineering/test-containers'
import type { FulltextDBConfiguration } from '@hcengineering/server-indexer'
import { genMinModel } from './minmodel'
export const model = genMinModel()

export async function preparePipeline (
  toolCtx: MeasureMetricsContext,
  queue: PlatformQueue,
  useBroadcast: boolean = true // If not passed wll not do broadcast so queue will not be triggered.
): Promise<{ pipeline: Pipeline, wsIds: WorkspaceIds }> {
  const wsId: WorkspaceUuid = randomUUID().toString() as WorkspaceUuid
  const wsIds: WorkspaceIds = {
    uuid: wsId,
    url: wsId
  }
  const storage = createDummyStorageAdapter()
  const conf = getConfig(toolCtx, dbUrl, toolCtx, {
    externalStorage: storage,
    disableTriggers: true,
    usePassedCtx: true
  })

  const middlewares: MiddlewareCreator[] = [
    TxMiddleware.create, // Store tx into transaction domain
    FullTextMiddleware.create('', generateToken(systemAccountUuid, wsIds.uuid, { service: 'fulltext' })),
    LowLevelMiddleware.create,
    QueryJoinMiddleware.create,
    DomainFindMiddleware.create,
    DomainTxMiddleware.create,
    QueueMiddleware.create(queue),
    DBAdapterInitMiddleware.create,
    ModelMiddleware.create(model),
    DBAdapterMiddleware.create(conf), // Configure DB adapters
    ...(useBroadcast ? [BroadcastMiddleware.create(createEmptyBroadcastOps())] : [])
  ]

  const hierarchy = new Hierarchy()
  const modelDb = new ModelDb(hierarchy)
  const context: PipelineContext = {
    workspace: wsIds,
    branding: null,
    modelDb,
    hierarchy,
    storageAdapter: storage,
    contextVars: {}
  }
  const pipeline = await createPipeline(toolCtx, middlewares, context)
  return { pipeline, wsIds }
}

export let fullTextDbURL = ''
export let dbUrl = ''
export let kafkaBroker = ''
export const elasticIndexName = 'testing'

// Containers are started here rather than read from the environment, so a run needs no stand.
// Call it before anything builds a pipeline or a queue - the addresses are empty until then.
export async function startServices (): Promise<void> {
  let serverUrl: string
  ;[serverUrl, fullTextDbURL, kafkaBroker] = await Promise.all([postgresUrl(), elasticUrl(), kafkaBrokers()])
  // The postgres server can be shared with other test processes; two migrators in one database
  // collide on CREATE SCHEMA, so each process gets a database of its own.
  const dbName = `fulltext_${randomUUID().replace(/-/g, '')}`
  const admin = getDBClient(serverUrl)
  try {
    const client = await admin.getClient()
    await client`CREATE DATABASE ${client(dbName)}`
  } finally {
    admin.close()
  }
  const url = new URL(serverUrl)
  url.pathname = '/' + dbName
  dbUrl = url.toString()
  // The pipeline goes through the platform's postgres adapter, which waits for a schema version a
  // fresh database does not have. The migrator is a CLI pod, so it runs as one; it is idempotent.
  await promisify(execFile)(process.execPath, [require.resolve('@hcengineering/pod-db-migrator')], {
    env: { ...process.env, DB_URL: dbUrl }
  })
  dbConfig.fulltextAdapter.url = fullTextDbURL
}

export function prepare (): void {
  setDBExtraOptions({
    prepare: true // We override defaults
  })

  setMetadata(serverToken.metadata.Secret, 'secret')
  setMetadata(serverCore.metadata.ElasticIndexName, elasticIndexName)
  setMetadata(serverClientPlugin.metadata.Endpoint, 'http://localhost:3003')

  registerTxAdapterFactory('postgresql', createPostgresTxAdapter, true)
  registerAdapterFactory('postgresql', createPostgresAdapter, true)
  registerDestroyFactory('postgresql', createPostgreeDestroyAdapter, true)

  registerServerPlugins()
  registerStringLoaders()
}

export const dbConfig: FulltextDBConfiguration = {
  fulltextAdapter: {
    factory: createElasticAdapter,
    url: ''
  },
  contentAdapters: {
    Rekoni: {
      factory: async (url) => ({
        content: async () => ''
      }),
      contentType: '*',
      url: ''
    }
  },
  defaultContentAdapter: 'Rekoni'
}
