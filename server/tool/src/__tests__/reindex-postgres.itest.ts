//
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

/**
 * Migration reindex requests against the real postgres adapter: `_migrations` keeps them in the jsonb `data`
 * column, so the `plugin` filter and the `classes` field have to survive the round trip.
 */

import core, {
  DOMAIN_MIGRATION,
  Hierarchy,
  MeasureMetricsContext,
  ModelDb,
  type Class,
  type Doc,
  type Domain,
  type MigrationState,
  type Ref,
  type WorkspaceUuid
} from '@hcengineering/core'
import {
  createPostgresAdapter,
  getDBClient,
  shutdownPostgres,
  type PostgresClientReference
} from '@hcengineering/postgres'
import {
  workspaceEvents,
  type DbAdapter,
  type PlatformQueueProducer,
  type QueueWorkspaceMessage
} from '@hcengineering/server-core'
import { postgresUrl } from '@hcengineering/test-containers'

import { dropPendingReindex, reindexRequestPlugin, sendPendingReindex, type ReindexRequest } from '../reindex'
import { MigrateClientImpl } from '../upgrade'

jest.setTimeout(120000)

const task = 'task' as Domain
const chunter = 'chunter' as Domain
const classA = 'class:A' as Ref<Class<Doc>>
const classB = 'class:B' as Ref<Class<Doc>>

function withDatabase (uri: string, db: string): string {
  const u = new URL(uri)
  u.pathname = '/' + db
  return u.toString()
}

describe('migration reindex requests in postgres', () => {
  const ctx = new MeasureMetricsContext('reindex-postgres', {})
  let baseRef: PostgresClientReference
  let dbRef: PostgresClientReference | undefined
  let adapter: DbAdapter | undefined
  let ws: WorkspaceUuid
  let client: MigrateClientImpl
  let queue: { send: jest.Mock }

  async function requests (): Promise<ReindexRequest[]> {
    return await (adapter as DbAdapter).rawFindAll<ReindexRequest>(DOMAIN_MIGRATION, {
      _class: core.class.MigrationState,
      plugin: reindexRequestPlugin
    })
  }

  async function send (): Promise<QueueWorkspaceMessage[]> {
    return await sendPendingReindex(
      ctx,
      adapter as DbAdapter,
      queue as unknown as PlatformQueueProducer<QueueWorkspaceMessage>,
      ws
    )
  }

  beforeAll(async () => {
    baseRef = getDBClient(await postgresUrl())
  })

  afterAll(async () => {
    baseRef.close()
    await shutdownPostgres()
  })

  beforeEach(async () => {
    ws = crypto.randomUUID() as WorkspaceUuid
    const base = await baseRef.getClient()
    await base`CREATE DATABASE ${base(ws)}`
    const dbUri = withDatabase(await postgresUrl(), ws)

    // The adapter waits for the schema version db-migrator writes; a fresh database has none.
    dbRef = getDBClient(dbUri)
    const db = await dbRef.getClient()
    await db.unsafe('CREATE SCHEMA IF NOT EXISTS system')
    await db.unsafe('CREATE TABLE IF NOT EXISTS system._version (version INT)')
    await db.unsafe('INSERT INTO system._version (version) VALUES (100000)')

    const hierarchy = new Hierarchy()
    const wsIds = { uuid: ws, url: dbUri } as any
    adapter = await createPostgresAdapter(ctx, hierarchy, dbUri, wsIds, new ModelDb(hierarchy))
    await adapter.init?.(ctx, {}, [DOMAIN_MIGRATION])

    queue = { send: jest.fn().mockResolvedValue(undefined) }
    client = new MigrateClientImpl(
      { context: { lowLevelStorage: adapter } } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { uuid: ws } as any,
      ctx
    )
  })

  afterEach(async () => {
    await adapter?.close()
    dbRef?.close()
  })

  it('stored requests come back by plugin, with the classes of both migrations', async () => {
    await client.reindex(task, [classA])
    await client.reindex(task, [classB, classA])
    await client.reindex(chunter, [classB])

    const stored = await requests()

    expect(stored.map((it) => it.state).sort((a, b) => a.localeCompare(b))).toEqual(['chunter', 'task'])
    expect(stored.find((it) => it.state === 'task')?.classes).toEqual([classA, classB])
  })

  it('partial requests are sent with their classes and removed', async () => {
    await client.reindex(task, [classA, classB])

    const msgs = await send()

    expect(msgs).toEqual([workspaceEvents.reindex(task, [classA, classB])])
    expect(queue.send).toHaveBeenCalledWith(ctx, ws, msgs)
    expect(await requests()).toHaveLength(0)
  })

  it('a full request covers the partial ones and only the requests are removed', async () => {
    const state: MigrationState = {
      _id: 'core-state' as Ref<MigrationState>,
      _class: core.class.MigrationState,
      space: core.space.Configuration,
      modifiedBy: core.account.System,
      modifiedOn: Date.now(),
      plugin: 'core',
      state: 'some-migration'
    }
    await (adapter as DbAdapter).upload(ctx, DOMAIN_MIGRATION, [state])
    await client.reindex(task, [classA])
    await client.fullReindex()
    await client.fullReindex()

    expect(await send()).toEqual([workspaceEvents.fullReindex()])

    expect(await requests()).toHaveLength(0)
    const left = await (adapter as DbAdapter).rawFindAll<MigrationState>(DOMAIN_MIGRATION, {})
    expect(left.map((it) => it._id)).toEqual(['core-state'])
  })

  it('a failed send keeps the requests', async () => {
    await client.fullReindex()
    queue.send.mockRejectedValue(new Error('queue down'))

    await expect(send()).rejects.toThrow('queue down')

    expect(await requests()).toHaveLength(1)
  })

  it('drop removes the requests without sending', async () => {
    await client.reindex(task, [classA])
    await client.fullReindex()

    await dropPendingReindex(ctx, adapter as DbAdapter)

    expect(queue.send).not.toHaveBeenCalled()
    expect(await requests()).toHaveLength(0)
  })
})
