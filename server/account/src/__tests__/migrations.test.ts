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

import { aiBotAccountEmail } from '@hcengineering/core'
import { getMigrations } from '../collections/postgres/migrations'

const ns = 'global_account'

describe('getMigrations - v40/v41 workspace_purchase dedup + unique index', () => {
  const migrations = getMigrations(ns, 'cockroach')
  const ids = migrations.map(([id]) => id)

  it('registers v40 and v41 identifiers', () => {
    expect(ids).toContain('account_db_v40_workspace_purchase_dedup')
    expect(ids).toContain('account_db_v41_workspace_purchase_unique')
  })

  it('has no duplicate migration identifiers', () => {
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('orders v39 (create table) before v40 (dedup) before v41 (unique index)', () => {
    const v39CreateIdx = ids.indexOf('account_db_v39_workspace_purchase')
    const v40Idx = ids.indexOf('account_db_v40_workspace_purchase_dedup')
    const v41Idx = ids.indexOf('account_db_v41_workspace_purchase_unique')

    expect(v39CreateIdx).toBeGreaterThanOrEqual(0)
    expect(v40Idx).toBeGreaterThan(v39CreateIdx)
    expect(v41Idx).toBeGreaterThan(v40Idx)
  })

  it('v40 is DML-only (dedup) - CockroachDB cannot mix it with the DDL from v41 in one transaction', () => {
    const [, ddl] = migrations.find(([id]) => id === 'account_db_v40_workspace_purchase_dedup') ?? []
    expect(ddl).toBeDefined()
    expect(ddl).toMatch(/DELETE FROM/i)
    expect(ddl).not.toMatch(/CREATE\s+(UNIQUE\s+)?INDEX/i)
    expect(ddl).not.toMatch(/ALTER TABLE/i)
  })

  it('v40 dedups by (payment_id, provider), keeping the oldest row', () => {
    const [, ddl] = migrations.find(([id]) => id === 'account_db_v40_workspace_purchase_dedup') ?? []
    expect(ddl).toMatch(/payment_id IS NOT NULL/)
    expect(ddl).toMatch(/DISTINCT ON \(payment_id, provider\)/)
    expect(ddl).toMatch(/ORDER BY payment_id, provider, created_on ASC/)
  })

  it('v41 is DDL-only (unique index) - split from v40 to keep DML/DDL out of the same transaction', () => {
    const [, ddl] = migrations.find(([id]) => id === 'account_db_v41_workspace_purchase_unique') ?? []
    expect(ddl).toBeDefined()
    expect(ddl).toMatch(/CREATE UNIQUE INDEX/i)
    expect(ddl).not.toMatch(/DELETE FROM/i)
    expect(ddl).not.toMatch(/UPDATE /i)
    expect(ddl).not.toMatch(/INSERT INTO/i)
  })

  it('v41 unique index is partial on payment_id IS NOT NULL (non-payment purchases stay unconstrained)', () => {
    const [, ddl] = migrations.find(([id]) => id === 'account_db_v41_workspace_purchase_unique') ?? []
    expect(ddl).toMatch(
      new RegExp(`ON ${ns}\\.workspace_purchase \\(payment_id, provider\\) WHERE payment_id IS NOT NULL`)
    )
  })
})

describe.each(['postgres', 'cockroach'] as const)('getMigrations - v42/v43 delete_on [%s]', (flavor) => {
  const migrations = getMigrations(ns, flavor)
  const ids = migrations.map(([id]) => id)
  const ddlOf = (id: string): string => migrations.find(([mid]) => mid === id)?.[1] ?? ''

  it('registers both delete_on migrations, without duplicates', () => {
    expect(ids).toContain('account_db_v43_workspace_delete_on')
    expect(ids).toContain('account_db_v44_account_delete_on')
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('uses the int8 type of this flavor', () => {
    const expected = flavor === 'cockroach' ? 'INT8' : 'BIGINT'
    expect(ddlOf('account_db_v43_workspace_delete_on')).toContain(`delete_on ${expected}`)
    expect(ddlOf('account_db_v44_account_delete_on')).toContain(`delete_on ${expected}`)
  })

  it('touches one table each: CockroachDB parses a batch as a whole', () => {
    for (const id of ['account_db_v43_workspace_delete_on', 'account_db_v44_account_delete_on']) {
      expect(ddlOf(id).match(/ALTER TABLE/g)).toHaveLength(1)
      expect(ddlOf(id)).not.toMatch(/UPDATE |INSERT INTO|DELETE FROM/i)
    }
  })
})

describe.each(['postgres', 'cockroach'] as const)('getMigrations - v44 blocked_on [%s]', (flavor) => {
  const migrations = getMigrations(ns, flavor)
  const ddl = migrations.find(([id]) => id === 'account_db_v45_account_blocked_on')?.[1] ?? ''

  it('adds blocked_on with the int8 type of this flavor, alone in its batch', () => {
    expect(ddl).toContain(`blocked_on ${flavor === 'cockroach' ? 'INT8' : 'BIGINT'}`)
    expect(ddl.match(/ALTER TABLE/g)).toHaveLength(1)
  })
})

describe.each(['postgres', 'cockroach'] as const)('getMigrations - v45/v46 backup_lease [%s]', (flavor) => {
  const migrations = getMigrations(ns, flavor)
  const ids = migrations.map(([id]) => id)
  const ddlOf = (id: string): string => migrations.find(([mid]) => mid === id)?.[1] ?? ''

  it('registers both backup_lease migrations, without duplicates', () => {
    expect(ids).toContain('account_db_v46_workspace_backup_lease_until')
    expect(ids).toContain('account_db_v47_workspace_backup_lease_owner')
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('backup_lease_until uses the int8 type of this flavor', () => {
    const expected = flavor === 'cockroach' ? 'INT8' : 'BIGINT'
    expect(ddlOf('account_db_v46_workspace_backup_lease_until')).toContain(`backup_lease_until ${expected}`)
  })

  it('backup_lease_owner uses the string type of this flavor', () => {
    const expected = flavor === 'cockroach' ? 'STRING' : 'TEXT'
    expect(ddlOf('account_db_v47_workspace_backup_lease_owner')).toContain(`backup_lease_owner ${expected}`)
  })

  it('touches one table each: CockroachDB parses a batch as a whole', () => {
    for (const id of ['account_db_v46_workspace_backup_lease_until', 'account_db_v47_workspace_backup_lease_owner']) {
      expect(ddlOf(id).match(/ALTER TABLE/g)).toHaveLength(1)
      expect(ddlOf(id)).not.toMatch(/UPDATE |INSERT INTO|DELETE FROM/i)
    }
  })
})

describe.each(['postgres', 'cockroach'] as const)('getMigrations - v51 needs_reindex [%s]', (flavor) => {
  const migrations = getMigrations(ns, flavor)
  const ids = migrations.map(([id]) => id)
  const ddl = migrations.find(([id]) => id === 'account_db_v51_workspace_needs_reindex')?.[1] ?? ''

  it('registers the migration once', () => {
    expect(ids.filter((id) => id === 'account_db_v51_workspace_needs_reindex')).toHaveLength(1)
  })

  it('adds needs_reindex with the bool type of this flavor and no default, alone in its batch', () => {
    expect(ddl).toContain(`needs_reindex ${flavor === 'cockroach' ? 'BOOL' : 'BOOLEAN'}`)
    expect(ddl).not.toMatch(/DEFAULT/i)
    expect(ddl.match(/ALTER TABLE/g)).toHaveLength(1)
    expect(ddl).not.toMatch(/UPDATE |INSERT INTO|DELETE FROM/i)
  })
})

describe.each(['postgres', 'cockroach'] as const)('getMigrations - v53 otp attempts [%s]', (flavor) => {
  const migrations = getMigrations(ns, flavor)
  const ids = migrations.map(([id]) => id)
  const ddl = migrations.find(([id]) => id === 'account_db_v53_otp_attempts')?.[1] ?? ''

  it('registers the migration once, after the v52 data fix', () => {
    expect(ids.filter((id) => id === 'account_db_v53_otp_attempts')).toHaveLength(1)
    expect(ids.indexOf('account_db_v53_otp_attempts')).toBeGreaterThan(
      ids.indexOf('account_db_v52_anonymous_account_read_only')
    )
  })

  it('adds a not-null counter that starts at zero, alone in its batch', () => {
    expect(ddl).toContain(
      `ADD COLUMN IF NOT EXISTS attempts ${flavor === 'cockroach' ? 'INT4' : 'INTEGER'} NOT NULL DEFAULT 0`
    )
    expect(ddl.match(/ALTER TABLE/g)).toHaveLength(1)
    expect(ddl).toContain(`${ns}.otp`)
    expect(ddl).not.toMatch(/UPDATE |INSERT INTO|DELETE FROM/i)
  })
})

describe.each(['postgres', 'cockroach'] as const)('getMigrations - v54 otp purpose [%s]', (flavor) => {
  const migrations = getMigrations(ns, flavor)
  const ids = migrations.map(([id]) => id)
  const ddl = migrations.find(([id]) => id === 'account_db_v54_otp_purpose')?.[1] ?? ''

  it('registers the migration once, after v53', () => {
    expect(ids.filter((id) => id === 'account_db_v54_otp_purpose')).toHaveLength(1)
    expect(ids.indexOf('account_db_v54_otp_purpose')).toBeGreaterThan(ids.indexOf('account_db_v53_otp_attempts'))
  })

  it('adds a not-null purpose that defaults to login, alone in its batch and without a backfill', () => {
    expect(ddl).toContain(
      `ADD COLUMN IF NOT EXISTS purpose ${flavor === 'cockroach' ? 'STRING' : 'TEXT'} NOT NULL DEFAULT 'login'`
    )
    expect(ddl.match(/ALTER TABLE/g)).toHaveLength(1)
    expect(ddl).toContain(`${ns}.otp`)
    expect(ddl).not.toMatch(/UPDATE |INSERT INTO|DELETE FROM/i)
  })
})

describe.each(['postgres', 'cockroach'] as const)('getMigrations - v55 login otp misses [%s]', (flavor) => {
  const migrations = getMigrations(ns, flavor)
  const ids = migrations.map(([id]) => id)
  const ddl = migrations.find(([id]) => id === 'account_db_v55_social_id_login_otp_misses')?.[1] ?? ''

  it('registers the migration once, after v54', () => {
    expect(ids.filter((id) => id === 'account_db_v55_social_id_login_otp_misses')).toHaveLength(1)
    expect(ids.indexOf('account_db_v55_social_id_login_otp_misses')).toBeGreaterThan(
      ids.indexOf('account_db_v54_otp_purpose')
    )
  })

  it('adds a counter and a timestamp that start at zero, on one table, without a backfill', () => {
    expect(ddl).toContain(
      `ADD COLUMN IF NOT EXISTS login_otp_misses ${flavor === 'cockroach' ? 'INT4' : 'INTEGER'} NOT NULL DEFAULT 0`
    )
    expect(ddl).toContain(
      `ADD COLUMN IF NOT EXISTS login_otp_missed_on ${flavor === 'cockroach' ? 'INT8' : 'BIGINT'} NOT NULL DEFAULT 0`
    )
    expect(ddl.match(/ALTER TABLE/g)).toHaveLength(1)
    expect(ddl).toContain(`${ns}.social_id`)
    expect(ddl).not.toMatch(/UPDATE |INSERT INTO|DELETE FROM/i)
  })
})

describe.each(['postgres', 'cockroach'] as const)('getMigrations - v56 ai bot credentials reset [%s]', (flavor) => {
  const migrations = getMigrations(ns, flavor)
  const ids = migrations.map(([id]) => id)
  const ddl = migrations.find(([id]) => id === 'account_db_v56_ai_bot_credentials_reset')?.[1] ?? ''

  it('registers the migration once, after v55', () => {
    expect(ids.filter((id) => id === 'account_db_v56_ai_bot_credentials_reset')).toHaveLength(1)
    expect(ids.indexOf('account_db_v56_ai_bot_credentials_reset')).toBeGreaterThan(
      ids.indexOf('account_db_v55_social_id_login_otp_misses')
    )
  })

  it('only deletes, and matches the bot email social id by type and value', () => {
    expect(ddl.match(/DELETE FROM/g)).toHaveLength(3)
    expect(ddl).toContain(`${ns}.account_passwords`)
    expect(ddl).toContain(`type = 'email' AND value = '${aiBotAccountEmail}'`)
    expect(ddl).not.toMatch(/ALTER TABLE|CREATE |DROP |UPDATE |INSERT INTO/i)
  })
})
