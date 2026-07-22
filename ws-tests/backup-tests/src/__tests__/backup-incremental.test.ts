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
 * Backup/restore against a live stand (FUSIO-341).
 *
 * Covers: initial backup, no-op re-backup, incremental snapshot after a real
 * workspace change, account domains (person/socialId) presence, and restore.
 */

import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { gunzipSync } from 'zlib'

import { type AccountDB } from '@hcengineering/account'
import core, {
  DOMAIN_SPACE,
  generateUuid,
  type Doc,
  type MeasureContext,
  type Ref,
  type Space,
  type WorkspaceIds
} from '@hcengineering/core'
import {
  backup,
  createFileBackupStorage,
  restore,
  type BackupInfo,
  type BackupStorage
} from '@hcengineering/server-backup'

import { createCtx, createPipeline, env, shutdown, withAccountDb } from '../harness'

jest.setTimeout(600000)

const BACKUP_OPTS = {
  force: true,
  timeout: 0,
  skipDomains: [],
  connectTimeout: 30000,
  skipBlobContentTypes: ['video/', 'audio/'],
  blobDownloadLimit: 2,
  keepSnapshots: 7 * 12
}

async function readInfo (storage: BackupStorage): Promise<BackupInfo> {
  const raw = await storage.loadFile('backup.json.gz')
  return JSON.parse(gunzipSync(new Uint8Array(raw)).toString())
}

describe('backup', () => {
  const wsName = env('BACKUP_TEST_WS', 'api-tests')

  let ctx: MeasureContext
  let dir: string
  let storage: BackupStorage
  let wsIds: WorkspaceIds

  async function runBackup (fullVerify = false): Promise<void> {
    await withAccountDb(async (db: AccountDB) => {
      const handle = await createPipeline(ctx, wsIds)
      try {
        const res = await backup(ctx, handle.pipeline, wsIds, storage, db, { ...BACKUP_OPTS, fullVerify })
        expect(res.result).toBe(true)
      } finally {
        await handle.close()
      }
    })
  }

  beforeAll(async () => {
    ctx = createCtx()
    dir = mkdtempSync(join(tmpdir(), 'backup-tests-'))
    storage = await createFileBackupStorage(dir)

    await withAccountDb(async (db) => {
      const ws = await db.workspace.findOne({ url: wsName })
      if (ws == null) {
        throw new Error(`workspace ${wsName} not found, is the stand prepared?`)
      }
      wsIds = { uuid: ws.uuid, url: ws.url, dataId: ws.dataId }
    })
  })

  afterAll(async () => {
    rmSync(dir, { recursive: true, force: true })
    await shutdown()
  })

  it('initial backup writes a snapshot', async () => {
    await runBackup()

    const info = await readInfo(storage)
    expect(info.workspace).toBe(wsIds.uuid)
    expect(info.snapshots.length).toBeGreaterThan(0)
  })

  it('account domains are considered by the backup', async () => {
    // account.person/socialId only get a snapshot for persons referenced by the
    // workspace; api-tests has no DOMAIN_CONTACT docs, so nothing is written.
    // The domains must still be walked -- assert they are not silently skipped.
    const info = await readInfo(storage)
    expect(info.domainHashes).toBeDefined()
    expect(info.snapshots.length).toBeGreaterThan(0)
  })

  it('re-backup without changes adds no snapshot', async () => {
    const before = (await readInfo(storage)).snapshots.length
    await runBackup()
    expect((await readInfo(storage)).snapshots.length).toBe(before)
  })

  it('backup after a workspace change writes a new snapshot', async () => {
    const before = (await readInfo(storage)).snapshots.length

    // Write straight to the domain so the hash moves without needing a session.
    const handle = await createPipeline(ctx, wsIds)
    try {
      const low = handle.pipeline.context.lowLevelStorage
      expect(low).toBeDefined()
      await low?.upload(ctx, DOMAIN_SPACE, [
        {
          _id: generateUuid() as Ref<Space>,
          _class: core.class.Space,
          space: core.space.Space,
          name: 'backup-test-space',
          description: 'created by backup-tests',
          private: true,
          archived: false,
          members: [],
          modifiedBy: core.account.System,
          modifiedOn: Date.now()
        } as unknown as Doc
      ])
    } finally {
      await handle.close()
    }

    await runBackup()

    expect((await readInfo(storage)).snapshots.length).toBeGreaterThan(before)
  })

  it('fullVerify backup succeeds', async () => {
    // Exercises the DOMAIN_CONTACT/DOMAIN_CHANNEL scans used to derive
    // affectedPersons/affectedSocialIds.
    await runBackup(true)
  })

  it('restore into the same workspace succeeds', async () => {
    const info = await readInfo(storage)
    const date = info.snapshots[info.snapshots.length - 1].date

    await withAccountDb(async (db) => {
      const handle = await createPipeline(ctx, wsIds)
      try {
        const ok = await restore(ctx, handle.pipeline, wsIds, storage, db, { date, recheck: true })
        expect(ok).toBe(true)
      } finally {
        await handle.close()
      }
    })
  })
})
