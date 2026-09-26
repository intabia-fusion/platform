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

// Throughput benchmark: N concurrent clients, M workers, measured request/sec
// for JSON server.request() and binary server.binaryRequest(). Reports ops/s,
// MB/s (binary), latency p50/p95/p99 and memory delta.
//
// Complements tmgr.bench (which uses RateLimiter and reports only ops/s) by
// adding per-request latency percentiles and a binary-payload mode.
//
// Opt-in: set BENCH_TP_ENABLED=1 to actually run. Default test suite skips
// this benchmark so it does not slow CI.
//
// Tunables (env):
//   BENCH_TP_CLIENTS    number of clients,    default 5
//   BENCH_TP_WORKERS    concurrent in-flight, default 50
//   BENCH_TP_DURATION   seconds per phase,    default 5
//   BENCH_TP_PAYLOAD    binary payload bytes, default 1024

import { MeasureMetricsContext } from '@hcengineering/measurements'
import { ClisrServer } from '../server'
import { ClisrClient } from '../client'

jest.setTimeout(180000)

const enabled = process.env.BENCH_TP_ENABLED === '1'
const maybeIt = enabled ? it : it.skip

function percentile (sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[idx]
}

function summarise (label: string, latencies: number[], elapsedMs: number, bytes?: number): void {
  const sorted = [...latencies].sort((a, b) => a - b)
  const ops = latencies.length
  const opsPerSec = (ops / elapsedMs) * 1000
  const p50 = percentile(sorted, 50)
  const p95 = percentile(sorted, 95)
  const p99 = percentile(sorted, 99)
  const max = sorted[sorted.length - 1] ?? 0
  const parts = [
    `ops: ${ops}`,
    `duration: ${elapsedMs}ms`,
    `ops/s: ${opsPerSec.toFixed(0)}`,
    `p50: ${p50.toFixed(2)}ms`,
    `p95: ${p95.toFixed(2)}ms`,
    `p99: ${p99.toFixed(2)}ms`,
    `max: ${max.toFixed(2)}ms`
  ]
  if (bytes !== undefined) {
    const mbPerSec = bytes / (elapsedMs / 1000) / (1024 * 1024)
    parts.push(`MB/s: ${mbPerSec.toFixed(2)}`)
  }
  // eslint-disable-next-line no-console
  console.error(`${label} ${parts.join(', ')}`)
}

interface BenchEnv {
  server: ClisrServer
  port: number
  ctx: MeasureMetricsContext
  clients: ClisrClient[]
  restoreConsole: () => void
}

async function setupEnv (clientCount: number, payloadSize: number): Promise<BenchEnv> {
  const ctx = new MeasureMetricsContext('clisr-throughput-bench', {})
  const server = new ClisrServer(ctx, async (tok: string) => tok === 'bench-token', '1.0.0')
  // Skip native snappy for a clean process and lower noise.
  server.compress = async (x: any) => x
  server.uncompress = async (x: any) => x

  const original = { info: console.info, log: console.log, warn: console.warn, error: console.error }
  ;(console as any).info = () => {}
  ;(console as any).log = () => {}
  ;(console as any).warn = () => {}

  await server.start(ctx, 0)
  const addr = server.httpServer?.address() as any
  const port = addr?.port ?? 0

  const clients: ClisrClient[] = []
  const connects: Promise<void>[] = []
  // Pre-allocate the binary response once; clients return the same buffer for every call.
  const binaryResponse = new Uint8Array(payloadSize)
  for (let i = 0; i < payloadSize; i++) binaryResponse[i] = i & 0xff

  for (let i = 0; i < clientCount; i++) {
    let _resolve!: () => void
    connects.push(
      new Promise<void>((resolve) => {
        _resolve = resolve
      })
    )
    const client = new ClisrClient(
      ctx,
      `ws://127.0.0.1:${port}`,
      () => {},
      () => 'bench-token',
      {
        clientHost: `bench-tp-${i}`,
        onConnect: async () => {
          _resolve()
        }
      }
    )
    client.compress = async (x: any) => x
    client.uncompress = async (x: any) => x
    client.callbackHandler = async (_c, _method, _params) => {
      return { ok: true }
    }
    client.binaryHandler = async (_c, _method, _data) => binaryResponse
    clients.push(client)
  }

  await Promise.all(connects)
  while ((server as any).sessions.size < clientCount) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }

  return {
    server,
    port,
    ctx,
    clients,
    restoreConsole: () => {
      ;(console as any).info = original.info
      ;(console as any).log = original.log
      ;(console as any).warn = original.warn
      ;(console as any).error = original.error
    }
  }
}

async function teardownEnv (env: BenchEnv): Promise<void> {
  for (const c of env.clients) {
    try {
      await c.close()
    } catch (_e) {}
  }
  try {
    await env.server.close()
  } catch (_e) {}
  await new Promise((resolve) => setTimeout(resolve, 0))
  env.restoreConsole()
}

describe('throughput benchmark', () => {
  maybeIt('measures JSON and binary request throughput with latency percentiles', async () => {
    const clientCount = parseInt(process.env.BENCH_TP_CLIENTS ?? '5', 10)
    const workerCount = parseInt(process.env.BENCH_TP_WORKERS ?? '50', 10)
    const durationSec = parseInt(process.env.BENCH_TP_DURATION ?? '5', 10)
    const payloadSize = parseInt(process.env.BENCH_TP_PAYLOAD ?? '1024', 10)

    const env = await setupEnv(clientCount, payloadSize)
    try {
      // ---- Phase 1: JSON throughput ----
      const jsonLatencies: number[] = []
      const memBefore = process.memoryUsage()

      const jsonEndTime = Date.now() + durationSec * 1000
      const jsonT0 = Date.now()
      const jsonWorker = async (): Promise<void> => {
        while (Date.now() < jsonEndTime) {
          const t = Date.now()
          try {
            await env.server.request(env.ctx, 'bench-op', ['payload'])
            jsonLatencies.push(Date.now() - t)
          } catch (err) {
            // record latency even on failure so a stuck server doesn't show as "fast"
            jsonLatencies.push(Date.now() - t)
          }
        }
      }
      await Promise.all(Array.from({ length: workerCount }, () => jsonWorker()))
      const jsonElapsed = Date.now() - jsonT0
      summarise(`THROUGHPUT JSON clients=${clientCount} workers=${workerCount}:`, jsonLatencies, jsonElapsed)

      // ---- Phase 2: Binary throughput ----
      const binLatencies: number[] = []
      const payload = new Uint8Array(payloadSize)
      for (let i = 0; i < payloadSize; i++) payload[i] = i & 0xff

      const binEndTime = Date.now() + durationSec * 1000
      const binT0 = Date.now()
      let bytesSent = 0
      const binWorker = async (): Promise<void> => {
        while (Date.now() < binEndTime) {
          const t = Date.now()
          try {
            const res = await env.server.binaryRequest<Uint8Array>(env.ctx, 'bench-binary', payload)
            binLatencies.push(Date.now() - t)
            bytesSent += payload.byteLength + (res?.byteLength ?? 0)
          } catch (err) {
            binLatencies.push(Date.now() - t)
          }
        }
      }
      await Promise.all(Array.from({ length: workerCount }, () => binWorker()))
      const binElapsed = Date.now() - binT0
      summarise(
        `THROUGHPUT BINARY clients=${clientCount} workers=${workerCount} payload=${payloadSize}B:`,
        binLatencies,
        binElapsed,
        bytesSent
      )

      const memAfter = process.memoryUsage()
      // eslint-disable-next-line no-console
      console.error(
        `THROUGHPUT MEMORY heapDelta=${memAfter.heapUsed - memBefore.heapUsed}B rssDelta=${memAfter.rss - memBefore.rss}B`
      )

      // Sanity: both phases must have made progress.
      expect(jsonLatencies.length).toBeGreaterThan(0)
      expect(binLatencies.length).toBeGreaterThan(0)
    } finally {
      await teardownEnv(env)
    }
  })
})
