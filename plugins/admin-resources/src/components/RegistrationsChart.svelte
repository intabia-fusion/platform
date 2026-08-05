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
  import type { SubscriptionInfo } from '@hcengineering/account-client'

  import adminRes from '../plugin'
  import { getAllSubscriptions, getRegistrationStats } from '../utils'

  export let refreshTick: number = 0

  const MONTHS = 12

  interface MonthPoint {
    month: string
    count: number
    label?: string
  }
  let wsMonths: MonthPoint[] = []
  let accMonths: MonthPoint[] = []
  let paidMonths: MonthPoint[] = []
  let trialMonths: MonthPoint[] = []

  function monthStartUTC (now: Date, back: number): number {
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1)
  }

  async function load (): Promise<void> {
    const now = new Date()
    const from = monthStartUTC(now, MONTHS - 1)
    const [stats, subs] = await Promise.all([getRegistrationStats(from, Date.now()), getAllSubscriptions()])
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

    // Numbers are wrapped: INT8 columns arrive as strings from the PG driver.
    const nowMs = Date.now()
    const stillActive = ['active', 'past_due', 'readonly']
    const paid = subs.filter(
      (s) =>
        s.type === 'tier' &&
        s.status !== 'trialing' &&
        s.provider !== 'free' &&
        s.provider !== 'trial' &&
        Number(s.amount ?? 0) > 0
    )
    paidMonths = seatsByMonth(now, paid, (s) => [
      Number(s.periodStart ?? s.createdOn),
      stillActive.includes(s.status) ? nowMs : Number(s.periodEnd ?? s.canceledAt ?? s.updatedOn)
    ])

    // Trial workspaces: currently trialing, or a past trial (trialEnd set)
    const trial = subs.filter((s) => s.type === 'tier' && (s.status === 'trialing' || s.trialEnd != null))
    trialMonths = seatsByMonth(now, trial, (s) => [
      Number(s.createdOn),
      s.status === 'trialing' ? nowMs : Number(s.trialEnd ?? s.canceledAt ?? s.updatedOn)
    ])
  }

  // Per month: workspaces (deduped) and their seats, for subscriptions whose interval overlaps the month.
  // Dedup keeps the latest overlapping row per workspace — plan changes/renewals leave several rows.
  function seatsByMonth (
    now: Date,
    subs: SubscriptionInfo[],
    intervalOf: (s: SubscriptionInfo) => [number, number]
  ): MonthPoint[] {
    const res: MonthPoint[] = []
    for (let i = MONTHS - 1; i >= 0; i--) {
      const mStart = monthStartUTC(now, i)
      const mEnd = monthStartUTC(now, i - 1)
      const perWs = new Map<string, { from: number, seats: number }>()
      for (const s of subs) {
        const [from, to] = intervalOf(s)
        if (from >= mEnd || to < mStart) continue
        const prev = perWs.get(s.workspaceUuid)
        if (prev === undefined || from > prev.from) {
          perWs.set(s.workspaceUuid, {
            from,
            seats: Number(s.providerData?.quantity ?? s.limits?.usersLimit ?? 0)
          })
        }
      }
      const seats = [...perWs.values()].reduce((sum, v) => sum + v.seats, 0)
      res.push({
        month: new Date(mStart).toISOString().slice(0, 7),
        count: seats,
        label: `${perWs.size} / ${seats}`
      })
    }
    return res
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
    },
    {
      title: adminRes.string.PaidSeatsPerMonth,
      points: paidMonths,
      grad: 'paid-grad',
      color: '#8b5cf6'
    },
    {
      title: adminRes.string.TrialSeatsPerMonth,
      points: trialMonths,
      grad: 'trial-grad',
      color: '#f59e0b'
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
