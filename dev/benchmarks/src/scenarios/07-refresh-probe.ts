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

// Measures the lastTx-cache fix: after a transactor restart a client that was up to
// date should reconnect as Reconnected (no LiveQuery refetch), not Refresh (refetch of
// every active subscription). One LiveQuery per client; count callback fires before and
// after the restart. With the fix: 0 refetched. Without: all N refetch.
//   --count N --prefix co
//   --disrupt "docker kill sanity-transactor0-1 && docker start sanity-transactor0-1"
import { readFileSync } from 'node:fs'
import tracker from '@hcengineering/tracker'

import type { BenchConfig } from '../config'
import { connectLive, disrupt, closeAll, type LiveClient } from '../live'

const DEFAULT_DISRUPT = 'docker kill sanity-transactor0-1 && docker start sanity-transactor0-1'
// Reconnecting clients retry internally and never reject; bound the initial connect so one
// slow cold-boot can't hang Promise.all. A timed-out connect resolves to null (excluded).
const CONNECT_TIMEOUT_MS = 30000
const sleep = async (ms: number): Promise<void> => await new Promise((r) => setTimeout(r, ms))

export interface RefreshProbeResult { connected: number, refetched: number, extraFires: number }

function loadPairs (cfg: BenchConfig): Array<{ email: string, workspace: string }> {
  if (cfg.manifest !== undefined) {
    const manifest = JSON.parse(readFileSync(cfg.manifest, 'utf8')) as Record<string, string[]>
    const pairs: Array<{ email: string, workspace: string }> = []
    for (const [ws, users] of Object.entries(manifest)) {
      for (const email of users) pairs.push({ email, workspace: ws })
    }
    return pairs
  }
  return Array.from({ length: cfg.count }, (_, k) => {
    const i = cfg.startIdx + k
    return { email: `${cfg.prefix}${i}`, workspace: `${cfg.prefix}ws${i}` }
  })
}

export async function runRefreshProbe (cfg: BenchConfig): Promise<RefreshProbeResult> {
  const pairs = loadPairs(cfg)
  const clients = (
    await Promise.all(
      pairs.map(async (p) =>
        await Promise.race([
          connectLive(cfg, { email: p.email, workspace: p.workspace }).then((c) => ({ c })).catch(() => null),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), CONNECT_TIMEOUT_MS))
        ])
      )
    )
  ).filter((x): x is { c: LiveClient } => x !== null)
  console.log(`connected ${clients.length}/${pairs.length}`)

  const fires = new Array(clients.length).fill(0)
  clients.forEach((cl, idx) => {
    const lq = cl.c.createLiveQuery()
    lq.query(tracker.class.Issue, {}, () => { fires[idx]++ }, { limit: 5 })
  })
  await sleep(3000)
  const baseline = [...fires]
  console.log(`baseline fires (initial subscribe): total=${baseline.reduce((a, b) => a + b, 0)}`)

  const disruptCmd = cfg.disruptCmd ?? DEFAULT_DISRUPT
  console.log(`disrupt: ${disruptCmd}`)
  await disrupt(disruptCmd)
  await sleep(25000) // wait for reconnect + any refetch to settle

  let refetched = 0
  let extraFires = 0
  for (let i = 0; i < clients.length; i++) {
    const d = fires[i] - baseline[i]
    if (d > 0) { refetched++; extraFires += d }
  }
  console.log(
    `REFRESH-PROBE N=${clients.length}: refetched after restart = ${refetched}/${clients.length} (extra fires=${extraFires})`
  )
  console.log(refetched === 0 ? '=> Reconnected (no refetch) - lastTx cache HIT' : '=> Refresh (refetch) - lastTx missing/changed')

  await closeAll(clients)
  return { connected: clients.length, refetched, extraFires }
}
