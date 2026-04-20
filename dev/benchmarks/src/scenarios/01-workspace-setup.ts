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

import tracker, { type Project } from '@hcengineering/tracker'
import type { BenchConfig } from '../config'
import {
  type ConnectionPool,
  calcStats,
  ensureProject,
  makeRestClient,
  makeTxClient,
  printStats,
  trackError
} from '../helpers'

const BATCH_SIZE = 25

export async function runWorkspaceSetup (cfg: BenchConfig, pool: ConnectionPool): Promise<Project[]> {
  const totalProjects = cfg.workspaces * cfg.projectsPerWs
  console.log(`\n========================================`)
  console.log(`  SCENARIO: Workspace Setup`)
  console.log(`  projects: ${totalProjects} (${cfg.workspaces} groups x ${cfg.projectsPerWs})`)
  console.log(`========================================\n`)

  const conn = makeRestClient(pool.wsToken)
  const txOps = await makeTxClient(pool.wsToken)

  // Check existing projects
  const existing = await conn.findAll(tracker.class.Project, {})
  const existingIds = new Set(existing.map((p) => p.identifier))
  console.log(`  existing projects: ${existing.length}`)

  // Generate identifiers
  const needed: Array<{ identifier: string, name: string }> = []
  for (let g = 0; g < cfg.workspaces; g++) {
    for (let p = 0; p < cfg.projectsPerWs; p++) {
      const idx = g * cfg.projectsPerWs + p
      const identifier = `B${String(idx).padStart(4, '0')}`
      if (!existingIds.has(identifier)) {
        needed.push({ identifier, name: `Bench ${g}-${p}` })
      }
    }
  }

  if (needed.length === 0) {
    console.log(`  all ${totalProjects} projects already exist, skipping creation`)
    return existing.filter((p) => p.identifier.startsWith('B'))
  }

  console.log(`  creating ${needed.length} new projects in batches of ${BATCH_SIZE}...`)

  const timings: number[] = []
  const errors = new Map<string, number>()
  const globalStart = performance.now()

  for (let i = 0; i < needed.length; i += BATCH_SIZE) {
    const batch = needed.slice(i, i + BATCH_SIZE)
    const batchPromises = batch.map(async ({ identifier, name }) => {
      const start = performance.now()
      try {
        await ensureProject(conn, txOps, identifier, name)
        timings.push(performance.now() - start)
      } catch (err: any) {
        trackError(errors, err)
      }
    })
    await Promise.allSettled(batchPromises)

    const done = Math.min(i + BATCH_SIZE, needed.length)
    if (done % 100 === 0 || done === needed.length) {
      console.log(`  progress: ${done}/${needed.length}`)
    }
  }

  const wallMs = performance.now() - globalStart
  const stats = calcStats('project-creation', timings, wallMs, errors)
  printStats(stats)

  // Fetch all projects
  const allProjects = await conn.findAll(tracker.class.Project, {})
  const benchProjects = allProjects.filter((p) => p.identifier.startsWith('B'))
  console.log(`\n  total bench projects in DB: ${benchProjects.length}`)

  return benchProjects
}
