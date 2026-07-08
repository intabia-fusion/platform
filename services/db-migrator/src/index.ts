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

import { EXPECTED_SCHEMA_VERSION, getDBClient } from '@hcengineering/postgres'
import { withRetry, DelayStrategyFactory } from '@hcengineering/retry'

import config from './config'
import { getActiveMigrationFiles, getCleanMigrationName, resolveMigrationsDir, setupCtx } from './utils'
import {
  applyMigration,
  ensureSystemSchema,
  getAppliedMigrations,
  getDbFlavor,
  isDatabaseEmpty,
  isUpToDate,
  markAllAsApplied,
  updateSchemaVersion
} from './db'

async function main (): Promise<void> {
  const ctx = setupCtx()
  ctx.info('Starting database migrator service...', { expectedVersion: EXPECTED_SCHEMA_VERSION })

  const clientRef = getDBClient(config.DbUrl, undefined, config.ServiceId)

  try {
    const sql = await clientRef.getClient()
    await withRetry(
      async () => {
        await ensureSystemSchema(sql)

        if (await isUpToDate(sql, EXPECTED_SCHEMA_VERSION)) {
          ctx.info('Database schema version is already up to date', { expectedVersion: EXPECTED_SCHEMA_VERSION })
          return
        }

        const dbFlavor = await getDbFlavor(sql)
        ctx.info(`Database flavor detected: ${dbFlavor}`)

        const migrationsDir = resolveMigrationsDir()
        const files = getActiveMigrationFiles(migrationsDir, dbFlavor)

        ctx.info(`Found ${files.length} active migration files in ${migrationsDir}`)

        const isEmpty = await isDatabaseEmpty(sql)
        const appliedSet = await getAppliedMigrations(sql)

        if (isEmpty) {
          ctx.info('Database is completely empty. Marking all migrations as pre-applied.')
          await markAllAsApplied(sql, files)
          await updateSchemaVersion(sql, EXPECTED_SCHEMA_VERSION, ctx)
          return
        }

        ctx.info(`Applied migrations count: ${appliedSet.size}, Total available: ${files.length}`)

        for (const file of files) {
          const cleanName = getCleanMigrationName(file)
          if (appliedSet.has(file) || appliedSet.has(cleanName)) {
            ctx.info(`Migration ${file} is already applied.`)
            continue
          }

          ctx.info(`Applying migration ${file}...`)
          await applyMigration(sql, file, migrationsDir, ctx)
        }

        await updateSchemaVersion(sql, EXPECTED_SCHEMA_VERSION, ctx)
      },
      {
        maxRetries: 5,
        delayStrategy: DelayStrategyFactory.exponentialBackoff({
          initialDelayMs: 5000,
          maxDelayMs: 20000,
          backoffFactor: 2.0,
          jitter: 0.2
        })
      }
    )

    clientRef.close()
    process.exit(0)
  } catch (err: any) {
    ctx.error('Migration failed', { error: err.message })
    clientRef.close()
    process.exit(1)
  }
}

void main().catch((err) => {
  console.error('Unhandled exception during migration startup:', err)
  process.exit(1)
})
