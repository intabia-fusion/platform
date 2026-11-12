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

// Real reconnect storm: connect N clients KEPT OPEN (they cache the model), warm
// them, then disrupt (kill/restart the transactor or nginx) and measure per-client
// recovery - the true reconnect cost (model-hash match / delta), not first-login.
//   --count N --prefix co         one workspace per client (prefixNN / {prefix}wsNN)
//   --manifest path.json          { ws: [email,...] } from tests/make-multiuser.sh;
//                                  buckets recovery by workspace size (shared cold build)
//   --disrupt "docker kill sanity-transactor0-1 && docker start sanity-transactor0-1"
//             (default), e.g. "docker restart sanity-nginx-1" for a network-drop run
import { readFileSync } from 'node:fs'
import tracker from '@hcengineering/tracker'

import type { BenchConfig } from '../config'
import { connectLive, measureRecovery, closeAll, pct, type LiveClient } from '../live'

interface Pair { email: string, workspace: string, size: number }

const DEFAULT_DISRUPT = 'docker kill sanity-transactor0-1 && docker start sanity-transactor0-1'
const bucketOf = (n: number): string => (n <= 5 ? '1-5' : n <= 20 ? '6-20' : '21-50')

function loadPairs (cfg: BenchConfig): Pair[] {
  if (cfg.manifest !== undefined) {
    const manifest = JSON.parse(readFileSync(cfg.manifest, 'utf8')) as Record<string, string[]>
    const pairs: Pair[] = []
    for (const [ws, users] of Object.entries(manifest)) {
      for (const email of users) pairs.push({ email, workspace: ws, size: users.length })
    }
    return pairs
  }
  return Array.from({ length: cfg.count }, (_, k) => {
    const i = cfg.startIdx + k
    return { email: `${cfg.prefix}${i}`, workspace: `${cfg.prefix}ws${i}`, size: 1 }
  })
}

export interface RecoverStormResult {
  connected: number
  recovered: number
  wallMs: number
  p50: number
  p95: number
  max: number
}

export async function runRecoverStorm (cfg: BenchConfig): Promise<RecoverStormResult> {
  const pairs = loadPairs(cfg)
  console.log(`\n=== recover-storm: connecting ${pairs.length} clients (kept open) ===`)
  const clients = (
    await Promise.all(
      pairs.map((p) =>
        connectLive(cfg, { email: p.email, workspace: p.workspace })
          .then((c) => ({ c, ...p }))
          .catch(() => null)
      )
    )
  ).filter((x): x is { c: LiveClient } & Pair => x !== null)
  console.log(`connected ${clients.length}/${pairs.length}`)

  const disruptCmd = cfg.disruptCmd ?? DEFAULT_DISRUPT
  console.log(`disrupt: ${disruptCmd}`)
  const { wallMs, rec } = await measureRecovery(
    clients,
    (c) => c.findAll(tracker.class.Issue, {}, { limit: 5 }),
    disruptCmd
  )

  const dts = rec.map((r) => r.dt)
  console.log(
    `RECOVER-STORM clients=${clients.length}: wall=${wallMs}ms recovered=${rec.length}\n` +
      `  recover-from-disrupt p50=${pct(dts, 0.5)}ms p95=${pct(dts, 0.95)}ms max=${Math.max(...dts, 0)}ms`
  )

  // Per-ws-size buckets (manifest case): 2nd+ user of a ws hits a warm pipeline.
  const byBucket: Record<string, number[]> = { '1-5': [], '6-20': [], '21-50': [] }
  const wsFirst: Record<string, number> = {}
  for (const { dt, item } of rec) {
    byBucket[bucketOf(item.size)].push(dt)
    wsFirst[item.workspace] = Math.min(wsFirst[item.workspace] ?? Infinity, dt)
  }
  if (cfg.manifest !== undefined) {
    for (const b of ['1-5', '6-20', '21-50']) {
      const a = byBucket[b]
      if (a.length === 0) continue
      console.log(`  ws-size ${b.padEnd(5)}: users=${String(a.length).padStart(4)} p50=${pct(a, 0.5)}ms p95=${pct(a, 0.95)}ms`)
    }
    const firsts = Object.values(wsFirst)
    console.log(`  per-ws first-recover (cold-build payer): p50=${pct(firsts, 0.5)}ms p95=${pct(firsts, 0.95)}ms`)
  }

  await closeAll(clients)
  return {
    connected: clients.length,
    recovered: rec.length,
    wallMs,
    p50: pct(dts, 0.5),
    p95: pct(dts, 0.95),
    max: Math.max(...dts, 0)
  }
}
