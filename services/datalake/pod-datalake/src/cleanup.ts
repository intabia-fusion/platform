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

import {
  type MeasureContext,
  type StorageCleanupCommand,
  type StorageCleanupResult,
  type StorageCleanupSummary,
  type WorkspaceUuid
} from '@hcengineering/core'
import { type ConsumerHandle, type PlatformQueue, QueueTopic } from '@hcengineering/server-core'
import { type BlobDB, type BlobDataRecord } from './datalake/db'
import { type UUID, type Location } from './datalake/types'
import { type S3Bucket } from './s3'

// Parent rows stay until a later scan after their children are physically gone: never invoke FK cascade.
const eligible = `
  NOT EXISTS (SELECT 1 FROM blob.blob r WHERE r.hash = d.hash AND r.location = d.location AND r.deleted_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM blob.blob r JOIN blob.blob child
    ON child.workspace = r.workspace AND child.parent = r.name
    WHERE r.hash = d.hash AND r.location = d.location)
  AND NOT EXISTS (SELECT 1 FROM blob.data other WHERE other.location = d.location
    AND other.filename = d.filename AND other.hash <> d.hash)`

interface CleanupJob {
  id: string
  action: string
  scan_id: string | null
  status: string
  result: StorageCleanupResult | null
}

interface Candidate extends BlobDataRecord {
  state: string
  delete_job: string | null
}

export class StorageCleanup {
  constructor (
    private readonly db: BlobDB,
    private readonly buckets: Array<{ location: Location, bucket: S3Bucket }>
  ) {}

  async handle (ctx: MeasureContext, command: StorageCleanupCommand): Promise<StorageCleanupResult> {
    if (
      typeof command.jobId !== 'string' ||
      command.jobId.length === 0 ||
      command.jobId.length > 200 ||
      !['scan', 'delete'].includes(command.action)
    ) {
      throw new Error('Invalid cleanup command')
    }
    const job = await this.db.withDataLock(ctx, { hash: command.jobId as UUID, location: 'eu' }, async (db) => {
      const existing = await db.execute<CleanupJob[]>('SELECT * FROM blob.cleanup_job WHERE id = $1', [command.jobId])
      if (existing.length > 0) {
        if (existing[0].action !== command.action || existing[0].scan_id !== (command.scanId ?? null)) {
          throw new Error('Cleanup job identifier already belongs to another request')
        }
        return existing[0]
      }
      const rows = await db.execute<CleanupJob[]>(
        `INSERT INTO blob.cleanup_job(id, action, scan_id, status)
        VALUES ($1, $2, $3, 'running') RETURNING *`,
        [command.jobId, command.action, command.scanId ?? null]
      )
      return rows[0]
    })
    if (job.result !== null) return job.result
    if (command.action === 'scan') return await this.scan(ctx, job)
    return await this.delete(ctx, job)
  }

  private async scan (ctx: MeasureContext, job: CleanupJob): Promise<StorageCleanupResult> {
    return await this.db.withDataLock(ctx, { hash: job.id as UUID, location: 'eu' }, async (db) => {
      const ready = await db.execute<CleanupJob[]>('SELECT * FROM blob.cleanup_job WHERE id = $1', [job.id])
      if (ready[0].result !== null) return ready[0].result
      await db.execute(
        `INSERT INTO blob.cleanup_candidate(scan_id, hash, location, filename, size, type)
        SELECT $1, d.hash, d.location, d.filename, d.size, d.type FROM blob.data d WHERE ${eligible}
        ON CONFLICT DO NOTHING`,
        [job.id]
      )
      const byType = await db.execute<Array<{ contentType: string, count: number, bytes: number }>>(
        `
        SELECT type AS "contentType", count(*)::bigint AS count, coalesce(sum(size), 0)::bigint AS bytes
        FROM blob.cleanup_candidate WHERE scan_id = $1 GROUP BY type ORDER BY type`,
        [job.id]
      )
      const summary: StorageCleanupSummary = {
        objects: byType.reduce((sum, row) => sum + row.count, 0),
        bytes: byType.reduce((sum, row) => sum + row.bytes, 0),
        byType
      }
      const result: StorageCleanupResult = { jobId: job.id, status: 'ready', summary }
      await this.saveResult(db, result)
      return result
    })
  }

  private async delete (ctx: MeasureContext, job: CleanupJob): Promise<StorageCleanupResult> {
    const scan = await this.db.execute<CleanupJob[]>(
      `SELECT * FROM blob.cleanup_job
      WHERE id = $1 AND action = 'scan' AND status = 'ready'`,
      [job.scan_id]
    )
    if (scan.length === 0) {
      const result: StorageCleanupResult = { jobId: job.id, status: 'failed', error: 'Ready cleanup scan not found' }
      await this.saveResult(this.db, result)
      return result
    }
    // A snapshot limits what was approved; eligibility is checked again under the upload lock.
    let cursor = ''
    while (true) {
      const candidates = await this.db.execute<Candidate[]>(
        `SELECT * FROM blob.cleanup_candidate WHERE scan_id = $1
        AND state IN ('pending', 'deleting') AND location || ':' || hash::text > $2
        ORDER BY location || ':' || hash::text LIMIT 500`,
        [job.scan_id, cursor]
      )
      if (candidates.length === 0) break
      for (const candidate of candidates) await this.deleteCandidate(ctx, job, scan[0], candidate)
      const last = candidates[candidates.length - 1]
      cursor = last.location + ':' + last.hash
    }
    const counters = await this.db.execute<Array<{ deletedCount: number, deletedBytes: number, skippedCount: number }>>(
      `
      SELECT count(*) FILTER (WHERE state = 'deleted' AND delete_job = $2)::bigint AS "deletedCount",
        coalesce(sum(size) FILTER (WHERE state = 'deleted' AND delete_job = $2), 0)::bigint AS "deletedBytes",
        count(*) FILTER (WHERE state = 'skipped' OR delete_job IS DISTINCT FROM $2)::bigint AS "skippedCount"
      FROM blob.cleanup_candidate WHERE scan_id = $1`,
      [job.scan_id, job.id]
    )
    const result: StorageCleanupResult = { jobId: job.id, status: 'completed', ...counters[0] }
    await this.saveResult(this.db, result)
    return result
  }

  private async deleteCandidate (
    ctx: MeasureContext,
    job: CleanupJob,
    scan: CleanupJob,
    candidate: Candidate
  ): Promise<void> {
    const bucket = this.buckets.find((entry) => entry.location === candidate.location)?.bucket
    if (bucket === undefined) throw new Error('Cleanup storage location is not configured')
    const claimed = await this.db.withDataLock(
      ctx,
      candidate,
      async (db) => {
        const rows = await db.execute(
          `UPDATE blob.cleanup_candidate SET state = 'deleting', delete_job = $4
        WHERE scan_id = $1 AND hash = $2 AND location = $3 AND state IN ('pending', 'deleting')
        AND (delete_job IS NULL OR delete_job = $4) RETURNING hash`,
          [scan.id, candidate.hash, candidate.location, job.id]
        )
        return rows.length > 0
      },
      candidate.filename
    )
    if (!claimed) return
    await this.db.withDataLock(
      ctx,
      candidate,
      async (db) => {
        const state = await db.execute(
          `SELECT state FROM blob.cleanup_candidate
        WHERE scan_id = $1 AND hash = $2 AND location = $3 AND state = 'deleting' AND delete_job = $4`,
          [scan.id, candidate.hash, candidate.location, job.id]
        )
        if (state.length === 0) return
        const physical = await db.execute('SELECT hash FROM blob.data WHERE hash = $1 AND location = $2 FOR UPDATE', [
          candidate.hash,
          candidate.location
        ])
        await db.execute('SELECT name FROM blob.blob WHERE hash = $1 AND location = $2 FOR UPDATE', [
          candidate.hash,
          candidate.location
        ])
        const allowed = await db.execute(
          `SELECT d.hash FROM blob.data d WHERE ${eligible}
        AND d.hash = $1 AND d.location = $2 AND d.filename = $3 AND d.size = $4`,
          [candidate.hash, candidate.location, candidate.filename, candidate.size]
        )
        if (allowed.length === 0) {
          // A crashed delete may have removed S3 already; never reopen dedup onto a missing object.
          if (physical.length > 0 && (await bucket.head(ctx, candidate.filename, AbortSignal.timeout(5000))) === null) {
            throw new Error('Cleanup object changed after S3 deletion; deletion intent retained')
          }
          await db.execute(
            `UPDATE blob.cleanup_candidate SET state = 'skipped'
          WHERE scan_id = $1 AND hash = $2 AND location = $3`,
            [scan.id, candidate.hash, candidate.location]
          )
          return
        }
        await bucket.delete(ctx, candidate.filename, AbortSignal.timeout(5000))
        await db.execute(
          `DELETE FROM blob.meta m USING blob.blob r WHERE m.workspace = r.workspace AND m.name = r.name
        AND r.hash = $1 AND r.location = $2`,
          [candidate.hash, candidate.location]
        )
        await db.execute('DELETE FROM blob.blob WHERE hash = $1 AND location = $2', [
          candidate.hash,
          candidate.location
        ])
        await db.execute('DELETE FROM blob.data WHERE hash = $1 AND location = $2', [
          candidate.hash,
          candidate.location
        ])
        await db.execute(
          `UPDATE blob.cleanup_candidate SET state = 'deleted'
        WHERE scan_id = $1 AND hash = $2 AND location = $3`,
          [scan.id, candidate.hash, candidate.location]
        )
      },
      candidate.filename
    )
  }

  private async saveResult (db: BlobDB, result: StorageCleanupResult): Promise<void> {
    await db.execute('UPDATE blob.cleanup_job SET status = $2, result = $3::jsonb WHERE id = $1', [
      result.jobId,
      result.status,
      JSON.stringify(result)
    ])
  }
}

export function createStorageCleaner (
  ctx: MeasureContext,
  queue: PlatformQueue,
  cleanup: StorageCleanup
): ConsumerHandle {
  const producer = queue.getProducer<StorageCleanupResult>(ctx, QueueTopic.StorageCleanupResults)
  const consumer = queue.createConsumer<StorageCleanupCommand>(
    ctx,
    QueueTopic.StorageCleanup,
    'datalake-storage-cleanup',
    async (ctx, message, control) => {
      const heartbeat = setInterval(() => {
        void control.heartbeat().catch((err) => {
          ctx.error('Cleanup heartbeat failed', { err })
        })
      }, 10000)
      try {
        const result = await cleanup.handle(ctx, message.value)
        await producer.send(ctx, '00000000-0000-0000-0000-000000000000' as WorkspaceUuid, [result])
      } finally {
        clearInterval(heartbeat)
      }
    },
    { fromBegining: true, sessionTimeout: 120000 }
  )
  return {
    ...consumer,
    close: async () => {
      await consumer.close()
      await producer.close()
    }
  }
}
