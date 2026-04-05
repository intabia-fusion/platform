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
import { runWorkspaceSetup } from './scenarios/01-workspace-setup'
import { runRestThroughput } from './scenarios/02-rest-throughput'
import { runMultiWorkspace } from './scenarios/03-multi-workspace'
import { withProfiling, type ProfileGuard } from './profiler'

async function main (): Promise<void> {
  const cfg = parseArgs(process.argv.slice(2))

  console.log('========================================')
  console.log('  Huly Platform Benchmark Suite')
  console.log('========================================')
  console.log(`  url:       ${cfg.url}`)
  console.log(`  workspace: ${cfg.workspace}`)
  console.log(`  email:     ${cfg.email}`)
  console.log(`  scenario:  ${cfg.scenario}`)
  console.log('')

  // Start profiling if requested
  let profileGuard: ProfileGuard | undefined
  if (cfg.profile && cfg.transactorUrl !== undefined) {
    console.log(`  starting CPU profiling on ${cfg.transactorUrl}...`)
    profileGuard = await withProfiling(cfg.transactorUrl, cfg.profileDir)
  }

  const scenario = cfg.scenario
  const allResults: any = {}

  // Scenarios that need a connection pool (single workspace)
  if (scenario === 'all' || scenario === 'setup' || scenario === 'rest-throughput') {
    const pool = await initPool(cfg)
    console.log('  connection pool initialized')

    if (scenario === 'all' || scenario === 'setup') {
      const projects = await runWorkspaceSetup(cfg, pool)
      allResults.setup = { projectCount: projects.length }
    }

    if (scenario === 'all' || scenario === 'rest-throughput') {
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
