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

import { createHash, randomUUID } from 'crypto'
import { MeasureMetricsContext, type StorageCleanupResult, type WorkspaceUuid } from '@hcengineering/core'
import { minioConfig, postgresUrl } from '@hcengineering/test-containers'
import postgres, { type Sql } from 'postgres'
import { PostgresDB } from '../datalake/db'
import { DatalakeImpl } from '../datalake/datalake'
import { digestToUUID } from '../datalake/encodings'
import { type UUID } from '../datalake/types'
import { createBucket, createClient, type S3Bucket } from '../s3'
import { StorageCleanup } from '../cleanup'

jest.setTimeout(120000)

// Every object and database row belongs to these disposable testcontainers, never to a configured platform workspace.
describe('storage cleanup with Postgres and S3', () => {
  const ctx = new MeasureMetricsContext('cleanup-test', {})
  const workspace = 'cleanup-ws' as WorkspaceUuid
  let sql: Sql
  let db: PostgresDB
  let bucket: S3Bucket
  let cleanup: StorageCleanup
  let datalake: DatalakeImpl
  const producer: any = { send: jest.fn() }
  const body = Buffer.from('synthetic cleanup object')
  let sequence = 0

  beforeAll(async () => {
    sql = postgres(await postgresUrl(), {
      max: 8,
      onnotice: () => {},
      types: { int8: { to: 20, from: [20], serialize: String, parse: Number } }
    })
    await sql`CREATE SCHEMA IF NOT EXISTS global_account`
    await sql`CREATE TABLE IF NOT EXISTS global_account.workspace (uuid uuid, data_id text)`
    db = await PostgresDB.create(ctx, sql)
    const storage = await minioConfig()
    bucket = await createBucket(
      ctx,
      createClient({
        endpoint: `http://${storage.endPoint}:${storage.port}`,
        accessKey: storage.accessKey,
        secretKey: storage.secretKey
      }),
      'cleanup-' + randomUUID()
    )
    cleanup = new StorageCleanup(db, [{ location: 'eu', bucket }])
    datalake = new DatalakeImpl(db, [{ location: 'eu', bucket }], producer, {
      cacheControl: '',
      cache: { enabled: false, blobSize: 0, blobCount: 0 }
    })
  })

  afterAll(async () => {
    await sql?.end()
  })

  beforeEach(async () => {
    await sql`TRUNCATE blob.meta, blob.blob, blob.data, blob.cleanup_candidate, blob.cleanup_job CASCADE`
    jest.restoreAllMocks()
  })

  async function seed (name = 'file'): Promise<{ hash: UUID, filename: string, location: 'eu' }> {
    const hash = digestToUUID(createHash('sha256').update(body).digest('hex'))
    await bucket.put(ctx, hash, body, {
      contentLength: body.length,
      contentType: 'text/plain',
      cacheControl: '',
      lastModified: Date.now()
    })
    await db.createBlobData(ctx, {
      workspace,
      name,
      hash,
      location: 'eu',
      filename: hash,
      size: body.length,
      type: 'text/plain'
    })
    await db.deleteBlob(ctx, { workspace, name })
    return { hash, filename: hash, location: 'eu' }
  }

  async function scan (): Promise<StorageCleanupResult> {
    return await cleanup.handle(ctx, { jobId: 'scan-' + sequence++, action: 'scan', requestedAt: 0 })
  }

  async function remove (scanId: string, jobId = 'delete-' + sequence++): Promise<StorageCleanupResult> {
    return await cleanup.handle(ctx, { jobId, action: 'delete', scanId, requestedAt: 0 })
  }

  it('deletes metadata before refs and data, counts each physical object once on replay', async () => {
    const data = await seed()
    await db.setMeta(ctx, { workspace, name: 'file' }, { preview: 'synthetic' })
    const snapshot = await scan()
    expect(snapshot.summary?.objects).toBe(1)
    expect(snapshot.summary?.byType).toEqual([{ contentType: 'text/plain', count: 1, bytes: body.length }])
    const result = await remove(snapshot.jobId, 'delete-replay')
    expect(result).toMatchObject({ status: 'completed', deletedCount: 1, deletedBytes: body.length })
    expect(await bucket.head(ctx, data.filename)).toBeNull()
    expect(await db.getData(ctx, data)).toBeNull()
    expect(await sql`SELECT * FROM blob.meta`).toHaveLength(0)
    expect(await remove(snapshot.jobId, 'delete-replay')).toEqual(result)
  })

  it('keeps counters stable when the same delete job runs concurrently', async () => {
    await seed()
    const snapshot = await scan()
    const results = await Promise.all([
      remove(snapshot.jobId, 'concurrent-delete'),
      remove(snapshot.jobId, 'concurrent-delete')
    ])
    expect(results[0]).toMatchObject({ deletedCount: 1, deletedBytes: body.length })
    expect(results[1]).toMatchObject({ deletedCount: 1, deletedBytes: body.length })
  })

  it('keeps an object with an active reference in another workspace, including changes after the snapshot', async () => {
    const data = await seed()
    const snapshot = await scan()
    await db.withDataLock(ctx, data, async (locked) => {
      await locked.createBlob(ctx, { ...data, workspace: 'other-workspace', name: 'shared' })
    })
    expect(await remove(snapshot.jobId)).toMatchObject({ deletedCount: 0, skippedCount: 1 })
    expect(await bucket.head(ctx, data.filename)).not.toBeNull()
  })

  it('includes fresh soft-deleted refs and unreferenced data immediately', async () => {
    await seed()
    const orphan = randomUUID() as UUID
    await db.createData(ctx, { hash: orphan, location: 'eu', filename: orphan, size: 1, type: 'text/plain' })
    const snapshot = await scan()
    expect(snapshot.summary?.objects).toBe(2)
    expect(snapshot.summary?.bytes).toBe(body.length + 1)
  })

  it('keeps parents with active descendants and never invokes the parent cascade', async () => {
    const data = await seed('parent')
    const child = randomUUID() as UUID
    await db.createBlobData(ctx, {
      workspace,
      name: 'child',
      parent: 'parent',
      hash: child,
      location: 'eu',
      filename: child,
      size: 1,
      type: 'text/plain'
    })
    const snapshot = await scan()
    expect(snapshot.summary?.objects).toBe(0)
    expect(await db.getBlob(ctx, { workspace, name: 'child' })).not.toBeNull()
    expect(await bucket.head(ctx, data.filename)).not.toBeNull()
  })

  it('serializes a deduplicated upload with GC and rechecks its new reference', async () => {
    const data = await seed()
    const snapshot = await scan()
    let release!: () => void
    let entered!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const acquired = new Promise<void>((resolve) => {
      entered = resolve
    })
    const upload = db.withDataLock(ctx, data, async (locked) => {
      entered()
      await held
      await locked.createBlob(ctx, { ...data, workspace, name: 'reused' })
    })
    await acquired
    const deletion = remove(snapshot.jobId)
    release()
    await upload
    expect(await deletion).toMatchObject({ deletedCount: 0, skippedCount: 1 })
    expect(await db.getBlob(ctx, { workspace, name: 'reused' })).not.toBeNull()
    expect(await bucket.head(ctx, data.filename)).not.toBeNull()
  })

  it('serializes different content identities that share the same physical S3 key', async () => {
    const data = await seed()
    let release!: () => void
    let entered!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const acquired = new Promise<void>((resolve) => {
      entered = resolve
    })
    const first = db.withDataLock(
      ctx,
      data,
      async () => {
        entered()
        await held
      },
      data.filename
    )
    await acquired
    const visited = jest.fn()
    const second = db.withDataLock(
      ctx,
      { hash: randomUUID() as UUID, location: 'eu' },
      async () => {
        visited()
      },
      data.filename
    )
    await new Promise<void>((resolve) => setImmediate(resolve))
    expect(visited).not.toHaveBeenCalled()
    release()
    await Promise.all([first, second])
    expect(visited).toHaveBeenCalledTimes(1)
  })

  it('retains the intent when a child appears after a crash already removed S3', async () => {
    await seed('parent')
    const snapshot = await scan()
    const originalDelete = bucket.delete.bind(bucket)
    const deletion = jest.spyOn(bucket, 'delete').mockImplementationOnce(async (ctx, filename, signal) => {
      await originalDelete(ctx, filename, signal)
      throw new Error('simulated crash')
    })
    await expect(remove(snapshot.jobId, 'changed-after-crash')).rejects.toThrow('simulated crash')
    deletion.mockRestore()
    const child = randomUUID() as UUID
    await db.createBlobData(ctx, {
      workspace,
      name: 'child',
      parent: 'parent',
      hash: child,
      location: 'eu',
      filename: child,
      size: 1,
      type: 'text/plain'
    })
    await expect(remove(snapshot.jobId, 'changed-after-crash')).rejects.toThrow('deletion intent retained')
    expect(await sql`SELECT state FROM blob.cleanup_candidate WHERE scan_id = ${snapshot.jobId}`).toEqual([
      { state: 'deleting' }
    ])
    await expect(
      datalake.put(ctx, workspace, 'restored', createHash('sha256').update(body).digest('hex'), body, {
        size: body.length,
        contentType: 'text/plain',
        lastModified: Date.now()
      })
    ).rejects.toThrow('cleanup is in progress')
    expect(await db.getBlob(ctx, { workspace, name: 'child' })).not.toBeNull()
  })

  it('preserves a durable deletion intent after S3 success and retries without letting dedup restore missing content', async () => {
    const data = await seed()
    const snapshot = await scan()
    const originalDelete = bucket.delete.bind(bucket)
    const deletion = jest.spyOn(bucket, 'delete').mockImplementationOnce(async (ctx, filename, signal) => {
      await originalDelete(ctx, filename, signal)
      throw new Error('simulated crash after S3 success')
    })
    await expect(remove(snapshot.jobId, 'crash-retry')).rejects.toThrow('simulated crash')
    expect(await db.getData(ctx, data)).not.toBeNull()
    expect(await sql`SELECT state FROM blob.cleanup_candidate WHERE scan_id = ${snapshot.jobId}`).toEqual([
      { state: 'deleting' }
    ])
    const digest = createHash('sha256').update(body).digest('hex')
    await expect(
      datalake.put(ctx, workspace, 'restored', digest, body, {
        size: body.length,
        contentType: 'text/plain',
        lastModified: Date.now()
      })
    ).rejects.toThrow('cleanup is in progress')
    await bucket.put(ctx, data.filename, body, {
      contentLength: body.length,
      contentType: 'text/plain',
      cacheControl: '',
      lastModified: Date.now()
    })
    await expect(datalake.create(ctx, workspace, 'restored', data.filename)).rejects.toThrow('cleanup is in progress')
    deletion.mockRestore()
    expect(await remove(snapshot.jobId, 'crash-retry')).toMatchObject({ deletedCount: 1, deletedBytes: body.length })
  })
})
