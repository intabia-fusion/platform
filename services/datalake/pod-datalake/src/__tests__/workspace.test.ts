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

import { type MeasureContext, type WorkspaceUuid } from '@hcengineering/core'
import { Readable } from 'stream'
import { type ConsumerMessage, type QueueWorkspaceMessage, QueueWorkspaceEvent } from '@hcengineering/server-core'

import { DatalakeImpl } from '../datalake/datalake'
import { type BlobDB, PostgresDB } from '../datalake/db'
import { type Datalake } from '../datalake/types'
import { handleWorkspaceMessage } from '../workspace'

const ctx = { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as MeasureContext
const workspace = 'ws-1' as WorkspaceUuid

function message (type: QueueWorkspaceEvent): ConsumerMessage<QueueWorkspaceMessage> {
  const value: QueueWorkspaceMessage = { type } as any
  const msg: ConsumerMessage<QueueWorkspaceMessage> = { workspace, value } as any
  return msg
}

describe('workspace deletion marks the blobs', () => {
  it('a Deleted event marks every blob of that workspace', async () => {
    const datalake = { deleteWorkspace: jest.fn() } as unknown as Datalake

    await handleWorkspaceMessage(ctx, datalake, message(QueueWorkspaceEvent.Deleted))

    expect(datalake.deleteWorkspace).toHaveBeenCalledWith(ctx, workspace)
  })

  it('leaves the blobs alone for every other workspace event', async () => {
    const datalake = { deleteWorkspace: jest.fn() } as unknown as Datalake

    for (const type of [
      QueueWorkspaceEvent.Created,
      QueueWorkspaceEvent.Archived,
      QueueWorkspaceEvent.Restored,
      QueueWorkspaceEvent.ClearIndex
    ]) {
      await handleWorkspaceMessage(ctx, datalake, message(type))
    }

    expect(datalake.deleteWorkspace).not.toHaveBeenCalled()
  })

  it('marks through the db instead of dropping rows: the files survive for a later sweep', async () => {
    const db = { deleteWorkspaceBlobs: jest.fn() } as unknown as BlobDB
    const datalake = new DatalakeImpl(db, [], { send: jest.fn() } as any, {
      cacheControl: '',
      cache: { enabled: false } as any
    })

    await datalake.deleteWorkspace(ctx, workspace)

    expect(db.deleteWorkspaceBlobs).toHaveBeenCalledWith(ctx, workspace)
  })

  it('the mark is a soft delete of the live rows only', async () => {
    const queries: string[] = []
    const sql = {
      unsafe: async (query: string) => {
        queries.push(query)
        return []
      }
    }
    const db = new (PostgresDB as any)(sql) as PostgresDB

    await db.deleteWorkspaceBlobs(ctx, workspace)

    expect(queries).toHaveLength(1)
    const query = queries[0].replace(/\s+/g, ' ')
    expect(query).toContain('UPDATE blob.blob')
    expect(query).toContain('SET deleted_at = now()')
    // Rows only: dropping them would lose the names the sweep needs to find the files.
    expect(query).not.toMatch(/DELETE FROM/i)
    expect(query).toContain('deleted_at IS NULL')
    expect(query).toContain(workspace)
  })
})

describe('a marked blob stops being served', () => {
  const name = 'note.txt'
  const record = {
    workspace,
    name,
    hash: 'h1',
    location: 'eu',
    parent: null,
    filename: 'f1',
    size: 4,
    type: 'text/plain'
  }

  function datalakeWith (getBlob: jest.Mock): DatalakeImpl {
    const bucket = {
      get: async () => ({
        body: Readable.from(Buffer.from('data')),
        size: 4,
        etag: 'h1',
        contentType: 'text/plain',
        lastModified: 0
      }),
      head: async () => ({ size: 4, etag: 'h1', contentType: 'text/plain', lastModified: 0 })
    }
    const db = { getBlob } as unknown as BlobDB
    return new DatalakeImpl(db, [{ location: 'eu', bucket }] as any, { send: jest.fn() } as any, {
      cacheControl: '',
      cache: { enabled: true, blobSize: 1024, blobCount: 10 } as any
    })
  }

  it('is not served once the row carries deleted_at - not even out of the cache', async () => {
    const getBlob = jest.fn().mockResolvedValue(record)
    const datalake = datalakeWith(getBlob)

    // Warm the cache with a live blob first, otherwise the check below proves nothing.
    expect(await datalake.get(ctx, workspace, name, {})).not.toBeNull()

    // The workspace is purged: `getBlob` filters on deleted_at, so the row is gone from its view.
    getBlob.mockResolvedValue(null)
    expect(await datalake.get(ctx, workspace, name, {})).toBeNull()
    expect(await datalake.head(ctx, workspace, name)).toBeNull()
  })
})
