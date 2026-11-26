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

import { type Sql } from 'postgres'
import { ApiError } from '../error'

/** Revisions are positive safe integers assigned by the trusted publisher, not by browsers. */
export class PublicFileAccess {
  constructor (private readonly sql: Sql) {}

  async replace (workspace: string, linkId: string, revision: number, blobs: string[]): Promise<void> {
    await this.update(
      workspace,
      linkId,
      revision,
      [...new Set(blobs)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    )
  }

  async revoke (workspace: string, linkId: string, revision: number): Promise<void> {
    await this.update(workspace, linkId, revision, null)
  }

  private async update (workspace: string, linkId: string, revision: number, blobs: string[] | null): Promise<void> {
    if (!Number.isSafeInteger(revision) || revision < 1) throw new ApiError(400, 'Invalid revision')
    await this.sql.begin(async (tx) => {
      await tx`INSERT INTO blob.public_link (workspace, link_id, revision, revoked)
        VALUES (${workspace}, ${linkId}, 0, false) ON CONFLICT DO NOTHING`
      const [link] = await tx<{ revision: string, revoked: boolean }[]>`SELECT revision, revoked FROM blob.public_link
        WHERE workspace = ${workspace} AND link_id = ${linkId} FOR UPDATE`
      // A link id cannot be republished after revoke. Revoke wins regardless of delivery order.
      if (blobs === null) {
        await tx`DELETE FROM blob.public_link_file WHERE workspace = ${workspace} AND link_id = ${linkId}`
        await tx`UPDATE blob.public_link SET revision = GREATEST(revision, ${revision}), revoked = true
          WHERE workspace = ${workspace} AND link_id = ${linkId}`
        return
      }
      if (Number(link.revision) > revision || link.revoked) {
        throw new ApiError(409, 'Stale revision or revoked link')
      }
      if (Number(link.revision) === revision) {
        const current = await tx`SELECT blob_id FROM blob.public_link_file
          WHERE workspace = ${workspace} AND link_id = ${linkId} ORDER BY blob_id`
        if (
          JSON.stringify(current.map((row) => row.blob_id).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) !==
          JSON.stringify(blobs)
        ) {
          throw new ApiError(409, 'Revision already used')
        }
        return
      }
      await tx`DELETE FROM blob.public_link_file WHERE workspace = ${workspace} AND link_id = ${linkId}`
      if (blobs.length > 0) {
        await tx`INSERT INTO blob.public_link_file ${tx(
          blobs.map((blobId) => ({
            workspace,
            link_id: linkId,
            blob_id: blobId
          }))
        )}`
      }
      await tx`UPDATE blob.public_link SET revision = ${revision}, revoked = false
        WHERE workspace = ${workspace} AND link_id = ${linkId}`
    })
  }

  async state (workspace: string, linkId: string): Promise<{ revision: number, revoked: boolean, blobs: string[] }> {
    const [row] = await this.sql`SELECT l.revision, l.revoked,
      COALESCE(jsonb_agg(f.blob_id ORDER BY f.blob_id) FILTER (WHERE f.blob_id IS NOT NULL), '[]'::jsonb) AS blobs
      FROM blob.public_link l LEFT JOIN blob.public_link_file f
      ON l.workspace = f.workspace AND l.link_id = f.link_id
      WHERE l.workspace = ${workspace} AND l.link_id = ${linkId}
      GROUP BY l.revision, l.revoked`
    return row === undefined
      ? { revision: 0, revoked: false, blobs: [] }
      : { revision: Number(row.revision), revoked: row.revoked, blobs: row.blobs }
  }

  async activeLinks (workspace: string, after: string): Promise<string[]> {
    const rows = await this.sql`SELECT link_id FROM blob.public_link
      WHERE workspace = ${workspace} AND NOT revoked AND link_id > ${after} ORDER BY link_id LIMIT 10`
    return rows.map((row) => row.link_id as string)
  }

  async canRead (workspace: string, linkId: string, blobId: string): Promise<boolean> {
    const rows = await this.sql`SELECT 1 FROM blob.public_link_file f JOIN blob.public_link l
      ON l.workspace = f.workspace AND l.link_id = f.link_id
      WHERE f.workspace = ${workspace} AND f.link_id = ${linkId} AND f.blob_id = ${blobId} AND NOT l.revoked
      AND NOT EXISTS (SELECT 1 FROM blob.public_workspace_access w WHERE w.workspace = f.workspace AND NOT w.available)`
    return rows.length > 0
  }

  async setWorkspaceAvailable (workspace: string, available: boolean): Promise<void> {
    await this.sql`INSERT INTO blob.public_workspace_access (workspace, available) VALUES (${workspace}, ${available})
      ON CONFLICT (workspace) DO UPDATE SET available = EXCLUDED.available`
  }
}
