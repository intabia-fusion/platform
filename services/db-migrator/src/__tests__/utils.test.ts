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

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import { getActiveMigrationFiles, getMigrationTwins, isMigrationApplied } from '../utils'

// `config` reads DB_URL at import time and throws without it.
jest.mock('../config', () => ({ __esModule: true, default: { ServiceId: 'db-migrator', DbUrl: 'postgres://x' } }))

const migrationsDir = path.join(__dirname, '../../migrations')

describe('getActiveMigrationFiles', () => {
  let dir: string

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrator-'))
    for (const name of [
      '0001_a.pg.sql',
      '0001_a.crdb.sql',
      '0002_b.sql',
      '0002_b.crdb.sql',
      '0003_c.crdb.sql',
      '0010_d.pg.sql',
      '0010_d.crdb.sql',
      'README.md'
    ]) {
      fs.writeFileSync(path.join(dir, name), '')
    }
  })

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('takes the flavor file over the generic one and skips numbers the flavor does not have', () => {
    expect(getActiveMigrationFiles(dir, 'postgres')).toEqual(['0001_a.pg.sql', '0002_b.sql', '0010_d.pg.sql'])
    expect(getActiveMigrationFiles(dir, 'cockroach')).toEqual([
      '0001_a.crdb.sql',
      '0002_b.crdb.sql',
      '0003_c.crdb.sql',
      '0010_d.crdb.sql'
    ])
  })

  it('leaves only the generic files to an unknown flavor', () => {
    expect(getActiveMigrationFiles(dir, 'unknown')).toEqual(['0002_b.sql'])
  })
})

describe('isMigrationApplied', () => {
  it('names the generic and both flavor files of one migration', () => {
    expect(getMigrationTwins('0001_a.pg.sql')).toEqual(['0001_a.sql', '0001_a.pg.sql', '0001_a.crdb.sql'])
    expect(getMigrationTwins('0001_a.sql')).toEqual(['0001_a.sql', '0001_a.pg.sql', '0001_a.crdb.sql'])
  })

  it('treats a flavor file as applied when its generic twin ran under the old name', () => {
    // The notification rework shipped as generic files first; a database that ran them must not
    // re-run the renamed `.pg.sql` files, which are the same change set.
    const applied = new Set(['0001_reworkNotifications.sql', '0002_dropOversizedDncIndexes.sql'])
    expect(isMigrationApplied('0001_reworkNotifications.pg.sql', applied)).toBe(true)
    expect(isMigrationApplied('0002_dropOversizedDncIndexes.sql', applied)).toBe(true)
    expect(isMigrationApplied('0010_reworkNotificationsIndexes.pg.sql', applied)).toBe(false)
  })

  it('does not match another sequence number or description', () => {
    const applied = new Set(['0001_reworkNotifications.sql'])
    expect(isMigrationApplied('0002_reworkNotifications.pg.sql', applied)).toBe(false)
    expect(isMigrationApplied('0001_other.pg.sql', applied)).toBe(false)
  })
})

// The files hold plain DDL: statements end with `;`, comments are whole lines.
function statements (file: string): string[] {
  return fs
    .readFileSync(path.join(migrationsDir, file), 'utf8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0)
}

describe('shipped migrations', () => {
  const sqlFiles = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'))

  const indexNames = (file: string): string[] =>
    statements(file)
      .map((statement) => /INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i.exec(statement)?.[1])
      .filter((name): name is string => name !== undefined)
      .sort()

  it('build the same indexes on both flavors', () => {
    expect(indexNames('0010_reworkNotificationsIndexes.pg.sql')).toEqual(
      indexNames('0010_reworkNotificationsIndexes.crdb.sql')
    )
    expect(indexNames('0010_reworkNotificationsIndexes.pg.sql')).toHaveLength(12)
  })

  it('keep every schema statement idempotent', () => {
    for (const file of sqlFiles) {
      for (const statement of statements(file)) {
        if (/^(ALTER TABLE|CREATE|DROP)/i.test(statement)) {
          expect({ file, statement }).toMatchObject({
            statement: expect.stringMatching(/IF (NOT )?EXISTS|SET NOT NULL|ADD CONSTRAINT/i)
          })
        }
      }
    }
  })

  it('never use a column in the Cockroach file that adds it', () => {
    for (const file of sqlFiles.filter((f) => f.endsWith('.crdb.sql'))) {
      const content = statements(file).join('\n')
      const added = Array.from(content.matchAll(/ADD COLUMN IF NOT EXISTS "?(\w+)"?/g), (m) => m[1])
      for (const column of added) {
        const uses = content.split(new RegExp(`\\b${column}\\b`)).length - 1
        expect({ file, column, uses }).toEqual({ file, column, uses: 1 })
      }
    }
  })

  it('keep a Postgres and a Cockroach file for every schema-changing number', () => {
    const numbers = new Set(sqlFiles.map((f) => f.slice(0, 4)))
    for (const n of numbers) {
      const ofNumber = sqlFiles.filter((f) => f.startsWith(n))
      const hasPg = ofNumber.some((f) => f.endsWith('.pg.sql') || !f.endsWith('.crdb.sql'))
      const hasCrdb = ofNumber.some((f) => f.endsWith('.crdb.sql'))
      // 0006-0009 are the Cockroach-only split of what Postgres does inside 0001-0005.
      expect({ n, hasCrdb }).toEqual({ n, hasCrdb: true })
      expect({ n, hasPg }).toEqual({ n, hasPg: !['0006', '0007', '0008', '0009'].includes(n) })
    }
  })
})
