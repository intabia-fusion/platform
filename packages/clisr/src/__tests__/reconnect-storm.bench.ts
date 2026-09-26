/* eslint-env jest */
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

// Reconnect storm benchmark: connect N clients, then forcefully close every
// server-side socket at the same moment. Clients schedule reconnect; we measure
// time-to-stable (all sessions back) plus CPU usage during the storm.
//
// Stresses the reconnect path and the recently added retry backoff: a bad fix
// here will surface as either a CPU spike (no backoff) or as slow recovery
// (backoff too aggressive / stale state preventing reconnect).
//
// Opt-in: set BENCH_STORM_ENABLED=1 to actually run. Default test suite skips
// this benchmark so it does not slow CI.
//
// Tunables (env):
//   BENCH_STORM_CLIENTS  number of clients,    default 25
//   BENCH_STORM_WAVES    storm repetitions,    default 3
//   BENCH_STORM_TIMEOUT  ms to wait recovery,  default 15000

import { MeasureMetricsContext } from '@hcengineering/measurements'
import { ClisrServer } from '../server'
import { ClisrClient } from '../client'
import { ClientConnectEvent } from '../types'

jest.setTimeout(180000)

const enabled = process.env.BENCH_STORM_ENABLED === '1'
const maybeIt = enabled ? it : it.skip

interface Env {
  server: ClisrServer
  port: number
  ctx: MeasureMetricsContext
  clients: ClisrClient[]
  reconnectCounts: number[]
  restore: () => void
}

async function setup (clientCount: number): Promise<Env> {
  const ctx = new MeasureMetricsContext('clisr-reconnect-storm', {})
  const server = new ClisrServer(ctx, async (tok: string) => tok === 'storm-token', '1.0.0')
  server.compress = async (x: any) => x
  server.uncompress = async (x: any) => x
  // Quicker session cleanup so a re-hello with the same sessionId is allowed
  // promptly during the storm.
  server.reconnectTimeout = 500
  server.tickIntervalMs = 100

  const original = { info: console.info, log: console.log, warn: console.warn, error: console.error }
  ;(console as any).info = () => {}
  ;(console as any).log = () => {}
  ;(console as any).warn = () => {}

  await server.start(ctx, 0)
  const addr = server.httpServer?.address() as any
  const port = addr?.port ?? 0

  const clients: ClisrClient[] = []
  const reconnectCounts: number[] = []
  const initialConnects: Promise<void>[] = []

  for (let i = 0; i < clientCount; i++) {
    let resolveInitial!: () => void
    initialConnects.push(
      new Promise<void>((resolve) => {
        resolveInitial = resolve
      })
    )
    reconnectCounts.push(0)
    const idx = i

    const client = new ClisrClient(
      ctx,
      `ws://127.0.0.1:${port}`,
      () => {},
      () => 'storm-token',
      {
        clientHost: `storm-${i}`,
        onConnect: async (event: ClientConnectEvent) => {
          if (event === ClientConnectEvent.Connected) {
            resolveInitial()
          } else if (event === ClientConnectEvent.Reconnected) {
            reconnectCounts[idx]++
          }
        }
      }
    )
    client.compress = async (x: any) => x
    client.uncompress = async (x: any) => x
    client.callbackHandler = async () => ({ ok: true })
    clients.push(client)
  }

  await Promise.all(initialConnects)
  while ((server as any).sessions.size < clientCount) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }

  return {
    server,
    port,
    ctx,
    clients,
    reconnectCounts,
    restore: () => {
      ;(console as any).info = original.info
      ;(console as any).log = original.log
      ;(console as any).warn = original.warn
      ;(console as any).error = original.error
    }
  }
}

async function teardown (env: Env): Promise<void> {
  for (const c of env.clients) {
    try {
      await c.close()
    } catch (_e) {}
  }
  try {
    await env.server.close()
  } catch (_e) {}
  await new Promise((resolve) => setTimeout(resolve, 0))
  env.restore()
}

async function waitForSessions (server: ClisrServer, expected: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if ((server as any).sessions.size >= expected) return true
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  return false
}

// Wait until session count drops below `before`. The "drop" is what makes
// "time-to-stable" meaningful — otherwise the recovery timer measures the
// gap between firing the storm and the server merely noticing it.
async function waitForDrop (server: ClisrServer, before: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if ((server as any).sessions.size < before) return true
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  return false
}

describe('reconnect storm benchmark', () => {
  maybeIt('measures time-to-stable and CPU after forced disconnect waves', async () => {
    const clientCount = parseInt(process.env.BENCH_STORM_CLIENTS ?? '25', 10)
    const waves = parseInt(process.env.BENCH_STORM_WAVES ?? '3', 10)
    const recoveryTimeoutMs = parseInt(process.env.BENCH_STORM_TIMEOUT ?? '15000', 10)

    const env = await setup(clientCount)

    try {
      const recoveryTimes: number[] = []
      const cpuPerWave: number[] = []

      for (let wave = 0; wave < waves; wave++) {
        // Force every server-side socket to close at once. Clients see disconnect
        // and schedule reconnect.
        const sessionsBefore = (env.server as any).sessions.size
        const sessionsSnapshot = Array.from((env.server as any).sessions.values())
        const stormStart = Date.now()
        const cpu0 = process.cpuUsage()
        for (const s of sessionsSnapshot) {
          try {
            ;(s as any).socket.close()
          } catch (_e) {}
        }

        // First confirm the storm took effect, then measure recovery.
        const dropped = await waitForDrop(env.server, sessionsBefore, recoveryTimeoutMs)
        const dropMs = Date.now() - stormStart
        const recovered = await waitForSessions(env.server, clientCount, recoveryTimeoutMs)
        const recoveryMs = Date.now() - stormStart
        const cpu1 = process.cpuUsage(cpu0)
        const cpuMs = (cpu1.user + cpu1.system) / 1000
        const cpuPct = (cpuMs / Math.max(1, recoveryMs)) * 100

        recoveryTimes.push(recoveryMs)
        cpuPerWave.push(cpuPct)

        // eslint-disable-next-line no-console
        console.error(
          `STORM wave=${wave + 1}/${waves} clients=${clientCount} ` +
            `dropDetected=${dropped} dropMs=${dropMs}ms ` +
            `recoveredAll=${recovered} time-to-stable=${recoveryMs}ms cpu%=${cpuPct.toFixed(2)}`
        )

        expect(dropped).toBe(true)
        expect(recovered).toBe(true)

        // Settle a bit before the next wave so reconnectTimeout cleanup runs.
        await new Promise((resolve) => setTimeout(resolve, 600))
      }

      const avgRecovery = recoveryTimes.reduce((a, b) => a + b, 0) / recoveryTimes.length
      const maxRecovery = Math.max(...recoveryTimes)
      const avgCpu = cpuPerWave.reduce((a, b) => a + b, 0) / cpuPerWave.length
      const totalReconnects = env.reconnectCounts.reduce((a, b) => a + b, 0)

      // eslint-disable-next-line no-console
      console.error(
        `STORM SUMMARY clients=${clientCount} waves=${waves} ` +
          `avgRecoveryMs=${avgRecovery.toFixed(0)} maxRecoveryMs=${maxRecovery} ` +
          `avgCpuPct=${avgCpu.toFixed(2)} totalClientReconnectEvents=${totalReconnects}`
      )

      // Each wave must produce at least one reconnect event per client (sanity).
      expect(totalReconnects).toBeGreaterThanOrEqual(waves * clientCount - clientCount)
    } finally {
      await teardown(env)
    }
  })
})
