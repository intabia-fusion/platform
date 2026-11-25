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

import { MeasureMetricsContext } from '@hcengineering/core'
import { postgresUrl } from '@hcengineering/test-containers'
import postgres, { type Sql } from 'postgres'
import { PostgresDB } from '../datalake/db'
import { type PublicFileAccess } from '../datalake/publicFileAccess'

jest.setTimeout(120000)
const ws = '11111111-1111-4111-8111-111111111111'
const otherWs = '22222222-2222-4222-8222-222222222222'
let sql: Sql
let access: PublicFileAccess
beforeAll(async () => {
  sql = postgres(await postgresUrl(), { fetch_types: false, max: 4, onnotice: () => {} })
  await sql`CREATE SCHEMA IF NOT EXISTS global_account`
  await sql`CREATE TABLE IF NOT EXISTS global_account.workspace (uuid uuid, data_id text)`
  access = (await PostgresDB.create(new MeasureMetricsContext('test', {}), sql)).publicFileAccess
})
afterAll(async () => {
  await sql?.end()
})
beforeEach(async () => {
  await sql`TRUNCATE blob.public_link CASCADE`
})

it('isolates workspaces and links and allows one blob in two links', async () => {
  await access.replace(ws, 'a', 1, ['file'])
  await access.replace(ws, 'b', 1, ['file'])
  expect(await access.canRead(otherWs, 'a', 'file')).toBe(false)
  expect(await access.canRead(ws, 'missing', 'file')).toBe(false)
  await access.replace(otherWs, 'a', 1, ['file'])
  await access.revoke(ws, 'a', 2)
  expect(await access.canRead(otherWs, 'a', 'file')).toBe(true)
  expect(await access.canRead(ws, 'a', 'file')).toBe(false)
  expect(await access.canRead(ws, 'b', 'file')).toBe(true)
})
it('replaces the complete set and accepts identical retries only', async () => {
  await access.replace(ws, 'a', 1, ['old'])
  await access.replace(ws, 'a', 2, ['new', 'new'])
  await access.replace(ws, 'a', 2, ['new'])
  await expect(access.replace(ws, 'a', 2, ['different'])).rejects.toThrow()
  await expect(access.replace(ws, 'a', 1, ['old'])).rejects.toThrow()
  expect(await access.canRead(ws, 'a', 'old')).toBe(false)
  expect(await access.canRead(ws, 'a', 'new')).toBe(true)
})
it('keeps a tombstone even if revoke arrives before publication', async () => {
  await access.revoke(ws, 'a', 2)
  await access.revoke(ws, 'a', 2)
  await expect(access.replace(ws, 'a', 1, ['file'])).rejects.toThrow()
  await expect(access.replace(ws, 'a', 3, ['file'])).rejects.toThrow()
  expect(await access.canRead(ws, 'a', 'file')).toBe(false)
})
it('serializes competing replacements and never restores an older revision', async () => {
  await Promise.allSettled([access.replace(ws, 'a', 1, ['old']), access.replace(ws, 'a', 2, ['new'])])
  expect(await access.canRead(ws, 'a', 'old')).toBe(false)
  expect(await access.canRead(ws, 'a', 'new')).toBe(true)
})
it('rolls back a failed replacement without losing the previous set', async () => {
  await access.replace(ws, 'a', 1, ['old'])
  await expect(access.replace(ws, 'a', 2, ['x'.repeat(256)])).rejects.toThrow()
  expect(await access.canRead(ws, 'a', 'old')).toBe(true)
})
it('rejects invalid revisions', async () => {
  for (const revision of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    await expect(access.replace(ws, 'a', revision, [])).rejects.toThrow()
  }
})

it('revokes permanently even when a newer publication arrives before the revoke', async () => {
  await access.replace(ws, 'a', 5, ['file'])
  await access.revoke(ws, 'a', 2)
  expect(await access.canRead(ws, 'a', 'file')).toBe(false)
  await expect(access.replace(ws, 'a', 6, ['file'])).rejects.toThrow()
  await access.revoke(ws, 'a', 1)
})

it('reads a consistent state and pages active links without revoked rows', async () => {
  expect(await access.state(ws, 'missing')).toEqual({ revision: 0, revoked: false, blobs: [] })
  for (let i = 0; i < 12; i++) await access.replace(ws, `link-${String(i).padStart(2, '0')}`, 1, ['file'])
  await access.revoke(ws, 'link-01', 2)
  const first = await access.activeLinks(ws, '')
  expect(first).toHaveLength(10)
  expect(first).not.toContain('link-01')
  expect(await access.activeLinks(ws, first[first.length - 1])).toEqual(['link-11'])
  expect(await access.state(ws, 'link-00')).toEqual({ revision: 1, revoked: false, blobs: ['file'] })
  expect(await access.state(ws, 'link-01')).toEqual({ revision: 2, revoked: true, blobs: [] })
})
