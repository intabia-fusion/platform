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

import { type AccountDB } from '@hcengineering/account'
import { MeasureMetricsContext, newMetrics, type WorkspaceIds, type WorkspaceUuid } from '@hcengineering/core'
import { type Pipeline } from '@hcengineering/server-core'
import { gunzipSync, gzipSync } from 'node:zlib'

import { backup } from '../backup'
import { type BackupStorage } from '../storage'
import { type BackupInfo } from '../types'

const ctx = new MeasureMetricsContext('test', {}, {}, newMetrics())

const infoFile = 'backup.json.gz'
const blobInfoFile = 'blob-info.json.gz'

const wsIds: WorkspaceIds = { uuid: 'ws-1' as WorkspaceUuid, url: 'ws-1' }

// accountDb is untouched as long as no domain has pending person/socialId changes to load,
// which holds for every test here (empty digest, no affected persons/socialIds).
const accountDb = {} as unknown as AccountDB

const baseOptions = {
  skipDomains: [],
  force: true,
  timeout: 0,
  connectTimeout: 1000,
  skipBlobContentTypes: [],
  blobDownloadLimit: 2,
  keepSnapshots: 1000,
  fullVerify: false,
  forceCompact: false
}

function freshIndex (overrides: Partial<BackupInfo> = {}): BackupInfo {
  return {
    workspace: 'ws-1' as WorkspaceUuid,
    version: '0.6.2',
    snapshots: [],
    domainHashes: {},
    // Matches backup.ts's hardcoded forcedCompact/forcedFullCheck so neither migration runs.
    migrations: { zeroCheckSize: true, forcedCompact: '1', forcedFullCheck: '5' },
    dataSize: 0,
    blobsSize: 0,
    backupSize: 0,
    ...overrides
  }
}

function encode (info: BackupInfo): Buffer {
  return gzipSync(Buffer.from(JSON.stringify(info)))
}

function decode (data: Buffer): BackupInfo {
  return JSON.parse(gunzipSync(data).toString())
}

/** In-memory archive; onInfoLoad fires on every read of backup.json.gz, 1-indexed. */
function memoryStorage (
  initial: Record<string, Buffer>,
  onInfoLoad?: (callIndex: number) => void
): { storage: BackupStorage, content: Map<string, Buffer> } {
  const content = new Map<string, Buffer>(Object.entries(initial))
  let infoLoads = 0

  const storage = {
    async exists (name: string) {
      return content.has(name)
    },
    async loadFile (name: string) {
      if (name === infoFile) {
        infoLoads++
        onInfoLoad?.(infoLoads)
      }
      const data = content.get(name)
      if (data === undefined) throw new Error(`no such file: ${name}`)
      return data
    },
    async writeFile (name: string, data: any) {
      content.set(name, Buffer.isBuffer(data) ? data : Buffer.from(data))
    },
    async stat (name: string) {
      const data = content.get(name)
      if (data === undefined) throw new Error(`no such file: ${name}`)
      return data.length
    }
  } as unknown as BackupStorage

  return { storage, content }
}

// getDomainHash always differs from the empty domainHashes on a fresh index, which alone makes
// processDomain write the index for DOMAIN_MODEL_TX/DOMAIN_TX - no document needs to flow through.
function fakePipeline (): Pipeline {
  return {
    context: {
      lowLevelStorage: {
        find: () => ({ next: async () => [], close: async () => {} }),
        getDomainHash: async () => 'const-hash'
      },
      hierarchy: { domains: () => [] },
      storageAdapter: undefined
    },
    findAll: async () => []
  } as unknown as Pipeline
}

describe('backup() index revision guard', () => {
  it('accepts a legacy index without a revision and gives it one', async () => {
    const { storage, content } = memoryStorage({ [infoFile]: encode(freshIndex()) })

    const result = await backup(ctx, fakePipeline(), wsIds, storage, accountDb, baseOptions)

    expect(result.result).toBe(true)
    const written = decode(content.get(infoFile) as Buffer)
    expect(written.revision).toBeDefined()
  })

  it('does not write the index when canceled', async () => {
    const seed = encode(freshIndex())
    const { storage, content } = memoryStorage({ [infoFile]: seed })

    const result = await backup(ctx, fakePipeline(), wsIds, storage, accountDb, {
      ...baseOptions,
      isCanceled: () => true
    })

    expect(result.result).toBe(false)
    expect(content.get(infoFile)).toEqual(seed)
  })

  it('refuses to write when another writer replaced the index since this run last saw it', async () => {
    const { storage, content } = memoryStorage({ [infoFile]: encode(freshIndex()) }, (callIndex) => {
      if (callIndex === 2) {
        // Run B completes its own write between our initial read (call 1) and our first
        // guarded write's freshness check (call 2).
        content.set(infoFile, encode(freshIndex({ revision: 'run-b-revision' })))
      }
    })

    const result = await backup(ctx, fakePipeline(), wsIds, storage, accountDb, baseOptions)

    expect(result.result).toBe(false)
    const stored = decode(content.get(infoFile) as Buffer)
    expect(stored.revision).toBe('run-b-revision')
  })

  it('leaves blob-info.json.gz untouched when a foreign revision appears at the final index write', async () => {
    const originalBlobInfo = Buffer.from('original-blob-info')
    // callIndex 4 is the final block's writeBackupInfo() (calls 2-3 are the DOMAIN_MODEL_TX/
    // DOMAIN_TX writes inside the domain loop; call 1 is the initial read).
    const { storage, content } = memoryStorage(
      { [infoFile]: encode(freshIndex()), [blobInfoFile]: originalBlobInfo },
      (callIndex) => {
        if (callIndex === 4) {
          content.set(infoFile, encode(freshIndex({ revision: 'run-b-revision' })))
        }
      }
    )

    const result = await backup(ctx, fakePipeline(), wsIds, storage, accountDb, baseOptions)

    expect(result.result).toBe(false)
    expect(content.get(blobInfoFile)).toEqual(originalBlobInfo)
  })
})
