/* eslint-env jest */
// Benchmark: 1 TMGR server, 5 clients, 1ms executor, measure ops/sec and memory.

import { MeasureMetricsContext } from '@hcengineering/measurements'
import { ClisrServer } from '../server'
import { ClisrClient } from '../client'

jest.setTimeout(120000)

describe('TMGR benchmark (integration-like)', () => {
  it('measures throughput and memory with 1 server and 5 clients (1ms op) using RateLimiter(100)', async () => {
    const ctx = new MeasureMetricsContext('tmgr-bench', {})

    // Minimal local RateLimiter matching the project's semantics
    class RateLimiter {
      idCounter = 0
      processing = new Map<number, Promise<void>>()
      rate: number
      notify: (() => void)[] = []

      constructor (rate: number) {
        this.rate = rate
      }

      async exec<T>(op: () => Promise<T>): Promise<T> {
        const processingId = this.idCounter++
        while (this.processing.size >= this.rate) {
          await new Promise<void>((resolve) => this.notify.push(resolve))
        }
        try {
          const p = op()
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          this.processing.set(processingId, p as unknown as Promise<void>)
          return await p
        } finally {
          this.processing.delete(processingId)
          const n = this.notify.shift()
          if (n != null) n()
        }
      }

      async waitProcessing (): Promise<void> {
        while (this.processing.size > 0) {
          await new Promise<void>((resolve) => this.notify.push(resolve))
        }
      }
    }

    // Start server
    const server = new ClisrServer(ctx, async (tok: string) => tok === 'bench-token', '1.0.0')
    // Avoid loading native snappy in benchmark run to keep test process clean
    server.compress = async (x: any) => x
    server.uncompress = async (x: any) => x

    // Mute console logs for the duration of the benchmark (including setup)
    const originalConsole = { info: console.info, log: console.log, warn: console.warn }
    ;(console as any).info = () => {}
    ;(console as any).log = () => {}
    ;(console as any).warn = () => {}

    await server.start(ctx, 0)
    const addr = server.httpServer?.address() as any
    const port = addr?.port ?? 0

    // Create 5 clients
    const clients: ClisrClient[] = []
    const connectPromises: Promise<void>[] = []

    for (let i = 0; i < 5; i++) {
      let resolveConn!: () => void
      const p = new Promise<void>((resolve) => (resolveConn = resolve))
      connectPromises.push(p)

      const client = new ClisrClient(
        ctx,
        `ws://127.0.0.1:${port}`,
        (_ctx) => 'bench-token',
        () => 'bench-token',
        {
          onConnect: async () => {
            resolveConn()
          }
        }
      )

      // Avoid using native snappy for clients as well in the benchmark
      client.compress = async (x: any) => x
      client.uncompress = async (x: any) => x

      // 1ms executor
      client.callbackHandler = async (_method, _args, send) => {
        await new Promise((resolve) => setTimeout(resolve, 1))
        await send({ ok: true })
      }

      clients.push(client)
    }

    // Wait all clients connected
    await Promise.all(connectPromises)

    // Ensure server has sessions registered
    while ((server as any).sessions.size < 5) {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }

    const rateLimiter = new RateLimiter(100)
    const parsedDur = parseInt(process.env.BENCH_DURATION ?? '5', 10)
    const durationEnv = process.env.BENCH_DURATION
    const durationSeconds = durationEnv !== undefined ? (Number.isNaN(parsedDur) ? 5 : parsedDur) : undefined

    const totalOpsEnv = process.env.BENCH_OPS
    const parsedOps = totalOpsEnv !== undefined ? parseInt(totalOpsEnv, 10) : undefined
    const totalOpsTarget = parsedOps === undefined || Number.isNaN(parsedOps) ? 100 : Math.max(1, parsedOps)

    const workerCountEnv = process.env.BENCH_WORKERS
    const parsedWorkers = workerCountEnv !== undefined ? parseInt(workerCountEnv, 10) : undefined
    const workerCount = parsedWorkers === undefined || Number.isNaN(parsedWorkers) ? 100 : Math.max(1, parsedWorkers)

    let ops = 0

    // Worker loop: controlled either by time (durationSeconds set) or by totalOpsTarget
    const worker = async (): Promise<void> => {
      if (durationSeconds !== undefined) {
        const endTime = Date.now() + durationSeconds * 1000
        while (Date.now() < endTime) {
          try {
            await rateLimiter.exec(async () => {
              await server.request(ctx, 'bench-op', ['payload'])
            })
            ops++
          } catch (err) {
            // keep going on transient errors
            // eslint-disable-next-line no-console
            console.error('bench op failed', err)
          }
        }
        return
      }

      // Fixed-op mode: run until we reach totalOpsTarget
      while (true) {
        // Atomically check/increment ops to avoid overshoot
        if (ops >= totalOpsTarget) return
        try {
          await rateLimiter.exec(async () => {
            await server.request(ctx, 'bench-op', ['payload'])
          })
          ops++
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('bench op failed', err)
        }
        if (ops >= totalOpsTarget) return
      }
    }

    // Start workers (configurable)
    const workers: Promise<void>[] = []
    for (let i = 0; i < workerCount; i++) {
      workers.push(worker())
    }

    const memBefore = process.memoryUsage()
    const t0 = Date.now()

    try {
      // Wait for workers to finish
      await Promise.all(workers)

      // Wait for any in-flight operations to settle
      await rateLimiter.waitProcessing()

      // Cleanup sockets & server first to avoid logging after test completion
      for (const c of clients) {
        await c.close()
      }
      await server.close()

      // Give a tick for close events to be processed by ws
      await new Promise((resolve) => setTimeout(resolve, 0))
    } finally {
      // Restore console for final reporting
      ;(console as any).info = originalConsole.info
      ;(console as any).log = originalConsole.log
      ;(console as any).warn = originalConsole.warn
    }

    const t1 = Date.now()
    const memAfter = process.memoryUsage()

    const elapsedMs = t1 - t0
    const opsPerSec = Math.round((ops / elapsedMs) * 1000)

    // Report benchmark summary to stderr so CI scripts capture it reliably
    // eslint-disable-next-line no-console
    console.error('TMGR BENCHMARK RESULTS')
    // eslint-disable-next-line no-console
    console.error(`duration: ${elapsedMs}ms, ops: ${ops}, ops/s: ${opsPerSec}`)
    // eslint-disable-next-line no-console
    console.error('memory delta (heapUsed):', memAfter.heapUsed - memBefore.heapUsed)
    // eslint-disable-next-line no-console
    console.error('memory (rss) delta:', memAfter.rss - memBefore.rss)

    // Basic sanity assertions
    expect(ops).toBeGreaterThan(0)
    // Report memory delta, but do not fail the benchmark run on memory growth (info only)
    const heapDelta = memAfter.heapUsed - memBefore.heapUsed
    const rssDelta = memAfter.rss - memBefore.rss
    if (heapDelta > 100 * 1024 * 1024) {
      // eslint-disable-next-line no-console
      console.warn(`Large heap growth observed: ${heapDelta}`)
    }
    // eslint-disable-next-line no-console
    console.error('bench-memory-heap-delta:', heapDelta)
    // eslint-disable-next-line no-console
    console.error('bench-memory-rss-delta:', rssDelta)
  })
})
