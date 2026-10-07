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
 * workspace_status.needs_reindex against a real database, once per flavor in realDbFlavors.
 */

import { type WorkspaceUuid } from '@hcengineering/core'
import { shutdownPostgres, type PostgresClientReference } from '@hcengineering/postgres'
import { type PostgresAccountDB } from '../collections/postgres/postgres'
import { clearTables, openRealDb, realDbFlavors } from './realDbFlavors'

jest.setTimeout(90000)

const WORKSPACE_TABLES = ['workspace_status', 'workspace']

describe.each(realDbFlavors)('needs-reindex-real [$flavor]', ({ flavor, adminUri, dbUri }) => {
  let dbUuid: string
  let dbClient: PostgresClientReference
  let db: PostgresAccountDB

  let seq = 0

  async function makeWorkspace (): Promise<WorkspaceUuid> {
    const url = `reindex-ws-${seq++}`
    return await db.createWorkspace(
      { url, name: url, allowGuestSignUp: false, allowReadOnlyGuest: false },
      { isDisabled: false, mode: 'active', versionMajor: 0, versionMinor: 7, versionPatch: 0 }
    )
  }

  async function needsReindex (ws: WorkspaceUuid): Promise<boolean | undefined> {
    return (await db.workspaceStatus.findOne({ workspaceUuid: ws }))?.needsReindex ?? undefined
  }

  beforeAll(async () => {
    const opened = await openRealDb('needsreindexdb', { flavor, adminUri, dbUri })
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

  it('a fresh workspace has nothing to take', async () => {
    const ws = await makeWorkspace()

    expect(await needsReindex(ws)).toBeUndefined()
    expect(await db.takeNeedsReindex(ws)).toBe(false)
  })

  it('take returns true once and clears the flag', async () => {
    const ws = await makeWorkspace()
    await db.workspaceStatus.update({ workspaceUuid: ws }, { needsReindex: true })
    expect(await needsReindex(ws)).toBe(true)

    expect(await db.takeNeedsReindex(ws)).toBe(true)
    expect(await needsReindex(ws)).toBeUndefined()
    expect(await db.takeNeedsReindex(ws)).toBe(false)
  })

  it('concurrent takes: only one gets true', async () => {
    const ws = await makeWorkspace()
    await db.workspaceStatus.update({ workspaceUuid: ws }, { needsReindex: true })

    const results = await Promise.all([db.takeNeedsReindex(ws), db.takeNeedsReindex(ws), db.takeNeedsReindex(ws)])

    expect(results.filter((it) => it)).toHaveLength(1)
  })

  it('take touches only its own workspace', async () => {
    const ws1 = await makeWorkspace()
    const ws2 = await makeWorkspace()
    await db.workspaceStatus.update({ workspaceUuid: ws1 }, { needsReindex: true })
    await db.workspaceStatus.update({ workspaceUuid: ws2 }, { needsReindex: true })

    expect(await db.takeNeedsReindex(ws1)).toBe(true)
    expect(await needsReindex(ws2)).toBe(true)
  })
})
