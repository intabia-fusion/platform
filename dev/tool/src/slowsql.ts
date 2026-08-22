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

import { existsSync, readFileSync } from 'node:fs'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import yaml from 'js-yaml'

const useColor = process.env.NO_COLOR === undefined && process.stdout.isTTY
const wrap = (code: string) => (s: string) => (useColor ? `\u001b[${code}m${s}\u001b[0m` : s)
const c = {
  dim: wrap('2'),
  bold: wrap('1'),
  red: wrap('31'),
  green: wrap('32'),
  yellow: wrap('33'),
  cyan: wrap('36'),
  gray: wrap('90')
}
const colorMs = (ms: number, text: string): string =>
  ms >= 5000 ? c.red(text) : ms >= 1000 ? c.yellow(text) : c.green(text)

// Server-side top-N SQL registry types.
interface TopEntry {
  count: number
  sum: number
  max: number
  le10: number
  le100: number
  le500: number
  sample?: string
}

interface TopRegistry {
  entries: Record<string, TopEntry>
  totalCount: number
  totalSum: number
  evictedCount: number
  evictedSum: number
}

interface MetricsNode {
  top?: Record<string, TopRegistry>
}

interface ServiceStats {
  serviceName?: string
  stats?: MetricsNode
}

export interface IndexInfo {
  name: string
  columns: string[]
}

export interface IndexCoverage {
  filterColumns: string[]
  tableIndexes: IndexInfo[]
  covered: boolean
}

export interface SqlGroup {
  normalized: string
  table: string
  count: number
  maxMs: number
  avgMs: number
  sumMs: number
  p95: number
  p99: number
  sample: string
  services: string[]
  index?: IndexCoverage
}

interface IndexesFile {
  version: number
  domains: Record<string, Array<{ name: string, definition: string }>>
}

// Eviction roll-up per registry across services.
interface EvictedSummary {
  tracked: number
  totalCount: number
  evictedCount: number
  evictedSum: number
}

// Accumulated bucket state for a single merged SQL key.
interface BucketAcc {
  le10: number
  le100: number
  le500: number
}

export function extractFilterColumns (sql: string, table: string): string[] {
  const cols = new Set<string>()
  const whereIdx = sql.search(/\bWHERE\b/i)
  if (whereIdx < 0) return []
  let where = sql.slice(whereIdx + 5)
  const existsIdx = where.search(/\bAND\s*\(\s*EXISTS\b/i)
  if (existsIdx >= 0) where = where.slice(0, existsIdx)
  const t = table.replace(/[^A-Za-z0-9_]/g, '')
  const reCol = new RegExp(`${t}\\."([A-Za-z0-9_]+)"`, 'gi')
  let m: RegExpExecArray | null
  while ((m = reCol.exec(where)) != null) cols.add(m[1])
  const reJson = new RegExp(`${t}\\.data#>>'\\{([^}]+)\\}'`, 'gi')
  while ((m = reJson.exec(where)) != null) cols.add(`data:${m[1]}`)
  return Array.from(cols)
}

function indexColumns (definition: string): string[] {
  const m = /\(([^)]*)\)/.exec(definition)
  if (m == null) return []
  return m[1]
    .split(',')
    .map((c) =>
      c
        .trim()
        .replace(/^"|"$/g, '')
        .replace(/\s+(ASC|DESC)$/i, '')
    )
    .filter((c) => c.length > 0)
}

function analyzeCoverage (table: string, filterCols: string[], indexes: IndexesFile | undefined): IndexCoverage {
  const defs = indexes?.domains?.[table] ?? []
  const tableIndexes: IndexInfo[] = defs.map((d) => ({ name: d.name, columns: indexColumns(d.definition) }))
  const discriminating = filterCols.filter((c) => c !== 'workspaceId' && !c.startsWith('data:'))
  const leadingCols = new Set<string>()
  for (const idx of tableIndexes) {
    const ic = idx.columns
    if (ic.length > 0) leadingCols.add(ic[0].toLowerCase())
    if (ic.length > 1 && ic[0].toLowerCase() === 'workspaceid') leadingCols.add(ic[1].toLowerCase())
  }
  const uncovered = discriminating.filter((c) => !leadingCols.has(c.toLowerCase()))
  const covered = discriminating.length > 0 && uncovered.length === 0
  return { filterColumns: filterCols, tableIndexes, covered }
}

function extractTable (sql: string): string {
  // SELECT/DELETE ... FROM x, INSERT INTO x, UPDATE x.
  const m =
    /\bFROM\s+"?([A-Za-z0-9_]+)"?/i.exec(sql) ??
    /\bINSERT\s+INTO\s+"?([A-Za-z0-9_]+)"?/i.exec(sql) ??
    /\bUPDATE\s+"?([A-Za-z0-9_]+)"?/i.exec(sql)
  return m != null ? m[1] : 'unknown'
}

// Percentile from latency buckets [0,10],(10,100],(100,500],(500,maxMs], linear interpolation.
// Upper edges are clamped to maxMs, else p99 can exceed max on a mostly-fast shape.
function percentileFromBuckets (
  le10: number,
  le100: number,
  le500: number,
  count: number,
  maxMs: number,
  p: number
): number {
  if (count === 0) return 0
  const overflow = Math.max(0, count - le10 - le100 - le500)
  const lo = [0, 10, 100, 500]
  const hi = [10, 100, 500, maxMs].map((e) => Math.min(e, maxMs))
  const counts = [le10, le100, le500, overflow]
  const target = p * count
  let cum = 0
  for (let i = 0; i < counts.length; i++) {
    const next = cum + counts[i]
    if (target <= next && counts[i] > 0) {
      const frac = (target - cum) / counts[i]
      return Math.min(maxMs, lo[i] + frac * (hi[i] - lo[i]))
    }
    cum = next
  }
  return maxMs
}

// Merge TopRegistry entries from one service into the group/bucket maps.
function mergeRegistry (
  service: string,
  registry: TopRegistry,
  groups: Map<string, SqlGroup>,
  buckets: Map<string, BucketAcc>
): void {
  for (const [key, entry] of Object.entries(registry.entries)) {
    let g = groups.get(key)
    if (g === undefined) {
      g = {
        normalized: key,
        table: extractTable(key),
        count: 0,
        maxMs: 0,
        avgMs: 0,
        sumMs: 0,
        p95: 0,
        p99: 0,
        sample: entry.sample ?? key,
        services: []
      }
      groups.set(key, g)
      buckets.set(key, { le10: 0, le100: 0, le500: 0 })
    }
    g.count += entry.count
    g.sumMs += entry.sum
    if (entry.max > g.maxMs) {
      g.maxMs = entry.max
      if (entry.sample !== undefined) g.sample = entry.sample
    }
    if (!g.services.includes(service)) g.services.push(service)
    const b = buckets.get(key)
    if (b !== undefined) {
      b.le10 += entry.le10
      b.le100 += entry.le100
      b.le500 += entry.le500
    }
  }
}

// Finalize percentiles and avgMs after all services merged.
function finalizeGroups (groups: Map<string, SqlGroup>, buckets: Map<string, BucketAcc>): SqlGroup[] {
  for (const g of groups.values()) {
    g.avgMs = g.count > 0 ? g.sumMs / g.count : 0
    const b = buckets.get(g.normalized)
    if (b !== undefined) {
      g.p95 = percentileFromBuckets(b.le10, b.le100, b.le500, g.count, g.maxMs, 0.95)
      g.p99 = percentileFromBuckets(b.le10, b.le100, b.le500, g.count, g.maxMs, 0.99)
    }
  }
  return Array.from(groups.values())
}

function extractRegistries (
  service: string,
  svc: ServiceStats,
  registryName: string,
  groups: Map<string, SqlGroup>,
  buckets: Map<string, BucketAcc>,
  evicted: EvictedSummary
): void {
  const registry = svc.stats?.top?.[registryName]
  if (registry === undefined) return
  evicted.tracked += Object.keys(registry.entries).length
  evicted.totalCount += registry.totalCount
  evicted.evictedCount += registry.evictedCount
  evicted.evictedSum += registry.evictedSum
  mergeRegistry(service, registry, groups, buckets)
}

async function fetchLive (
  statsUrl: string,
  token: string,
  filter: string,
  registryName: string
): Promise<{ groups: SqlGroup[], evicted: EvictedSummary }> {
  const overviewResp = await fetch(`${statsUrl}/api/v1/overview?token=${token}`)
  if (!overviewResp.ok) {
    throw new Error(`failed to fetch overview: ${overviewResp.status} ${overviewResp.statusText}`)
  }
  const overview = (await overviewResp.json()) as { data?: Record<string, unknown> }
  const all = Object.keys(overview.data ?? {})
  const services = filter === '' ? all : all.filter((s) => s.includes(filter))
  const groups = new Map<string, SqlGroup>()
  const buckets = new Map<string, BucketAcc>()
  const evicted: EvictedSummary = { tracked: 0, totalCount: 0, evictedCount: 0, evictedSum: 0 }
  for (const service of services) {
    const resp = await fetch(`${statsUrl}/api/v1/statistics?name=${encodeURIComponent(service)}&token=${token}`)
    if (!resp.ok) {
      console.error(`  ${service}: ${resp.status} ${resp.statusText}`)
      continue
    }
    const svc = (await resp.json()) as ServiceStats
    extractRegistries(service, svc, registryName, groups, buckets, evicted)
  }
  return { groups: finalizeGroups(groups, buckets), evicted }
}

async function fetchFromDir (
  dir: string,
  filter: string,
  registryName: string
): Promise<{ groups: SqlGroup[], evicted: EvictedSummary }> {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json') && f !== 'overview.json')
  const groups = new Map<string, SqlGroup>()
  const buckets = new Map<string, BucketAcc>()
  const evicted: EvictedSummary = { tracked: 0, totalCount: 0, evictedCount: 0, evictedSum: 0 }
  for (const file of files) {
    const svc = JSON.parse(await readFile(join(dir, file), 'utf8')) as ServiceStats
    const service = svc.serviceName ?? file.replace(/\.json$/, '')
    if (filter !== '' && !service.includes(filter)) continue
    extractRegistries(service, svc, registryName, groups, buckets, evicted)
  }
  return { groups: finalizeGroups(groups, buckets), evicted }
}

export interface SlowSqlOptions {
  url?: string
  from?: string
  filter: string
  limit: number
  sort: 'max' | 'sum' | 'count' | 'avg' | 'p95' | 'p99'
  kind: 'find' | 'tx' | 'both'
  details: boolean
  json?: string
  indexes?: string
  missingOnly: boolean
  serverSecret?: string
  makeToken: () => string
}

function loadIndexes (file: string): IndexesFile {
  if (!existsSync(file)) throw new Error(`indexes file not found: ${file}`)
  const parsed = yaml.load(readFileSync(file, 'utf8')) as IndexesFile | undefined
  if (parsed?.domains == null) throw new Error(`invalid indexes file: ${file}`)
  return parsed
}

type Fetcher = (registryName: string) => Promise<{ groups: SqlGroup[], evicted: EvictedSummary }>

function sortGroups (groups: SqlGroup[], sort: SlowSqlOptions['sort']): void {
  groups.sort((a, b) => {
    if (sort === 'sum') return b.sumMs - a.sumMs
    if (sort === 'count') return b.count - a.count
    if (sort === 'avg') return b.avgMs - a.avgMs
    if (sort === 'p95') return b.p95 - a.p95
    if (sort === 'p99') return b.p99 - a.p99
    return b.maxMs - a.maxMs
  })
}

async function renderSection (
  title: string,
  registryName: string,
  fetcher: Fetcher,
  opt: SlowSqlOptions,
  indexes: IndexesFile | undefined,
  allGroupsForJson: SqlGroup[] | undefined
): Promise<void> {
  const { groups: raw, evicted } = await fetcher(registryName)

  let groups = raw
  if (indexes !== undefined) {
    for (const g of groups) {
      const cols = extractFilterColumns(g.sample, g.table)
      g.index = analyzeCoverage(g.table, cols, indexes)
    }
    if (opt.missingOnly) groups = groups.filter((g) => g.index?.covered === false)
  }
  sortGroups(groups, opt.sort)

  if (allGroupsForJson !== undefined) {
    allGroupsForJson.push(...groups)
    return
  }

  console.log(c.bold(`\n=== ${title} (${registryName}) ===`))
  console.log(c.dim(`${groups.length} distinct shapes, sorted by ${opt.sort}`))

  const top = groups.slice(0, opt.limit)
  const hdr = indexes !== undefined ? '  index' : ''
  // Compact SQL preview: collapse whitespace and show the distinguishing tail
  // (from the first WHERE/SET/VALUES) so shapes on the same table differ at a glance.
  const sqlPreview = (sql: string, width = 80): string => {
    const s = sql.replace(/\s+/g, ' ').trim()
    const m = s.search(/\b(WHERE|SET|VALUES)\b/i)
    const tail = m > 0 ? s.slice(m) : s
    return tail.length > width ? tail.slice(0, width - 1) + '…' : tail
  }
  console.log(c.bold(`\n  #   max(ms)   p99(ms)   p95(ms)   avg(ms)    count    sum(ms)  table${hdr}  sql`))
  console.log(c.gray('---  --------  --------  --------  --------  -------  ---------  ------------------------  ---'))
  top.forEach((g, i) => {
    const rank = c.gray(String(i + 1).padStart(3))
    const max = colorMs(g.maxMs, g.maxMs.toFixed(2).padStart(8))
    const p99 = colorMs(g.p99, g.p99.toFixed(2).padStart(8))
    const p95 = colorMs(g.p95, g.p95.toFixed(2).padStart(8))
    const avg = colorMs(g.avgMs, g.avgMs.toFixed(2).padStart(8))
    const cnt = c.dim(String(g.count).padStart(7))
    const sum = colorMs(g.sumMs, g.sumMs.toFixed(0).padStart(9))
    const flag = g.index === undefined ? '' : g.index.covered ? '  ' + c.green('COVERED') : '  ' + c.red('MISSING')
    console.log(
      `${rank}  ${max}  ${p99}  ${p95}  ${avg}  ${cnt}  ${sum}  ${c.cyan(g.table.padEnd(24))}${flag}  ${c.dim(sqlPreview(g.normalized))}`
    )
  })

  if (opt.details) {
    top.forEach((g, i) => {
      console.log('')
      const flag = g.index === undefined ? '' : g.index.covered ? c.green(' [COVERED]') : c.red(' [MISSING]')
      console.log(
        c.bold(`[${i + 1}] ${c.cyan(g.table)}`) +
          `  ${colorMs(g.maxMs, 'max ' + g.maxMs.toFixed(0) + 'ms')}  ${colorMs(g.p99, 'p99 ' + g.p99.toFixed(0) + 'ms')}  ${colorMs(g.p95, 'p95 ' + g.p95.toFixed(0) + 'ms')}  ${c.dim('avg ' + g.avgMs.toFixed(0) + 'ms')}  ${c.dim('x' + g.count)}${flag}`
      )
      console.log(c.dim(`    SQL:    ${g.normalized}`))
      if (g.index !== undefined) {
        const covSet = new Set<string>()
        for (const idx of g.index.tableIndexes) {
          if (idx.columns.length > 0) covSet.add(idx.columns[0].toLowerCase())
          if (idx.columns.length > 1 && idx.columns[0].toLowerCase() === 'workspaceid') {
            covSet.add(idx.columns[1].toLowerCase())
          }
        }
        const filterStr = g.index.filterColumns
          .map((col) => {
            const disc = col !== 'workspaceId' && !col.startsWith('data:')
            if (!disc) return c.gray(col)
            return covSet.has(col.toLowerCase()) ? c.green(col) : c.red(col)
          })
          .join(', ')
        console.log(`    filter: ${filterStr}`)
        if (g.index.tableIndexes.length === 0) {
          console.log(c.red(`    indexes on ${g.table}: NONE`))
        } else {
          console.log(c.gray(`    indexes on ${g.table}:`))
          for (const idx of g.index.tableIndexes) {
            console.log(`      ${c.yellow(idx.name)}  ${c.dim('(' + idx.columns.join(', ') + ')')}`)
          }
        }
      }
    })
  }

  if (indexes !== undefined) {
    const missing = groups.filter((g) => g.index?.covered === false).length
    const covered = groups.filter((g) => g.index?.covered === true).length
    console.log(
      c.bold(
        `\n=== ${c.red(String(missing) + ' MISSING')} / ${c.green(String(covered) + ' COVERED')} of ${groups.length} shapes ===`
      )
    )
  }

  console.log(
    c.dim(
      `tracked ${evicted.tracked} shapes, ${evicted.totalCount} calls; evicted ${evicted.evictedCount} calls, ${evicted.evictedSum.toFixed(0)}ms`
    )
  )
}

export async function reportSlowSql (opt: SlowSqlOptions): Promise<void> {
  let fetcher: Fetcher
  if (opt.from !== undefined) {
    console.log(`reading dumps from ${opt.from}`)
    const dir = opt.from
    fetcher = (reg) => fetchFromDir(dir, opt.filter, reg)
  } else {
    const base = (opt.url ?? '').replace('ws:/', 'http:/').replace(/\/+$/, '')
    if (base === '') throw new Error('provide --url or --from')
    let statsUrl = base
    try {
      const cfgResp = await fetch(`${base}/config.json`)
      if (cfgResp.ok) {
        const cfg = (await cfgResp.json()) as { STATS_URL?: string }
        if (cfg.STATS_URL !== undefined && cfg.STATS_URL !== '') {
          statsUrl = cfg.STATS_URL.replace(/\/+$/, '')
          console.log(`resolved STATS_URL from config.json: ${statsUrl}`)
        }
      }
    } catch {
      // direct stats endpoint
    }
    if (opt.serverSecret === undefined) throw new Error('please provide server secret')
    const token = opt.makeToken()
    fetcher = (reg) => fetchLive(statsUrl, token, opt.filter, reg)
  }

  const indexes = opt.indexes !== undefined ? loadIndexes(opt.indexes) : undefined

  const registries: Array<{ name: string, title: string }> =
    opt.kind === 'find'
      ? [{ name: 'slowSqlFind', title: 'FIND (read queries)' }]
      : opt.kind === 'tx'
        ? [{ name: 'slowSqlTx', title: 'TX (write queries)' }]
        : [
            { name: 'slowSqlFind', title: 'FIND (read queries)' },
            { name: 'slowSqlTx', title: 'TX (write queries)' }
          ]

  if (opt.json !== undefined) {
    const allGroups: SqlGroup[] = []
    for (const reg of registries) {
      await renderSection(reg.title, reg.name, fetcher, opt, indexes, allGroups)
    }
    await writeFile(opt.json, JSON.stringify(allGroups, null, 2))
    console.log(`wrote ${allGroups.length} groups to ${opt.json}`)
    return
  }

  for (const reg of registries) {
    await renderSection(reg.title, reg.name, fetcher, opt, indexes, undefined)
  }
}
