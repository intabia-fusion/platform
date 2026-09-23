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
 * Per-workspace backup lease against a real database, once per flavor in realDbFlavors.
 */

import { type Data, type Version, type WorkspaceUuid } from '@hcengineering/core'
import { shutdownPostgres, type PostgresClientReference } from '@hcengineering/postgres'
import { type PostgresAccountDB } from '../collections/postgres/postgres'
import { clearTables, openRealDb, realDbFlavors } from './realDbFlavors'

jest.setTimeout(90000)

const WORKSPACE_TABLES = ['workspace_status', 'workspace']

describe.each(realDbFlavors)('backup-lease-real [$flavor]', ({ flavor, adminUri, dbUri }) => {
  let dbUuid: string
  let dbClient: PostgresClientReference
  let db: PostgresAccountDB

  const version: Data<Version> = { major: 0, minor: 7, patch: 0 }
  const processingTimeoutMs = 60000

  let seq = 0

  async function makeWorkspace (mode: string): Promise<WorkspaceUuid> {
    const url = `lease-ws-${seq++}`
    return await db.createWorkspace(
      { url, name: url, allowGuestSignUp: false, allowReadOnlyGuest: false },
      { isDisabled: false, mode: mode as any, versionMajor: 0, versionMinor: 7, versionPatch: 0 }
    )
  }

  beforeAll(async () => {
    const opened = await openRealDb('backupleasedb', { flavor, adminUri, dbUri })
    dbUuid = opened.dbUuid
    dbClient = opened.dbRef
    db = opened.account
  })

  beforeEach(async () => {
    await clearTables(dbClient, dbUuid, WORKSPACE_TABLES)
  })

  afterAll(async () => {
    dbClient.close()
    await shutdownPostgres()
  })

  it('acquires on an active workspace', async () => {
    const ws = await makeWorkspace('active')
    const now = Date.now()

    expect(await db.updateBackupLease(ws, 'pod-1', 'acquire', now, now + 30000)).toBe(true)
  })

  it('refuses a second owner while the lease is live', async () => {
    const ws = await makeWorkspace('active')
    const now = Date.now()

    expect(await db.updateBackupLease(ws, 'pod-1', 'acquire', now, now + 30000)).toBe(true)
    expect(await db.updateBackupLease(ws, 'pod-2', 'acquire', now, now + 30000)).toBe(false)
  })

  it('lets the same owner re-acquire', async () => {
    const ws = await makeWorkspace('active')
    const now = Date.now()

    expect(await db.updateBackupLease(ws, 'pod-1', 'acquire', now, now + 30000)).toBe(true)
    expect(await db.updateBackupLease(ws, 'pod-1', 'acquire', now, now + 60000)).toBe(true)
  })

  it('refuses to acquire on a non-active mode', async () => {
    const ws = await makeWorkspace('archiving-pending-backup')
    const now = Date.now()

    expect(await db.updateBackupLease(ws, 'pod-1', 'acquire', now, now + 30000)).toBe(false)
  })

  it('refuses to renew once the mode moves off active', async () => {
    const ws = await makeWorkspace('active')
    const now = Date.now()
    expect(await db.updateBackupLease(ws, 'pod-1', 'acquire', now, now + 30000)).toBe(true)

    await db.workspaceStatus.update({ workspaceUuid: ws }, { mode: 'archiving-pending-backup' as any })

    expect(await db.updateBackupLease(ws, 'pod-1', 'renew', now, now + 60000)).toBe(false)
  })

  it('release: foreign owner fails, the owner succeeds and clears the columns', async () => {
    const ws = await makeWorkspace('active')
    const now = Date.now()
    expect(await db.updateBackupLease(ws, 'pod-1', 'acquire', now, now + 30000)).toBe(true)

    expect(await db.updateBackupLease(ws, 'pod-2', 'release', now, 0)).toBe(false)
    expect(await db.updateBackupLease(ws, 'pod-1', 'release', now, 0)).toBe(true)

    const status: any = await db.workspaceStatus.findOne({ workspaceUuid: ws })
    expect(status.backupLeaseUntil ?? null).toBeNull()
    expect(status.backupLeaseOwner ?? null).toBeNull()
  })

  it('getPendingWorkspace withholds an archiving workspace while the lease is live, returns it once released', async () => {
    const ws = await makeWorkspace('active')
    const now = Date.now()
    expect(await db.updateBackupLease(ws, 'pod-1', 'acquire', now, now + 30000)).toBe(true)

    // Mode moved on while the pod still holds the lease - the race this feature closes.
    await db.workspaceStatus.update({ workspaceUuid: ws }, { mode: 'archiving-pending-backup' as any })

    const heldBack = await db.getPendingWorkspace('', version, 'all+backup', processingTimeoutMs)
    expect(heldBack?.uuid).not.toEqual(ws)

    expect(await db.updateBackupLease(ws, 'pod-1', 'release', now, 0)).toBe(true)

    const released = await db.getPendingWorkspace('', version, 'all+backup', processingTimeoutMs)
    expect(released?.uuid).toEqual(ws)
  })
})
