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
import { newMetrics, type MeasureContext } from '@hcengineering/core'
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
