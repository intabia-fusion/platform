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

import { MeasureMetricsContext, type WorkspaceIds } from '@hcengineering/core'
import type { StorageAdapter } from '@hcengineering/server-core'
import { Readable } from 'node:stream'
import { BlobClient } from './blob'

function collector (): { chunks: Buffer[], writable: any } {
  const chunks: Buffer[] = []
  return {
    chunks,
    writable: {
      write: (buffer: Buffer, cb: (err?: any) => void) => {
        chunks.push(buffer)
        cb()
      },
      end: (cb: () => void) => {
        cb()
      }
    }
  }
}

function clientWith (partial: StorageAdapter['partial']): BlobClient {
  const adapter = { partial } as unknown as StorageAdapter
  const workspace: WorkspaceIds = {} as unknown as WorkspaceIds
  return new BlobClient(adapter, workspace)
}

describe('BlobClient.writeTo', () => {
  const ctx = new MeasureMetricsContext('test', {})

  it('returns false when the blob is missing so callers can count it', async () => {
    const client = clientWith(async () => {
      throw Object.assign(new Error('No such key'), { code: 'NoSuchKey' })
    })
    const { chunks, writable } = collector()

    expect(await client.writeTo(ctx, 'gone', 10, writable)).toBe(false)
    expect(chunks).toHaveLength(0)
  })

  it('returns true and writes the payload when the blob exists', async () => {
    const payload = Buffer.from('hello blob')
    const client = clientWith(async () => Readable.from([payload]))
    const { chunks, writable } = collector()

    expect(await client.writeTo(ctx, 'present', payload.length, writable)).toBe(true)
    expect(Buffer.concat(chunks as any).toString()).toBe('hello blob')
  })
})
