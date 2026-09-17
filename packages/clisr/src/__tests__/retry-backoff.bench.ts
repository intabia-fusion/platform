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

// Benchmark for retry backoff: a single client that always rejects binary
// requests. Without backoff the server would spin the retry loop at ~10
// attempts/sec per pending request, burning CPU. With the backoff we expect
// retry rate to drop sharply and never exceed the 5s cap.
//
// Reports retries/sec averaged over the run plus the observed CPU usage so
// regressions in idle behaviour show up in benchmark output.
//
// Opt-in: set BENCH_BACKOFF_ENABLED=1 to actually run. Default test suite
// skips this benchmark so it does not slow CI.
//
// Tunables (env):
//   BENCH_BACKOFF_DURATION  seconds, default 12
//   BENCH_BACKOFF_REQUESTS  in-flight pending requests, default 5

import { ClisrServer } from '../server'
import { ClisrClient } from '../client'
import { MeasureMetricsContext } from '@hcengineering/measurements'
import { createSocketFactory } from './utils/socket-factory'

jest.setTimeout(120000)

const enabled = process.env.BENCH_BACKOFF_ENABLED === '1'
const maybeIt = enabled ? it : it.skip

describe('retry backoff benchmark', () => {
  maybeIt('measures retry rate and CPU under permanent client failures', async () => {
    const ctx = new MeasureMetricsContext('clisr-retry-bench', {})
    const server = new ClisrServer(
      ctx,
      async (tok: string) => tok === 'bench-token',
      '1.0.0',
      undefined,
      async () => ({})
    )
    server.compress = async (x: any) => x
    server.uncompress = async (x: any) => x

    const originalConsole = { info: console.info, log: console.log, warn: console.warn, error: console.error }
    ;(console as any).info = () => {}
    ;(console as any).log = () => {}
    ;(console as any).warn = () => {}
    ;(console as any).error = () => {}

    await server.start(ctx, 0)
    const addr = server.httpServer?.address() as any
    const port = addr?.port ?? 0

    let onConnectResolve!: () => void
    const onConnectP = new Promise<void>((resolve) => {
      onConnectResolve = resolve
    })

    let callCount = 0
    const client = new ClisrClient(
      ctx,
      `ws://127.0.0.1:${port}`,
      () => {},
      () => 'bench-token',
      {
        socketFactory: createSocketFactory(),
        clientHost: 'bench-failing',
        onConnect: async () => {
          onConnectResolve()
        }
      }
    )
    client.compress = async (x: any) => x
    client.uncompress = async (x: any) => x
    client.binaryHandler = async (_c, _method, _data) => {
      callCount++
      throw new Error('synthetic failure')
    }

    await onConnectP
    await client.request('transcription', [true])

    while ((server as any).sessions.size < 1) {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }

    const durationSec = parseInt(process.env.BENCH_BACKOFF_DURATION ?? '12', 10)
    const pendingCount = parseInt(process.env.BENCH_BACKOFF_REQUESTS ?? '5', 10)

    // Fire N pending requests; each will retry forever against the failing client.
    const pending: Promise<any>[] = []
    for (let i = 0; i < pendingCount; i++) {
      const p = server.binaryRequest<Uint8Array>(ctx, 'transcribe', new Uint8Array([i]), undefined, () => true)
      p.catch(() => {})
      pending.push(p)
    }

    const t0 = Date.now()
    const cpu0 = process.cpuUsage()
    await new Promise((resolve) => setTimeout(resolve, durationSec * 1000))
    const cpu1 = process.cpuUsage(cpu0)
    const t1 = Date.now()

    try {
      await client.close()
      await server.close()
      await new Promise((resolve) => setTimeout(resolve, 0))
    } finally {
      ;(console as any).info = originalConsole.info
      ;(console as any).log = originalConsole.log
      ;(console as any).warn = originalConsole.warn
      ;(console as any).error = originalConsole.error
    }

    const elapsedMs = t1 - t0
    const retriesPerSec = callCount / (elapsedMs / 1000)
    const retriesPerSecPerReq = retriesPerSec / pendingCount

    // CPU usage during the wait window.
    const cpuTotalMs = (cpu1.user + cpu1.system) / 1000
    const cpuPct = (cpuTotalMs / elapsedMs) * 100

    // eslint-disable-next-line no-console
    console.error('RETRY BACKOFF BENCHMARK RESULTS')
    // eslint-disable-next-line no-console
    console.error(
      `duration: ${elapsedMs}ms, pendingReqs: ${pendingCount}, totalRetries: ${callCount}, retries/s: ${retriesPerSec.toFixed(
        2
      )}, retries/s/req: ${retriesPerSecPerReq.toFixed(2)}`
    )
    // eslint-disable-next-line no-console
    console.error(
      `cpuUserMs: ${(cpu1.user / 1000).toFixed(1)}, cpuSysMs: ${(cpu1.system / 1000).toFixed(1)}, cpu%: ${cpuPct.toFixed(2)}`
    )

    // Sanity: each pending request must hit a cap of ~12 retries in 12 seconds
    // when backoff reaches its 5s ceiling. Allow generous slack; main goal is
    // catching regressions (e.g. tight loop reintroduced → hundreds of retries/req).
    expect(retriesPerSecPerReq).toBeLessThan(3)
    // And retries must actually happen — we are not asserting only "low" without proof.
    expect(callCount).toBeGreaterThan(pendingCount)
  })
})
