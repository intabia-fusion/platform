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

import { type AccountDB, type Person as GlobalPerson, type SocialId } from '@hcengineering/account'
import { type MeasureContext, type PersonUuid } from '@hcengineering/core'
import { gunzipSync } from 'zlib'
import { collectAccountObjects } from './restore'
import { BackupStorage } from './storage'
import type { BackupInfo, BackupSnapshot } from './types'
import { toAccountDomain } from './utils'

// account_db uses snake_case columns; person.uuid is the PK referenced by many FKs.
const accountSchema = 'global_account'

// System accounts to skip: same bootstrap identity exists in every workspace, must not be remapped.
const ignoredSocialValues = new Set(['huly.ai.bot@hc.engineering'])

interface Collision {
  key: string // socialId natural key, e.g. email:user@x.com
  backupPersonUuid: PersonUuid // uuid the workspace data will reference after restore
  targetPersonUuid: PersonUuid // uuid the already-registered target user currently has
}

function q (v: string | null | undefined): string {
  return `'${String(v ?? '').replace(/'/g, "''")}'`
}

// Build SQL to relink an already-registered target user (targetPersonUuid) onto the
// backup uuid (backupPersonUuid) the restored workspace data references. FKs are
// ON UPDATE NO ACTION and not deferrable, so we cannot UPDATE person.uuid directly.
// Instead: create the backup person+account rows, repoint every child FK, drop the old
// rows. account_passwords carries hash/salt on account_uuid, so the password rides
// along. badge_status is derived (recreated on upgrade) and cascades, so we drop it.
// Name is kept from the target (re-registered) person, not the backup.
function buildRemapSql (c: Collision): string[] {
  const s = accountSchema
  const B = q(c.backupPersonUuid)
  const T = q(c.targetPersonUuid)
  return [
    `-- collision ${c.key}: target ${c.targetPersonUuid} -> backup ${c.backupPersonUuid}`,
    `INSERT INTO ${s}.person (uuid, first_name, last_name) SELECT ${B}, first_name, last_name FROM ${s}.person WHERE uuid = ${T} ON CONFLICT (uuid) DO NOTHING;`,
    `INSERT INTO ${s}.account (uuid, timezone, locale, automatic, max_workspaces, failed_login_attempts) SELECT ${B}, timezone, locale, automatic, max_workspaces, failed_login_attempts FROM ${s}.account WHERE uuid = ${T} ON CONFLICT (uuid) DO NOTHING;`,
    `UPDATE ${s}.account_passwords SET account_uuid = ${B} WHERE account_uuid = ${T};`,
    `DELETE FROM ${s}.account_workspace_badge_status WHERE account_uuid = ${T};`,
    `UPDATE ${s}.social_id SET person_uuid = ${B} WHERE person_uuid = ${T};`,
    `UPDATE ${s}.workspace_members SET account_uuid = ${B} WHERE account_uuid = ${T};`,
    `UPDATE ${s}.workspace_permissions SET account_uuid = ${B} WHERE account_uuid = ${T};`,
    `UPDATE ${s}.account_events SET account_uuid = ${B} WHERE account_uuid = ${T};`,
    `UPDATE ${s}.subscription SET account_uuid = ${B} WHERE account_uuid = ${T};`,
    `UPDATE ${s}.user_profile SET person_uuid = ${B} WHERE person_uuid = ${T};`,
    `UPDATE ${s}.workspace SET created_by = ${B} WHERE created_by = ${T};`,
    `UPDATE ${s}.workspace SET billing_account = ${B} WHERE billing_account = ${T};`,
    `UPDATE ${s}.person SET migrated_to = ${B} WHERE migrated_to = ${T};`,
    `DELETE FROM ${s}.account WHERE uuid = ${T};`,
    `DELETE FROM ${s}.person WHERE uuid = ${T};`,
    ''
  ]
}

/**
 * @public
 * Analyze how backup account identities map onto the target account_db, print a report
 * followed by a SQL script to run BEFORE `backup-restore --accounts`.
 *
 * Collision = a socialId whose natural key already exists in target but points at a
 * DIFFERENT personUuid (user re-registered on target, got a fresh uuid). Restored
 * workspace data references the backup uuid, so we relink the target identity onto it.
 */
export async function analyzeAccountRemap (
  ctx: MeasureContext,
  storage: BackupStorage,
  accountDb: AccountDB,
  date: number
): Promise<void> {
  const infoFile = 'backup.json.gz'
  if (!(await storage.exists(infoFile))) {
    throw new Error(`${infoFile} should present to analyze`)
  }
  const backupInfo: BackupInfo = JSON.parse(gunzipSync(new Uint8Array(await storage.loadFile(infoFile))).toString())
  let snapshots: BackupSnapshot[] = backupInfo.snapshots
  if (date !== -1) {
    const bk = backupInfo.snapshots.findIndex((s) => s.date === date)
    if (bk !== -1) {
      snapshots = backupInfo.snapshots.slice(0, bk + 1)
    }
  }

  const allBackupPersons = (await collectAccountObjects(
    ctx,
    storage,
    snapshots,
    toAccountDomain('person'),
    date
  )) as GlobalPerson[]
  const allBackupSocialIds = (await collectAccountObjects(
    ctx,
    storage,
    snapshots,
    toAccountDomain('socialId'),
    date
  )) as SocialId[]

  // personUuids owned by ignored system social values (e.g. the AI bot)
  const ignoredPersonUuids = new Set<PersonUuid>()
  for (const s of allBackupSocialIds) {
    if (ignoredSocialValues.has((s as any).value)) {
      ignoredPersonUuids.add(s.personUuid)
    }
  }

  const backupPersons = allBackupPersons.filter((p) => !ignoredPersonUuids.has(p.uuid))
  const backupSocialIds = allBackupSocialIds.filter((s) => !ignoredPersonUuids.has(s.personUuid))

  const backupPersonById = new Map<string, GlobalPerson>()
  for (const p of backupPersons) {
    backupPersonById.set(p.uuid, p)
  }

  // existing persons in target
  const existingPersons = await accountDb.person.find({ uuid: { $in: backupPersons.map((p) => p.uuid) } })
  const existingPersonUuids = new Set(existingPersons.map((p) => p.uuid))

  // detect collisions by socialId natural key
  const targetSocialIds = await accountDb.socialId.find({ key: { $in: backupSocialIds.map((s) => (s as any).key) } })
  const targetByKey = new Map<string, SocialId>()
  for (const s of targetSocialIds) {
    targetByKey.set((s as any).key, s)
  }

  const collisions: Collision[] = []
  for (const bs of backupSocialIds) {
    const key = (bs as any).key
    const target = targetByKey.get(key)
    if (target === undefined) continue
    if (target.personUuid !== bs.personUuid) {
      collisions.push({ key, backupPersonUuid: bs.personUuid, targetPersonUuid: target.personUuid })
    }
  }

  // ---- report ----
  const out = console.log
  out('==================== ACCOUNT REMAP REPORT ====================')
  out(`persons in backup:   ${backupPersons.length}`)
  out(`socialIds in backup: ${backupSocialIds.length}`)
  out('')
  out(`-- Persons to be restored (${backupPersons.length}) --`)
  for (const p of backupPersons) {
    const fn = (p as any).firstName ?? ''
    const ln = (p as any).lastName ?? ''
    out(`  ${p.uuid}  ${fn} ${ln}${existingPersonUuids.has(p.uuid) ? '  [already in target]' : '  [new]'}`)
  }
  out('')
  out(`-- Collisions: socialId key exists in target with different personUuid (${collisions.length}) --`)
  if (collisions.length === 0) {
    out('  none')
  }
  for (const c of collisions) {
    const n = backupPersonById.get(c.backupPersonUuid)
    out(`  ${c.key}`)
    out(
      `    target ${c.targetPersonUuid} -> backup ${c.backupPersonUuid} (${(n as any)?.firstName ?? ''} ${(n as any)?.lastName ?? ''})`
    )
  }

  // ---- SQL (one remap per distinct target->backup pair) ----
  out('')
  out('==================== REMAP SQL (run BEFORE backup-restore --accounts) ====================')
  const sql: string[] = ['BEGIN;', '']
  const seen = new Set<string>()
  for (const c of collisions) {
    const pairKey = `${c.targetPersonUuid}->${c.backupPersonUuid}`
    if (seen.has(pairKey)) continue
    seen.add(pairKey)
    sql.push(...buildRemapSql(c))
  }
  sql.push('COMMIT;')
  out(sql.join('\n'))
}
