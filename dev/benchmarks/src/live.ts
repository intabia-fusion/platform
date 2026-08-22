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

// Shared primitives for the WebSocket ("live") load scenarios: connect helper,
// percentile, timed read gate, concurrent storm launcher, disrupt + recovery.
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import ws from 'ws'
import { connect, type PlatformClient } from '@hcengineering/api-client'
import type { BenchConfig } from './config'

// api-client's connection expects a browser-style global WebSocket.
;(globalThis as any).WebSocket = ws

const pexec = promisify(exec)

export type LiveClient = PlatformClient

export async function connectLive (
  cfg: BenchConfig,
  opts: { email?: string, password?: string, workspace?: string } = {}
): Promise<LiveClient> {
  return await connect(cfg.url, {
    email: opts.email ?? cfg.email,
    password: opts.password ?? cfg.password,
    workspace: opts.workspace ?? cfg.workspace
  })
}

export function pct (arr: number[], q: number): number {
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.floor(q * s.length)] ?? 0
}

export interface TimeResult {
  label: string
  p50: number
  p95: number
  max: number
  budget?: number
  bad: boolean
}

// Warm once, run `iters` timed calls, print + return p50/p95/max and budget breach.
export async function timeIt (
  label: string,
  iters: number,
  fn: () => Promise<unknown>,
  budget?: number
): Promise<TimeResult> {
  await fn()
  const t: number[] = []
  for (let i = 0; i < iters; i++) {
    const s = Date.now()
    await fn()
    t.push(Date.now() - s)
  }
  const p95 = pct(t, 0.95)
  const bad = budget !== undefined && p95 > budget
  const r: TimeResult = { label, p50: pct(t, 0.5), p95, max: Math.max(...t), budget, bad }
  console.log(
    `  ${label.padEnd(18)} p50=${r.p50}ms p95=${r.p95}ms max=${r.max}ms` +
      (budget !== undefined ? `  [${bad ? 'FAIL' : 'ok'} <${budget}ms]` : '')
  )
  return r
}

export interface StormResult {
  count: number
  ok: number
  fail: number
  wallMs: number
  p50: number
  p95: number
  max: number
  throughput: number
}

// Fire `count` tasks concurrently (no stagger, mimics a socket-drop herd). Each
// task returns the latency ms to record, or throws (counted as a failure).
export async function runStorm (
  count: number,
  task: (i: number) => Promise<number>,
  opts: { startIdx?: number, label?: string } = {}
): Promise<StormResult> {
  const startIdx = opts.startIdx ?? 0
  const lat: number[] = []
  let ok = 0
  let fail = 0
  const t0 = Date.now()
  await Promise.all(
    Array.from({ length: count }, (_, k) =>
      (async () => {
        try {
          lat.push(await task(startIdx + k))
          ok++
        } catch (err) {
          fail++
          if (fail <= 3) console.log(`  task ${startIdx + k} failed: ${String((err as any)?.message ?? err).slice(0, 90)}`)
        }
      })()
    )
  )
  const wallMs = Date.now() - t0
  const r: StormResult = {
    count,
    ok,
    fail,
    wallMs,
    p50: pct(lat, 0.5),
    p95: pct(lat, 0.95),
    max: Math.max(...lat, 0),
    throughput: wallMs > 0 ? Math.round((ok / wallMs) * 1000) : 0
  }
  console.log(
    `  ${opts.label ?? 'storm'} count=${count}: wall=${wallMs}ms ok=${ok} fail=${fail} ` +
      `p50=${r.p50}ms p95=${r.p95}ms max=${r.max}ms throughput=${r.throughput}/s`
  )
  return r
}

// Run one or more shell commands (split on `&&`) to drop connections mid-run,
// e.g. "docker kill sanity-transactor0-1 && docker start sanity-transactor0-1".
export async function disrupt (cmd: string): Promise<void> {
  for (const part of cmd.split('&&').map((s) => s.trim()).filter(Boolean)) {
    await pexec(part).catch((e) => console.log(`disrupt "${part}" err:`, (e as any).message))
  }
}

export interface RecoveredItem<T> {
  dt: number
  item: { c: LiveClient } & T
}

// Warm kept-open clients, run `disruptCmd`, then poll each client's `warm` op
// until it succeeds again; record ms-from-disrupt per client.
export async function measureRecovery<T> (
  clients: Array<{ c: LiveClient } & T>,
  warm: (c: LiveClient) => Promise<unknown>,
  disruptCmd: string,
  timeoutMs = 180000
): Promise<{ t0: number, wallMs: number, rec: Array<RecoveredItem<T>> }> {
  await Promise.all(clients.map(({ c }) => warm(c).catch(() => {})))
  await new Promise((r) => setTimeout(r, 2000))
  const t0 = Date.now()
  await disrupt(disruptCmd)
  const rec: Array<RecoveredItem<T>> = []
  await Promise.all(
    clients.map((item) =>
      (async () => {
        for (;;) {
          try {
            await warm(item.c)
            rec.push({ dt: Date.now() - t0, item })
            break
          } catch {
            await new Promise((r) => setTimeout(r, 150))
            if (Date.now() - t0 > timeoutMs) break
          }
        }
      })()
    )
  )
  return { t0, wallMs: Date.now() - t0, rec }
}

export async function closeAll (clients: Array<{ c: LiveClient }>): Promise<void> {
  await Promise.all(clients.map(({ c }) => c.close().catch(() => {})))
}
