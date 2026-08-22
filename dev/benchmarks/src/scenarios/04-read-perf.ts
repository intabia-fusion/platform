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

// Read-latency perf gate: hot cross-space reads (all-issues / point-lookup /
// activity-feed) plus optional per-cohort in-space reads (board rank-sort,
// recent modon-sort) for a small/medium/large space. Asserts p95 budgets; a
// breach means a missing ordered index or a query regression. Usable as a CI
// gate - the caller exits non-zero when any budget is breached.
import { type Class, type Doc, type Ref, type Space } from '@hcengineering/core'
import tracker from '@hcengineering/tracker'

import type { BenchConfig } from '../config'
import { connectLive, timeIt, type TimeResult } from '../live'

const ACTIVITY_MESSAGE = 'activity:class:ActivityMessage' as Ref<Class<Doc>>

// p95 ceilings (ms). In-space reads should stay fast regardless of space size IF
// ordered/covered; board (rank sort) has no ordered index -> in-mem sort, grows
// with space size, so its budget is per-cohort.
const BOARD_BUDGET: Record<string, number> = { small: 20, medium: 40, large: 120 }

export async function runReadPerf (cfg: BenchConfig): Promise<TimeResult[]> {
  const c = await connectLive(cfg)
  const results: TimeResult[] = []
  console.log(`\n=== read-perf: ${cfg.workspace} (iters=${cfg.iters}) ===`)

  const cohorts: Array<[string, string | undefined]> = [
    ['small', cfg.small],
    ['medium', cfg.medium],
    ['large', cfg.large]
  ]
  if (cohorts.some(([, sp]) => sp !== undefined)) {
    console.log('-- in-space: board (rank sort) + recent (modon sort) per cohort --')
    for (const [name, sp] of cohorts) {
      if (sp === undefined) continue
      const space = sp as any
      results.push(
        await timeIt(`board-${name}`, cfg.iters,
          () => c.findAll(tracker.class.Issue, { space }, { limit: 200, sort: { rank: 1 } }), BOARD_BUDGET[name])
      )
      results.push(
        await timeIt(`recent-${name}`, cfg.iters,
          () => c.findAll(tracker.class.Issue, { space }, { limit: 200, sort: { modifiedOn: -1 } }), 20)
      )
    }
  }

  console.log('-- cross-space (whole ws) --')
  const sample = await c.findAll(tracker.class.Issue, {}, { limit: 1 })
  results.push(
    await timeIt('all-issues', cfg.iters,
      () => c.findAll(tracker.class.Issue, {}, { limit: 200, sort: { modifiedOn: -1 } }), 60)
  )
  results.push(
    await timeIt('activity-feed', cfg.iters,
      () => c.findAll(ACTIVITY_MESSAGE, {}, { limit: 200, sort: { modifiedOn: -1 } }), 80)
  )
  const anId = sample[0]?._id
  if (anId !== undefined) {
    results.push(
      await timeIt('point-lookup', cfg.iters, () => c.findAll(tracker.class.Issue, { _id: anId }), 20)
    )
  }
  await c.close()

  const breaches = results.filter((r) => r.bad)
  if (breaches.length > 0) {
    console.log('\nBUDGET BREACHES:')
    breaches.forEach((b) => console.log(`  x ${b.label}: p95=${b.p95}ms > ${b.budget}ms`))
  } else {
    console.log('\nREAD-PERF GATE: PASS')
  }
  return results
}
