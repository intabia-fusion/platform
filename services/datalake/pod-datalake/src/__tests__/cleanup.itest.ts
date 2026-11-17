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

import { randomUUID } from 'crypto'
import { MeasureMetricsContext } from '@hcengineering/core'
import { postgresUrl } from '@hcengineering/test-containers'
import postgres, { type Sql } from 'postgres'
import { PostgresDB } from '../datalake/db'
import { cleanupDatalake, getStorageCleanupSummary } from '../cleanup'
import { type UUID } from '../datalake/types'

jest.setTimeout(120000)

describe('storage cleanup estimate', () => {
  const ctx = new MeasureMetricsContext('cleanup-test', {})
  let sql: Sql
  let admin: Sql
  let db: PostgresDB
  const database = randomUUID()

  beforeAll(async () => {
    const url = new URL(await postgresUrl())
    admin = postgres(url.toString(), { max: 1, onnotice: () => {} })
    await admin`CREATE DATABASE ${admin(database)}`
    url.pathname = `/${database}`
    sql = postgres(url.toString(), {
      max: 8,
      onnotice: () => {},
      types: { int8: { to: 20, from: [20], serialize: String, parse: Number } }
    })
    await sql`CREATE SCHEMA IF NOT EXISTS global_account`
    await sql`CREATE TABLE IF NOT EXISTS global_account.workspace (uuid uuid, data_id text)`
    db = await PostgresDB.create(ctx, sql)
  })
  afterAll(async () => {
    await sql?.end()
    if (admin !== undefined) {
      await admin`DROP DATABASE IF EXISTS ${admin(database)}`
      await admin.end()
    }
  })
  beforeEach(async () => {
    await sql`TRUNCATE blob.meta, blob.blob, blob.data CASCADE`
  })

  it('counts only globally unreferenced data without children or shared filenames', async () => {
    const free = randomUUID() as UUID
    const active = randomUUID() as UUID
    const parent = randomUUID() as UUID
    const child = randomUUID() as UUID
    const shared1 = randomUUID() as UUID
    const shared2 = randomUUID() as UUID
    await db.createData(ctx, { hash: free, location: 'eu', filename: free, size: 5, type: 'text/plain' })
    await db.createBlobData(ctx, {
      workspace: 'ws',
      name: 'active',
      hash: active,
      location: 'eu',
      filename: active,
      size: 10,
      type: 'text/plain'
    })
    await db.createBlobData(ctx, {
      workspace: 'ws',
      name: 'parent',
      hash: parent,
      location: 'eu',
      filename: parent,
      size: 10,
      type: 'text/plain'
    })
    await db.createBlobData(ctx, {
      workspace: 'ws',
      name: 'child',
      parent: 'parent',
      hash: child,
      location: 'eu',
      filename: child,
      size: 10,
      type: 'text/plain'
    })
    await db.deleteBlob(ctx, { workspace: 'ws', name: 'parent' })
    await db.createData(ctx, { hash: shared1, location: 'eu', filename: 'shared', size: 2, type: 'text/plain' })
    await db.createData(ctx, { hash: shared2, location: 'eu', filename: 'shared', size: 2, type: 'text/plain' })
    const result = await getStorageCleanupSummary(db)
    expect(result).toEqual({ objects: 2, bytes: 15, byType: [{ contentType: 'text/plain', count: 2, bytes: 15 }] })
    expect(await getStorageCleanupSummary(db)).toEqual(result)
  })

  it('rolls back all metadata when data deletion fails, then completes on retry', async () => {
    const hash = randomUUID() as UUID
    await db.createBlobData(ctx, {
      workspace: 'ws',
      name: 'removed',
      hash,
      location: 'eu',
      filename: hash,
      size: 7,
      type: 'text/plain'
    })
    await db.setMeta(ctx, { workspace: 'ws', name: 'removed' }, { key: 'value' })
    await db.deleteBlob(ctx, { workspace: 'ws', name: 'removed' })
    await sql`CREATE TABLE blob.cleanup_blocker (hash uuid, location varchar(10), FOREIGN KEY (hash, location) REFERENCES blob.data (hash, location))`
    await sql`INSERT INTO blob.cleanup_blocker VALUES (${hash}, 'eu')`
    const remove = jest.fn().mockResolvedValue(undefined)
    const buckets = [{ location: 'eu', bucket: { delete: remove } }] as any
    try {
      await expect(cleanupDatalake(ctx, db, buckets)).rejects.toThrow()
      expect(await sql`SELECT * FROM blob.meta WHERE name = 'removed'`).toHaveLength(1)
      expect(await sql`SELECT * FROM blob.blob WHERE name = 'removed'`).toHaveLength(1)
      expect(await sql`SELECT * FROM blob.data WHERE hash = ${hash}`).toHaveLength(1)
    } finally {
      await sql`DROP TABLE blob.cleanup_blocker`
    }
    await expect(cleanupDatalake(ctx, db, buckets)).resolves.toEqual({ objects: 1, bytes: 7 })
    expect(await sql`SELECT * FROM blob.meta WHERE name = 'removed'`).toHaveLength(0)
    expect(await sql`SELECT * FROM blob.blob WHERE name = 'removed'`).toHaveLength(0)
    expect(await sql`SELECT * FROM blob.data WHERE hash = ${hash}`).toHaveLength(0)
    expect(remove).toHaveBeenCalledTimes(2)
  })
})
