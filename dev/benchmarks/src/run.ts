/**
  Copyright © 2026 Intabia Fusion.

  Licensed under the Eclipse Public License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License. You may
  obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.

  See the License for the specific language governing permissions and
  limitations under the License.
*/

import { parseArgs } from './config'
import { initPool } from './helpers'
import { runRestThroughput } from './scenarios/02-rest-throughput'
import { runMultiWorkspace } from './scenarios/03-multi-workspace'
import { runReadPerf } from './scenarios/04-read-perf'
import { runConnectStorm } from './scenarios/05-connect-storm'
import { runRecoverStorm } from './scenarios/06-recover-storm'
import { runRefreshProbe } from './scenarios/07-refresh-probe'
import { withProfiling, type ProfileGuard } from './profiler'

// Live (WebSocket) scenarios connect on their own - no REST pool, not part of 'all'.
const LIVE_SCENARIOS = new Set(['read-perf', 'connect-storm', 'recover-storm', 'refresh-probe'])

async function main (): Promise<void> {
  const cfg = parseArgs(process.argv.slice(2))

  console.log('========================================')
  console.log('  Platform Benchmark Suite')
  console.log('========================================')
  console.log(`  url:       ${cfg.url}`)
  console.log(`  workspace: ${cfg.workspace}`)
  console.log(`  email:     ${cfg.email}`)
  console.log(`  scenario:  ${cfg.scenario}`)
  console.log('')

  const scenario = cfg.scenario
  const allResults: any = {}

  // Live scenarios: self-connecting probes, dispatched directly.
  if (LIVE_SCENARIOS.has(scenario)) {
    if (scenario === 'read-perf') {
      const results = await runReadPerf(cfg)
      allResults.readPerf = results
      if (results.some((r) => r.bad)) process.exitCode = 1
    } else if (scenario === 'connect-storm') {
      allResults.connectStorm = await runConnectStorm(cfg)
    } else if (scenario === 'recover-storm') {
      allResults.recoverStorm = await runRecoverStorm(cfg)
    } else if (scenario === 'refresh-probe') {
      allResults.refreshProbe = await runRefreshProbe(cfg)
    }
    if (cfg.output !== undefined) {
      const fs = await import('fs')
      fs.writeFileSync(cfg.output, JSON.stringify(allResults, null, 2))
      console.log(`\nResults written to ${cfg.output}`)
    }
    console.log('\nDone.')
    return
  }

  // Start profiling if requested (REST scenarios).
  let profileGuard: ProfileGuard | undefined
  if (cfg.profile && cfg.transactorUrl !== undefined) {
    console.log(`  starting CPU profiling on ${cfg.transactorUrl}...`)
    profileGuard = await withProfiling(cfg.transactorUrl, cfg.profileDir)
  }

  // Scenarios that need a connection pool (single workspace)
  if (scenario === 'all' || scenario === 'rest-throughput') {
    const pool = await initPool(cfg)
    console.log('  connection pool initialized')

    const results = await runRestThroughput(cfg, pool)
    allResults.restThroughput = results.map((r) => ({
      operation: r.operation,
      clients: r.clientCount,
      opsPerSec: r.stats.realOpsPerSec,
      avgMs: r.stats.avgMs,
      p95Ms: r.stats.p95Ms,
      p99Ms: r.stats.p99Ms,
      maxMs: r.stats.maxMs,
      errors: r.stats.failed
    }))
  }

  // Multi-workspace scenario (creates its own connections)
  if (scenario === 'all' || scenario === 'multi-workspace') {
    const results = await runMultiWorkspace(cfg)
    allResults.multiWorkspace = {
      workspaceCount: results.workspaceCount,
      clientsPerWorkspace: results.clientsPerWorkspace,
      totalOpsPerSec: results.aggregate.realOpsPerSec,
      perWorkspace: results.perWorkspace.map((r) => ({
        workspace: r.workspaceName,
        opsPerSec: r.stats.realOpsPerSec,
        avgMs: r.stats.avgMs,
        p95Ms: r.stats.p95Ms,
        errors: r.stats.failed
      }))
    }
  }

  // Stop profiling if active
  if (profileGuard !== undefined) {
    console.log('\n  stopping CPU profiling...')
    const profilePath = await profileGuard.stop()
    allResults.profilePath = profilePath
  }

  if (cfg.output !== undefined) {
    const fs = await import('fs')
    fs.writeFileSync(cfg.output, JSON.stringify(allResults, null, 2))
    console.log(`\nResults written to ${cfg.output}`)
  }

  console.log('\nDone.')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
