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

import { type MeasureContext, type StorageCleanupSummary } from '@hcengineering/core'
import { type BlobDB, type BlobDataRecord } from './datalake/db'
import { type Location } from './datalake'
import { type S3Bucket } from './s3'

// Parent rows stay until a later scan after their children are physically gone: never invoke FK cascade.
const eligible = `
  NOT EXISTS (SELECT 1 FROM blob.blob r WHERE r.hash = d.hash AND r.location = d.location AND r.deleted_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM blob.blob r JOIN blob.blob child
    ON child.workspace = r.workspace AND child.parent = r.name
    WHERE r.hash = d.hash AND r.location = d.location)
  AND NOT EXISTS (SELECT 1 FROM blob.data other WHERE other.location = d.location
    AND other.filename = d.filename AND other.hash <> d.hash)`

export async function getStorageCleanupSummary (db: BlobDB): Promise<StorageCleanupSummary> {
  const byType = await db.execute<Array<{ contentType: string, count: number, bytes: number }>>(
    `SELECT d.type AS "contentType", count(*)::bigint AS count, coalesce(sum(d.size), 0)::bigint AS bytes
     FROM blob.data d WHERE ${eligible} GROUP BY d.type ORDER BY d.type`
  )
  return {
    objects: byType.reduce((sum, row) => sum + row.count, 0),
    bytes: byType.reduce((sum, row) => sum + row.bytes, 0),
    byType
  }
}

export async function cleanupDatalake (
  ctx: MeasureContext,
  db: BlobDB,
  buckets: Array<{ location: Location, bucket: S3Bucket }>
): Promise<{ objects: number, bytes: number }> {
  const locations = await db.execute<Array<{ location: Location }>>('SELECT DISTINCT location FROM blob.data')
  for (const { location } of locations) {
    if (!buckets.some((entry) => entry.location === location)) {
      throw new Error(`Datalake location ${location} is not configured`)
    }
  }
  const result = { objects: 0, bytes: 0 }
  while (true) {
    const objects = await db.execute<BlobDataRecord[]>(
      `SELECT d.hash, d.location, d.filename, d.size FROM blob.data d WHERE ${eligible} ORDER BY d.location, d.hash LIMIT 100`
    )
    if (objects.length === 0) return result
    for (const object of objects) {
      const bucket = buckets.find((entry) => entry.location === object.location)
      if (bucket === undefined) throw new Error(`Datalake location ${object.location} is not configured`)
      try {
        await bucket.bucket.delete(ctx, object.filename)
      } catch (error) {
        if (!(error instanceof Error) || error.name !== 'NoSuchKey') throw error
      }
      await db.removeData(ctx, object)
      result.objects++
      result.bytes += object.size
    }
  }
}
