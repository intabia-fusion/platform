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

import type { MeasureContext } from '@hcengineering/core'
import type { DBClient } from '@hcengineering/postgres-base'

export const EXPECTED_SCHEMA_VERSION = 10
export const CHECK_VERSION_INTERVAL = 5000

export async function waitForSchemaVersion (ctx: MeasureContext, client: DBClient): Promise<void> {
  while (true) {
    try {
      // Check if schema_version table exists first to prevent relation-not-found errors in database logs
      const tableExistsRes = await client.execute(`
        SELECT EXISTS (
          SELECT 1 
          FROM information_schema.tables 
          WHERE table_schema = 'system' 
          AND table_name = '_version'
        ) as exists
      `)

      const exists = tableExistsRes[0]?.exists === true || tableExistsRes[0]?.exists === 'true'

      if (exists) {
        const res = await client.execute(`
          SELECT version 
          FROM system._version 
          LIMIT 1
        `)
        const currentVersion = res[0]?.version
        if (
          currentVersion !== undefined &&
          typeof currentVersion === 'number' &&
          currentVersion >= EXPECTED_SCHEMA_VERSION
        ) {
          break
        }
        ctx.info('Waiting for database schema migrations to be applied', {
          currentVersion,
          expectedVersion: EXPECTED_SCHEMA_VERSION
        })
      } else {
        ctx.info('Waiting for migrations system schema or version table to be created', {
          expectedVersion: EXPECTED_SCHEMA_VERSION
        })
      }
    } catch (err: any) {
      ctx.info('Error checking schema version, retrying', {
        expectedVersion: EXPECTED_SCHEMA_VERSION,
        error: err.message
      })
    }
    await new Promise((resolve) => setTimeout(resolve, CHECK_VERSION_INTERVAL))
  }
}
