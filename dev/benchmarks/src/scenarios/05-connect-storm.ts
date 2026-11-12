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

// Cold connect storm: N clients do the session boot (addSession + hello +
// account round-trip + an initial query) simultaneously - the same work a
// reconnect does. Restart the transactor first for a COLD run.
//   --count N            number of simultaneous clients
//   --tenants            each client its own workspace (prefix{i}/{prefix}ws{i});
//                        every connection cold-starts a DISTINCT pipeline (SaaS herd)
//   --prefix co --start 1
// Without --tenants all clients hit one shared workspace (single pipeline).
import tracker from '@hcengineering/tracker'

import type { BenchConfig } from '../config'
import { connectLive, runStorm, closeAll, type LiveClient, type StormResult } from '../live'

export async function runConnectStorm (cfg: BenchConfig): Promise<StormResult> {
  const held: Array<{ c: LiveClient }> = []
  console.log(
    `\n=== connect-storm: count=${cfg.count} ${cfg.tenants ? `tenants prefix=${cfg.prefix}` : `shared ws=${cfg.workspace}`} ===`
  )

  const result = await runStorm(
    cfg.count,
    async (i) => {
      const s = Date.now()
      const c = cfg.tenants
        ? await connectLive(cfg, { email: `${cfg.prefix}${i}`, workspace: `${cfg.prefix}ws${i}` })
        : await connectLive(cfg)
      await c.findAll(tracker.class.Issue, {}, { limit: 50 }) // post-hello boot burst
      const dt = Date.now() - s
      if (cfg.keepOpen) held.push({ c })
      else await c.close()
      return dt
    },
    { startIdx: cfg.tenants ? cfg.startIdx : 0, label: cfg.tenants ? 'tenant-storm' : 'storm' }
  )

  if (cfg.keepOpen && held.length > 0) {
    console.log(`  holding ${held.length} open for 5s...`)
    await new Promise((r) => setTimeout(r, 5000))
    await closeAll(held)
  }
  return result
}
