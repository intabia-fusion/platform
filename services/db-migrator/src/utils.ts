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

import { configureAnalytics, createOpenTelemetryMetricsContext, SplitLogger } from '@hcengineering/analytics-service'
import { newMetrics, type MeasureContext, notEmpty } from '@hcengineering/core'
import { initStatisticsContext } from '@hcengineering/server-core'
import * as path from 'path'
import * as fs from 'fs'

import config from './config'

export function setupCtx (): MeasureContext {
  configureAnalytics(config.ServiceId, process.env.VERSION ?? '0.7.0')
  return initStatisticsContext(config.ServiceId, {
    factory: () =>
      createOpenTelemetryMetricsContext(
        config.ServiceId,
        {},
        {},
        newMetrics(),
        new SplitLogger(config.ServiceId, {
          root: path.join(process.cwd(), 'logs'),
          enableConsole: true
        })
      )
  })
}

export function resolveMigrationsDir (): string {
  const candidates = [
    path.join(__dirname, '../migrations'),
    path.join(__dirname, 'migrations'),
    path.join(process.cwd(), 'migrations')
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return p
    }
  }
  throw new Error(`Migrations directory not found in: ${candidates.join(', ')}`)
}

export function getActiveMigrationFiles (
  migrationsDir: string,
  dbFlavor: 'postgres' | 'cockroach' | 'unknown'
): string[] {
  const allFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  const chosenMap = new Map<string, string>()

  for (const file of allFiles) {
    const parts = file.split('_')
    const seq = parts[0]
    if (seq !== undefined && seq.length > 0 && !isNaN(parseInt(seq, 10))) {
      const isPg = file.endsWith('.pg.sql')
      const isCrdb = file.endsWith('.crdb.sql')

      if (dbFlavor === 'postgres' && isPg) {
        chosenMap.set(seq, file)
      } else if (dbFlavor === 'cockroach' && isCrdb) {
        chosenMap.set(seq, file)
      } else if (!isPg && !isCrdb) {
        if (!chosenMap.has(seq)) {
          chosenMap.set(seq, file)
        }
      }
    }
  }

  return Array.from(chosenMap.keys())
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
    .map((seq) => chosenMap.get(seq))
    .filter(notEmpty)
}

export function getCleanMigrationName (fileName: string): string {
  const index = fileName.indexOf('_')
  let name = index !== -1 ? fileName.substring(index + 1) : fileName

  if (name.endsWith('.pg.sql')) {
    name = name.substring(0, name.length - '.pg.sql'.length) + '.sql'
  } else if (name.endsWith('.crdb.sql')) {
    name = name.substring(0, name.length - '.crdb.sql'.length) + '.sql'
  }

  return name
}
