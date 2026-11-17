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
//
// See the License for the specific language governing permissions and
// limitations under the License.
-->
<script lang="ts">
  import { Label, themeStore } from '@hcengineering/ui'
  import type { IntlString } from '@hcengineering/platform'

  import adminRes from '../plugin'
  import { getRegistrationStats } from '../utils'

  export let refreshTick: number = 0

  const MONTHS = 12

  interface MonthPoint {
    month: string
    count: number
    label?: string
  }
  let wsMonths: MonthPoint[] = []
  let accMonths: MonthPoint[] = []

  function monthStartUTC (now: Date, back: number): number {
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1)
  }

  async function load (): Promise<void> {
    const now = new Date()
    const from = monthStartUTC(now, MONTHS - 1)
    const stats = await getRegistrationStats(from, Date.now())
    if (stats != null) {
      const toMonths = (points: Array<{ day: string, count: number }>): MonthPoint[] => {
        const byMonth = new Map<string, number>()
        for (const p of points) {
          const m = p.day.slice(0, 7)
          byMonth.set(m, (byMonth.get(m) ?? 0) + p.count)
        }
        const res: MonthPoint[] = []
        for (let i = MONTHS - 1; i >= 0; i--) {
          const month = new Date(monthStartUTC(now, i)).toISOString().slice(0, 7)
          res.push({ month, count: byMonth.get(month) ?? 0 })
        }
        return res
      }
      wsMonths = toMonths(stats.workspaces)
      accMonths = toMonths(stats.accounts)
    }
  }

  let prevTick = -1
  $: if (refreshTick !== prevTick) {
    prevTick = refreshTick
    void load()
  }

  function monthLabel (month: string, lang: string): string {
    const [y, m] = month.split('-').map(Number)
    const name = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(lang, { month: 'short', timeZone: 'UTC' })
    return `${name} ${String(y).slice(2)}`
  }

  // Chart layout (viewBox units)
  const W = 420
  const H = 140
  const padL = 8
  const padR = 8
  const chartTop = 16
  const chartBottom = 112
  const chartH = chartBottom - chartTop
  const slotW = (W - padL - padR) / MONTHS

  interface Chart {
    title: IntlString
    points: MonthPoint[]
    grad: string
    color: string
  }
  $: charts = [
    {
      title: adminRes.string.AccountsPerMonth,
      points: accMonths,
      grad: 'acc-grad',
      color: 'var(--primary-button-default, #3b82f6)'
    },
    {
      title: adminRes.string.WorkspacesPerMonth,
      points: wsMonths,
      grad: 'ws-grad',
      color: 'var(--positive-button-default, #22c55e)'
    }
  ] as Chart[]
</script>

<div class="charts-row p-3">
  {#each charts as chart}
    {@const maxVal = Math.max(1, ...chart.points.map((p) => p.count))}
    <div class="chart-card border">
      <div class="fs-title mb-2"><Label label={chart.title} /></div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id={chart.grad} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color={chart.color} />
            <stop offset="100%" stop-color={chart.color} stop-opacity="0.25" />
          </linearGradient>
        </defs>
        <line x1={padL} y1={chartBottom} x2={W - padR} y2={chartBottom} class="grid-line" />
        {#each chart.points as p, i}
          {@const x = padL + i * slotW}
          {@const h = p.count > 0 ? Math.max((p.count / maxVal) * chartH, 2) : 0}
          <g>
            <title>{monthLabel(p.month, $themeStore.language ?? 'en')}: {p.label ?? p.count}</title>
            <rect
              x={x + slotW * 0.2}
              y={chartBottom - h}
              width={slotW * 0.6}
              height={h}
              rx="3"
              fill={`url(#${chart.grad})`}
            />
            <rect {x} y={chartTop} width={slotW} height={chartH} fill="transparent" />
          </g>
          <text x={x + slotW / 2} y={chartBottom - h - 4} class="value-text" text-anchor="middle">
            {p.label ?? p.count}
          </text>
          <text x={x + slotW / 2} y={chartBottom + 12} class="axis-text" text-anchor="middle">
            {monthLabel(p.month, $themeStore.language ?? 'en')}
          </text>
        {/each}
      </svg>
    </div>
  {/each}
  <div class="fs-caption"><Label label={adminRes.string.SubscriptionHistoryUnavailable} /></div>
</div>

<style lang="scss">
  .charts-row {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
  .chart-card {
    flex: 1 1 40%;
    min-width: 20rem;
    padding: 0.75rem;
  }
  .grid-line {
    stroke: var(--theme-divider-color, #8883);
    stroke-width: 0.5;
  }
  .axis-text {
    fill: var(--theme-dark-color, #888);
    font-size: 8px;
  }
  .value-text {
    fill: var(--theme-content-color, #444);
    font-size: 9px;
    font-weight: 600;
  }
</style>
