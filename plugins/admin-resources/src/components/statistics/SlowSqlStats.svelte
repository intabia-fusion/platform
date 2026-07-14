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
  import { getMetadata } from '@hcengineering/platform'
  import presentation, { type ServiceStatistics } from '@hcengineering/presentation'
  import { DropdownLabels, ticker } from '@hcengineering/ui'
  import { fetchStatsJson } from './statsFetch'

  // Service ids (keys of the overview `data.data`) whose SQL registries to merge.
  export let services: string[] = []

  const endpoint = getMetadata(presentation.metadata.StatsUrl)
  const token: string = getMetadata(presentation.metadata.Token) ?? ''

  let kind: 'slowSqlFind' | 'slowSqlTx' = 'slowSqlFind'
  const kinds = [
    { id: 'slowSqlFind', label: 'Find (reads)' },
    { id: 'slowSqlTx', label: 'Tx (writes)' }
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

  let rows: Row[] = []
  let evicted = 0
  let totalCalls = 0

  async function refresh (..._deps: unknown[]): Promise<void> {
    const merged = new Map<string, Row>()
    let ev = 0
    let total = 0
    await Promise.all(
      services.map(async (svc) => {
        try {
          const s = await fetchStatsJson<ServiceStatistics>(
            endpoint + `/api/v1/statistics?token=${token}&name=${encodeURIComponent(svc)}`
          )
          const reg = (s?.stats as any)?.top?.[kind]
          if (reg === undefined) return
          ev += reg.evictedCount ?? 0
          total += reg.totalCount ?? 0
          for (const [key, e] of Object.entries<any>(reg.entries ?? {})) {
            let r = merged.get(key)
            if (r === undefined) {
              r = {
                key,
                table: extractTable(key),
                count: 0,
                sum: 0,
                max: 0,
                le10: 0,
                le100: 0,
                le500: 0,
                sample: e.sample ?? key
              }
              merged.set(key, r)
            }
            r.count += e.count
            r.sum += e.sum
            r.max = Math.max(r.max, e.max)
            r.le10 += e.le10
            r.le100 += e.le100
            r.le500 += e.le500
          }
        } catch {
          // one service may be gone; skip it
        }
      })
    )
    rows = Array.from(merged.values()).sort((a, b) => percentile(b, 0.95) - percentile(a, 0.95))
    evicted = ev
    totalCalls = total
  }

  $: refresh(services, kind, $ticker).catch(() => {})

  const fmt = (n: number): string => (n >= 100 ? n.toFixed(0) : n.toFixed(1))
</script>

<div class="flex-col p-2">
  <div class="flex-row-center flex-between mb-2">
    <div class="flex-row-center">
      <span class="mr-2">Registry:</span>
      <DropdownLabels bind:selected={kind} items={kinds} />
    </div>
    <span class="text-sm content-dark-color">
      {rows.length} shapes · {totalCalls} calls · {evicted} evicted
    </span>
  </div>

  <table class="slow-sql">
    <thead>
      <tr>
        <th class="num">max</th>
        <th class="num">p95</th>
        <th class="num">p99</th>
        <th class="num">avg</th>
        <th class="num">count</th>
        <th class="tbl">table</th>
        <th class="sql">sql</th>
      </tr>
    </thead>
    <tbody>
      {#each rows as r (r.key)}
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
            class:expanded={expanded.has(r.key)}
            title={r.sample}
            on:click={() => {
              toggle(r.key)
            }}>{r.sample}</td
          >
        </tr>
      {/each}
    </tbody>
  </table>
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
