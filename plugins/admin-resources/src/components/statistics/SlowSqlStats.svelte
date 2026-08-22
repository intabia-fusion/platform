<!--
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
-->
<script lang="ts">
  import { getEmbeddedLabel, getMetadata } from '@hcengineering/platform'
  import presentation from '@hcengineering/presentation'
  import { Button, DropdownLabels, ticker } from '@hcengineering/ui'
  import { downloadCsv, fetchStatsJson } from './statsFetch'

  const endpoint = getMetadata(presentation.metadata.StatsUrl)
  const token: string = getMetadata(presentation.metadata.Token) ?? ''

  let kind: 'Find' | 'Tx' = 'Find'
  const kinds = [
    { id: 'Find', label: 'Find (reads)' },
    { id: 'Tx', label: 'Tx (writes)' }
  ]

  let limit = '30'
  const limits = [
    { id: '30', label: '30' },
    { id: '100', label: '100' },
    { id: '300', label: '300' }
  ]

  type SortKey = 'max' | 'p95' | 'p99' | 'avg' | 'count'
  const sortKeys: SortKey[] = ['max', 'p95', 'p99', 'avg', 'count']

  interface Section {
    id: 'slow' | 'hot'
    title: string
    hint: string
    // Server-side ranking used to pick which rows we get at all.
    serverSort: 'max' | 'count'
    sortBy: SortKey
    rows: Row[]
    instances: number
    totalCalls: number
    trackedCalls: number
  }

  // One registry, two views: the heaviest single calls and the ones that run most often.
  // A 2ms statement executed 50k times never surfaces in the first one.
  let sections: Section[] = [
    {
      id: 'slow',
      title: 'Slowest',
      hint: 'by max duration',
      serverSort: 'max',
      sortBy: 'p95',
      rows: [],
      instances: 0,
      totalCalls: 0,
      trackedCalls: 0
    },
    {
      id: 'hot',
      title: 'Most frequent',
      hint: 'by call count',
      serverSort: 'count',
      sortBy: 'count',
      rows: [],
      instances: 0,
      totalCalls: 0,
      trackedCalls: 0
    }
  ]

  interface Row {
    key: string
    table: string
    count: number
    sum: number
    max: number
    le10: number
    le100: number
    le500: number
    sample: string
  }

  // Rows whose full SQL is expanded (click to toggle); default truncated with ellipsis.
  // Keyed by r.key, not row index - rows are re-sorted and rebuilt on every refresh.
  let expanded = new Set<string>()
  function toggle (key: string): void {
    if (expanded.has(key)) expanded.delete(key)
    else expanded.add(key)
    expanded = expanded
  }

  // Estimate a percentile (0..1) from the non-overlapping latency buckets.
  function percentile (r: Row, p: number): number {
    if (r.count === 0) return 0
    const overflow = Math.max(0, r.count - r.le10 - r.le100 - r.le500)
    const lo = [0, 10, 100, 500]
    const hi = [10, 100, 500, r.max].map((e) => Math.min(e, r.max))
    const counts = [r.le10, r.le100, r.le500, overflow]
    const target = p * r.count
    let cum = 0
    for (let i = 0; i < counts.length; i++) {
      const next = cum + counts[i]
      if (target <= next && counts[i] > 0) {
        const frac = (target - cum) / counts[i]
        return Math.min(r.max, lo[i] + frac * (hi[i] - lo[i]))
      }
      cum = next
    }
    return r.max
  }

  function extractTable (sql: string): string {
    const m =
      /\bFROM\s+"?([A-Za-z0-9_]+)"?/i.exec(sql) ??
      /\bINTO\s+"?([A-Za-z0-9_]+)"?/i.exec(sql) ??
      /\bUPDATE\s+"?([A-Za-z0-9_]+)"?/i.exec(sql)
    return m != null ? m[1] : 'unknown'
  }

  // Pool wait for the current registry: one row, keyed by the SQL registry name.
  let wait: { count: number, sum: number, max: number, p95: number } | undefined
  let eventLoop: { lagP50: number, lagP95: number, lagMax: number, threadPool: number } | undefined

  interface TopResponse {
    instances: number
    totalCount: number
    totalSum: number
    trackedCount: number
    eventLoop?: { lagP50: number, lagP95: number, lagMax: number, threadPool: number }
    entries: Array<{ key: string, count: number, sum: number, max: number, le10: number, le100: number, le500: number, sample?: string }>
  }

  // One request per view - the stats pod merges every live instance for us.
  async function refresh (..._deps: unknown[]): Promise<void> {
    const loaded = await Promise.all(
      sections.map(async (section) => {
        try {
          const url =
            endpoint +
            `/api/v1/top?token=${token}&registry=slowSql${kind}&sort=${section.serverSort}&limit=${limit}`
          const r = await fetchStatsJson<TopResponse>(url)
          eventLoop = r.eventLoop
          return {
            ...section,
            rows: (r.entries ?? []).map((e) => ({ ...e, table: extractTable(e.key), sample: e.sample ?? e.key })),
            instances: r.instances ?? 0,
            totalCalls: r.totalCount ?? 0,
            trackedCalls: r.trackedCount ?? 0
          }
        } catch {
          return section
        }
      })
    )
    sections = loaded

    try {
      const w = await fetchStatsJson<TopResponse>(
        endpoint + `/api/v1/top?token=${token}&registry=sqlWait&sort=count&limit=10`
      )
      const row = (w.entries ?? []).find((e) => e.key === `slowSql${kind}`)
      wait =
        row !== undefined
          ? { count: row.count, sum: row.sum, max: row.max, p95: percentile(row as unknown as Row, 0.95) }
          : undefined
    } catch {
      wait = undefined
    }
  }

  $: refresh(kind, limit, $ticker).catch(() => {})

  function metric (r: Row, key: SortKey): number {
    switch (key) {
      case 'max':
        return r.max
      case 'p95':
        return percentile(r, 0.95)
      case 'p99':
        return percentile(r, 0.99)
      case 'avg':
        return r.count > 0 ? r.sum / r.count : 0
      case 'count':
        return r.count
    }
  }

  const sortRows = (s: Section): Row[] => [...s.rows].sort((a, b) => metric(b, s.sortBy) - metric(a, s.sortBy))

  function sortSection (s: Section, key: SortKey): void {
    s.sortBy = key
    sections = sections
  }

  const fmt = (n: number): string => (n >= 100 ? n.toFixed(0) : n.toFixed(1))

  function exportCsv (s: Section): void {
    downloadCsv(
      `sql-${kind.toLowerCase()}-${s.id}.csv`,
      ['max', 'p95', 'p99', 'avg', 'count', 'table', 'sql'],
      sortRows(s).map((r) => [
        r.max,
        percentile(r, 0.95),
        percentile(r, 0.99),
        r.count > 0 ? r.sum / r.count : 0,
        r.count,
        r.table,
        r.sample
      ])
    )
  }
</script>

<div class="flex-col p-2">
  <div class="flex-row-center mb-2">
    <span class="mr-2">Registry:</span>
    <DropdownLabels bind:selected={kind} items={kinds} />
    <span class="ml-4 mr-2">Rows:</span>
    <DropdownLabels bind:selected={limit} items={limits} />
  </div>

  {#if eventLoop !== undefined}
    <!-- If the lag is high, table timings measure a busy process, not the database. -->
    <div class="text-sm content-dark-color mb-2">
      Event loop lag: p50 {fmt(eventLoop.lagP50)}ms · p95 {fmt(eventLoop.lagP95)}ms · max {fmt(eventLoop.lagMax)}ms ·
      libuv pool {eventLoop.threadPool} threads
    </div>
  {/if}

  {#if wait !== undefined}
    <!-- Separate from the tables: this is queuing for a connection, not statement cost. -->
    <div class="text-sm content-dark-color mb-2">
      Pool wait: {wait.count} waits · {(wait.sum / 1000).toFixed(1)}s total · p95 {fmt(wait.p95)}ms · max {fmt(
        wait.max
      )}ms
    </div>
  {/if}

  {#each sections as section (section.id)}
    <div class="flex-row-center flex-between mb-2 mt-2">
      <div class="flex-row-center">
        <span class="fs-title mr-2">{section.title}</span>
        <span class="text-sm content-dark-color mr-2">{section.hint}</span>
        <Button
          label={getEmbeddedLabel('Download CSV')}
          kind="regular"
          size="small"
          on:click={() => {
            exportCsv(section)
          }}
        />
      </div>
      <span class="text-sm content-dark-color">
        {section.rows.length} shapes · {section.totalCalls} calls · {section.instances} instances{section.totalCalls >
        section.trackedCalls
          ? ` · ${section.totalCalls - section.trackedCalls} calls not shown`
          : ''}
      </span>
    </div>

    <table class="slow-sql mb-4">
      <thead>
        <tr>
          <!-- click a numeric header to sort by it -->
          {#each sortKeys as key}
            <th
              class="num sortable"
              class:active={section.sortBy === key}
              on:click={() => {
                sortSection(section, key)
              }}>{key}</th
            >
          {/each}
          <th class="tbl">table</th>
          <th class="sql">sql</th>
        </tr>
      </thead>
      <tbody>
        {#each sortRows(section) as r (r.key)}
          {@const p95 = percentile(r, 0.95)}
          <tr>
            <td class="num" class:hot={r.max >= 1000}>{fmt(r.max)}</td>
            <td class="num" class:hot={p95 >= 1000}>{fmt(p95)}</td>
            <td class="num">{fmt(percentile(r, 0.99))}</td>
            <td class="num">{fmt(r.count > 0 ? r.sum / r.count : 0)}</td>
            <td class="num">{r.count}</td>
            <td class="tbl">{r.table}</td>
            <!-- click toggles full SQL; title still shows it on hover -->
            <td
              class="sql"
              class:expanded={expanded.has(section.id + r.key)}
              title={r.sample}
              on:click={() => {
                toggle(section.id + r.key)
              }}>{r.sample}</td
            >
          </tr>
        {/each}
      </tbody>
    </table>
  {/each}
</div>

<style lang="scss">
  table.slow-sql {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8125rem;

    th,
    td {
      padding: 0.125rem 0.5rem;
      text-align: left;
      white-space: nowrap;
    }
    th {
      color: var(--content-color);
      border-bottom: 1px solid var(--divider-color);
    }
    td.num,
    th.num {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    th.sortable {
      cursor: pointer;
    }
    th.active {
      color: var(--caption-color);
      font-weight: 600;
    }
    td.hot {
      color: var(--negative-button-default);
      font-weight: 600;
    }
    td.tbl {
      color: var(--accent-color);
    }
    td.sql {
      max-width: 40rem;
      overflow: hidden;
      text-overflow: ellipsis;
      cursor: pointer;
      font-family: monospace;
      color: var(--content-color);
    }
    td.sql.expanded {
      max-width: none;
      overflow: visible;
      text-overflow: clip;
      white-space: pre-wrap;
      word-break: break-all;
    }
    tbody tr:hover {
      background: var(--theme-bg-color);
    }
  }
</style>
