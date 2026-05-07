//
// Copyright © 2026 Intabia Fusion.
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//

// Broadcast throughput benchmark.
// One producer creates Channel docs in a single workspace; N subscribers
// observe txes via createLiveQuery and report end-to-end deliveries/sec.
//
// Skipped by default: needs the ws-tests stand. Set BENCH_BROADCAST=1 to run.
//
// Tunable via env: BENCH_SUBS, BENCH_DOCS, BENCH_BURST

import { connect } from '@hcengineering/api-client'
import core, { generateId, type Ref } from '@hcengineering/core'
import chunter, { type Channel } from '@hcengineering/chunter'
import { spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { Worker } from 'worker_threads'

const URL = process.env.BENCH_URL ?? 'http://localhost:8083'
const WS = process.env.BENCH_WS ?? 'api-tests'
const SUBS = parseInt(process.env.BENCH_SUBS ?? '20')
const DOCS = parseInt(process.env.BENCH_DOCS ?? '500')
const BURST = parseInt(process.env.BENCH_BURST ?? '50')
const LABEL = process.env.BENCH_LABEL ?? 'default'
const STATS_TARGETS = (process.env.BENCH_STATS_TARGETS ?? 'sanity-transactor0-1,sanity-transactor1-1')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const STATS_OUT_DIR = process.env.BENCH_STATS_DIR ?? '/tmp/bench-stats'
// Padding bytes added to each broadcast tx description to fatten the message.
// Higher value = faster server-side ws.bufferedAmount growth -> drop path triggers.
const DOC_PADDING = parseInt(process.env.BENCH_DOC_PADDING ?? '0')
// Fraction of subscribers that simulate slow consumers by stalling their event loop
// inside the LiveQuery callback. Range 0..1. The stall amount is BENCH_SLOW_DELAY_MS.
const SLOW_FRACTION = parseFloat(process.env.BENCH_SLOW_FRACTION ?? '0')
const SLOW_DELAY_MS = parseInt(process.env.BENCH_SLOW_DELAY_MS ?? '50')
const ENABLED = process.env.BENCH_BROADCAST === '1'

const dtest = ENABLED ? describe : describe.skip

interface StatSample {
  ts: number
  container: string
  cpu: number
  memMb: number
}

function startDockerStats (containers: string[]): { stop: () => Promise<StatSample[]> } {
  const samples: StatSample[] = []
  const procs: any[] = []
  for (const c of containers) {
    // docker stats --no-trunc --format streams CPU%, MemUsage every ~1s
    const p = spawn('docker', ['stats', c, '--format', '{{.CPUPerc}}|{{.MemUsage}}'], {
      stdio: ['ignore', 'pipe', 'pipe']
    })
    p.stdout.setEncoding('utf8')
    p.stdout.on('data', (chunk: string) => {
      // chunk may contain ANSI clear sequences; split lines
      for (const raw of chunk.split('\n')) {
        // eslint-disable-next-line no-control-regex
        const line = raw.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '').trim()
        if (line === '' || !line.includes('|')) continue
        const [cpuStr, memUsage] = line.split('|')
        const cpu = parseFloat(cpuStr.replace('%', '').trim())
        const memMatch = memUsage.match(/([\d.]+)\s*([KMG]i?B)/i)
        let memMb = 0
        if (memMatch != null) {
          const val = parseFloat(memMatch[1])
          const unit = memMatch[2].toUpperCase()
          memMb = unit.startsWith('G') ? val * 1024 : unit.startsWith('K') ? val / 1024 : val
        }
        if (!isNaN(cpu)) samples.push({ ts: Date.now(), container: c, cpu, memMb })
      }
    })
    procs.push(p)
  }
  return {
    stop: async () => {
      for (const p of procs) {
        try {
          p.kill('SIGTERM')
        } catch {}
      }
      await new Promise((resolve) => setTimeout(resolve, 200))
      return samples
    }
  }
}

function summarize (
  samples: StatSample[]
): Record<string, { cpuAvg: number, cpuMax: number, memAvgMb: number, memMaxMb: number, n: number }> {
  const byContainer = new Map<string, StatSample[]>()
  for (const s of samples) {
    const arr = byContainer.get(s.container) ?? []
    arr.push(s)
    byContainer.set(s.container, arr)
  }
  const out: Record<string, any> = {}
  for (const [c, arr] of byContainer) {
    if (arr.length === 0) continue
    const cpuAvg = arr.reduce((a, s) => a + s.cpu, 0) / arr.length
    const cpuMax = arr.reduce((a, s) => Math.max(a, s.cpu), 0)
    const memAvg = arr.reduce((a, s) => a + s.memMb, 0) / arr.length
    const memMax = arr.reduce((a, s) => Math.max(a, s.memMb), 0)
    out[c] = {
      cpuAvg: Math.round(cpuAvg * 10) / 10,
      cpuMax: Math.round(cpuMax * 10) / 10,
      memAvgMb: Math.round(memAvg * 10) / 10,
      memMaxMb: Math.round(memMax * 10) / 10,
      n: arr.length
    }
  }
  return out
}

dtest('broadcast benchmark', () => {
  jest.setTimeout(15 * 60 * 1000)

  it(`producer + ${SUBS} subscribers x ${DOCS} docs`, async () => {
    const producer = await connect(URL, { email: 'user1', password: '1234', workspace: WS })

    // Worker-per-subscriber: each LiveQuery callback runs in its own thread, so a
    // slow consumer (busy-spin in callback) doesn't block fast peers and keeps
    // server-side ws.bufferedAmount climbing toward the drop threshold.
    const workerPath = path.resolve(__dirname, '../../lib/__tests__/bench-sub.worker.js')
    const seen = new Map<number, Set<string>>()
    let totalDeliveries = 0
    const workers: Worker[] = []
    const closeAll = async (): Promise<void> => {
      try {
        await producer.close?.()
      } catch {}
      for (const w of workers) {
        try {
          w.postMessage({ type: 'close' })
        } catch {}
      }
      await Promise.all(
        workers.map(
          async (w) => {
            await new Promise<void>((resolve) => {
              const t = setTimeout(() => {
                resolve()
              }, 5000)
              w.once('exit', () => {
                clearTimeout(t)
                resolve()
              })
            })
          }
        )
      )
    }
    try {
      const slowCutoff = Math.floor(SUBS * SLOW_FRACTION)
      const readyPromises: Array<Promise<void>> = []
      for (let i = 0; i < SUBS; i++) {
        const slow = i < slowCutoff
        const set = new Set<string>()
        seen.set(i, set)
        const w = new Worker(workerPath, {
          workerData: { url: URL, ws: WS, slow, slowDelayMs: SLOW_DELAY_MS }
        })
        workers.push(w)
        readyPromises.push(
          new Promise<void>((resolve, reject) => {
            const onMsg = (msg: any): void => {
              if (msg?.type === 'ready') {
                w.off('message', onMsg)
                resolve()
              } else if (msg?.type === 'error') {
                w.off('message', onMsg)
                reject(new Error(String(msg.err)))
              } else if (msg?.type === 'tx' && Array.isArray(msg.ids)) {
                for (const id of msg.ids) {
                  if (!set.has(id)) {
                    set.add(id)
                    totalDeliveries++
                  }
                }
              }
            }
            w.on('message', onMsg)
            w.on('error', reject)
          })
        )
        // Keep aggregating tx after ready too.
        w.on('message', (msg: any) => {
          if (msg?.type === 'tx' && Array.isArray(msg.ids)) {
            for (const id of msg.ids) {
              if (!set.has(id)) {
                set.add(id)
                totalDeliveries++
              }
            }
          }
        })
      }
      await Promise.all(readyPromises)
      const padding = DOC_PADDING > 0 ? 'x'.repeat(DOC_PADDING) : ''

      // Start docker stats sampling for the configured containers.
      const stats = STATS_TARGETS.length > 0 ? startDockerStats(STATS_TARGETS) : null

      const sentIds: Array<Ref<Channel>> = []
      const start = Date.now()
      for (let i = 0; i < DOCS; i++) {
        const id = generateId<Channel>()
        sentIds.push(id)
        await producer.createDoc(
          chunter.class.Channel,
          core.space.Workspace,
          {
            name: 'bench-' + id,
            description: padding,
            private: false,
            archived: false,
            members: [],
            topic: '',
            autoJoin: false
          },
          id
        )
        if (i % BURST === BURST - 1) {
          // Small breath so the producer's own broadcast stack does not overwhelm
          // the WS pipeline; remove to stress harder.
          await new Promise((resolve) => setImmediate(resolve))
        }
      }
      const sendDoneMs = Date.now() - start

      // Wait for all subs to catch up (configurable, default 120s).
      const target = SUBS * DOCS
      const waitMs = parseInt(process.env.BENCH_WAIT_MS ?? '120000')
      const deadline = Date.now() + waitMs
      // totalDeliveries is mutated by the LiveQuery callback registered earlier.
      // eslint-disable-next-line no-unmodified-loop-condition
      while (totalDeliveries < target && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 200))
      }
      const totalMs = Date.now() - start

      const statsSamples = stats !== null ? await stats.stop() : []
      const statsSummary = summarize(statsSamples)

      // Live-callback delivery (events seen by LiveQuery callback per subscriber).
      let liveMissing = 0
      for (const set of seen.values()) {
        for (const id of sentIds) if (!set.has(id)) liveMissing++
      }

      // Eventual consistency: ask every worker to do a fresh findAll and report
      // how many of the sentIds are missing. After BulkUpdate refresh the LiveQuery
      // cache is rebuilt from the server, so findAll is the source of truth.
      const perSubMissing: number[] = []
      let consistencyMissing = 0
      await Promise.all(
        workers.map(
          async (w) => {
            await new Promise<void>((resolve) => {
              const onMsg = (msg: any): void => {
                if (msg?.type === 'snapshot-result') {
                  w.off('message', onMsg)
                  perSubMissing.push(msg.count ?? 0)
                  consistencyMissing += msg.count ?? 0
                  resolve()
                } else if (msg?.type === 'error') {
                  w.off('message', onMsg)
                  perSubMissing.push(sentIds.length)
                  consistencyMissing += sentIds.length
                  resolve()
                }
              }
              w.on('message', onMsg)
              w.postMessage({ type: 'snapshot', sentIds })
            })
          }
        )
      )

      const result = {
        label: LABEL,
        subs: SUBS,
        docs: DOCS,
        burst: BURST,
        docPadding: DOC_PADDING,
        slowFraction: SLOW_FRACTION,
        slowDelayMs: SLOW_DELAY_MS,
        sendDoneMs,
        totalMs,
        totalDeliveries,
        expected: target,
        liveMissing,
        consistencyMissing,
        perSubMissingMin: Math.min(...perSubMissing),
        perSubMissingMax: Math.max(...perSubMissing),
        docsPerSec: Math.round((DOCS * 1000) / sendDoneMs),
        deliveriesPerSec: Math.round((totalDeliveries * 1000) / totalMs),
        stats: statsSummary
      }
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(result, null, 2))
      try {
        fs.mkdirSync(STATS_OUT_DIR, { recursive: true })
        fs.writeFileSync(path.join(STATS_OUT_DIR, `bench-${LABEL}.json`), JSON.stringify(result, null, 2))
      } catch {}

      // The slow-client refresh path collapses many drops into a single BulkUpdate event,
      // so liveMissing > 0 is acceptable. Eventual consistency must hold:
      // every subscriber must see every sent doc via findAll.
      expect(consistencyMissing).toBe(0)
    } finally {
      await closeAll()
    }
  })
})
