#!/usr/bin/env node
//
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//

// Controls and snapshots the stats service around a run.
//
//   node telemetry/stats.js rate --interval 1000 | wipe | sample --out <f> | fetch --out <f>

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

// Every stand routes /_stats through its nginx on 8083; the stats port itself is not published.
const STATS_URL = (process.env.STATS_URL ?? 'http://localhost:8083/_stats').replace(/\/$/, '')
const SERVER_SECRET = process.env.SERVER_SECRET ?? 'secret'

function arg (name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback
}

const b64url = (buf) => Buffer.from(buf).toString('base64url')

// service:'tool' is the service lane of isStatsAdmin; the admin lane also wants a fresh
// second factor (extra.mfaAt), and a token without one is refused as 404.
function adminToken () {
  const header = b64url(JSON.stringify({ typ: 'JWT', alg: 'HS256' }))
  const payload = b64url(
    JSON.stringify({
      extra: { admin: 'true', service: 'tool' },
      account: '00000000-0000-0000-0000-000000000000'
    })
  )
  const sig = b64url(crypto.createHmac('sha256', SERVER_SECRET).update(`${header}.${payload}`).digest())
  return `${header}.${payload}.${sig}`
}

// /api/v1/manage and /api/v1/analytics read the token from the Authorization header only - in the
// query it is ignored and the endpoint answers 404.
function authHeader () {
  return { Authorization: `Bearer ${adminToken()}` }
}

async function call (urlPath, method) {
  const url = new URL(STATS_URL + urlPath)
  const res = await fetch(url, { method, headers: authHeader() })
  if (!res.ok) throw new Error(`${method} ${url.pathname} -> ${res.status}`)
  const text = await res.text()
  return text === '' ? undefined : JSON.parse(text)
}

// analytics returns counters accumulated since the wipe, so store per-tick deltas to get a shape.
async function sampleLoop (outPath, intervalMs) {
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true })
  const stream = fs.createWriteStream(outPath, { flags: 'a' })
  const previous = new Map()
  let stopping = false
  let ticks = 0
  // The first read carries everything accumulated before we started; use it as the baseline only.
  let baseline = true

  const tick = async () => {
    if (stopping) return
    let data
    try {
      data = await call('/api/v1/analytics?limit=500&sort=time&source=all', 'GET')
    } catch {
      return
    }
    const ts = Date.now()
    let lines = ''
    for (const e of data?.entries ?? []) {
      const key = `${e.service}|${e.path}`
      const prev = previous.get(key) ?? { operations: 0, total: 0 }
      const ops = (e.operations ?? 0) - prev.operations
      const ms = (e.total ?? 0) - prev.total
      previous.set(key, { operations: e.operations ?? 0, total: e.total ?? 0 })
          if (ops > 0 && !baseline) {
        lines += JSON.stringify({ ts, service: e.service, path: e.path, ops, ms: Math.round(ms) }) + '\n'
      }
    }
    if (lines !== '') stream.write(lines)
    baseline = false
    ticks++
  }

  const timer = setInterval(() => {
    void tick()
  }, intervalMs)
  await tick()

  const stop = () => {
    if (stopping) return
    stopping = true
    clearInterval(timer)
    console.error(`[telemetry] stats sampler: ${ticks} ticks`)
    stream.end(() => process.exit(0))
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}

async function main () {
  const cmd = process.argv[2]
  if (cmd === 'sample') {
    await sampleLoop(arg('out', 'stats.ndjson'), Number(arg('interval', '1000')))
    return
  }
  if (cmd === 'rate') {
    const min = arg('min', '1')
    const max = arg('max', '10')
    const threshold = arg('threshold', '0.001')
    const service = arg('service', '*')
    const res = await call(
      `/api/v1/manage?operation=set-rate&service=${encodeURIComponent(service)}` +
        `&min=${min}&max=${max}&threshold=${threshold}`,
      'PUT'
    )
    console.error(
      `[telemetry] policy ${service} -> min ${res?.minInterval ?? min}s, ` +
        `max ${res?.maxInterval ?? max}s, threshold ${res?.threshold ?? threshold}`
    )
    return
  }
  if (cmd === 'wipe') {
    await call('/api/v1/manage?operation=wipe-statistics', 'PUT')
    console.error('[telemetry] stats wiped')
    return
  }
  if (cmd === 'fetch') {
    const limit = arg('limit', '200')
    const data = await call(`/api/v1/analytics?limit=${limit}&sort=time&source=all`, 'GET')
    const entries = data?.entries ?? []
    // client.* metrics come from the browser through analytics-collector; they are the only
    // rows that describe what the client actually sent over the wire.
    const client = entries.filter((e) => (e.path ?? '').includes('client/client.'))
    const out = {
      fetchedAt: new Date().toISOString(),
      totals: {
        operations: entries.reduce((a, e) => a + (e.operations ?? 0), 0),
        timeMs: Math.round(entries.reduce((a, e) => a + (e.total ?? 0), 0))
      },
      client: client.map((e) => ({
        metric: (e.path ?? '').replace(/^client\//, ''),
        operations: e.operations,
        total: e.total,
        avg: e.avg
      })),
      entries
    }
    const outPath = arg('out', 'stats.json')
    fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true })
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2))
    console.error(
      `[telemetry] ${outPath}: ${entries.length} entries, ${out.totals.operations} operations` +
        (client.length > 0 ? `, ${client.length} client metrics` : ', no client metrics')
    )
    return
  }
  console.error(
    'usage: stats.js wipe | stats.js rate [--min <ms>] [--max <ms>] [--threshold <f>] | ' +
      'stats.js sample --out <file> | stats.js fetch --out <file>'
  )
  process.exit(1)
}

void main().catch((err) => {
  // Never fail the run over telemetry: the stand may be up without the stats pod.
  console.error(`[telemetry] stats unavailable: ${String(err.message ?? err)}`)
  process.exit(0)
})
