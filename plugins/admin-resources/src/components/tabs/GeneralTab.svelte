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
  import type { WorkspacesSummary } from '@hcengineering/account-client'
  import { reduceCalls } from '@hcengineering/core'
  import { getMetadata } from '@hcengineering/platform'
  import presentation, { type OverviewStatistics } from '@hcengineering/presentation'
  import { Button, Label, themeStore } from '@hcengineering/ui'

  import adminRes from '../../plugin'
  import RegistrationsChart from '../RegistrationsChart.svelte'
  import { getWorkspacesSummary, loadPlanOptions, type PlanOptions } from '../../utils'

  export let refreshTick: number = 0

  let summary: WorkspacesSummary | null = null

  const loadSummary = reduceCalls(async (): Promise<void> => {
    summary = await getWorkspacesSummary()
  })

  // Live service stats (in-memory on the stats pod)
  const token: string = getMetadata(presentation.metadata.Token) ?? ''
  const statsEndpoint = getMetadata(presentation.metadata.StatsUrl)
  let overview: OverviewStatistics | undefined

  async function loadOverview (): Promise<void> {
    try {
      const res = await fetch(statsEndpoint + `/api/v1/overview?token=${token}`, {})
      overview = await res.json()
    } catch (err) {
      console.error(err)
    }
  }

  let plans: PlanOptions | null = null
  void loadPlanOptions($themeStore.language ?? 'en').then((p) => {
    plans = p
  })

  let prevTick = -1
  $: if (refreshTick !== prevTick) {
    prevTick = refreshTick
    void loadSummary()
    void loadOverview()
  }

  $: billing = summary?.billing ?? []
  $: paidSeats = billing
    .filter((b) => plans?.config?.plans?.[b.plan]?.free !== true)
    .reduce((acc, b) => acc + b.seats, 0)

  $: services = Object.entries(overview?.data ?? {}).sort((a, b) => a[1].serviceName.localeCompare(b[1].serviceName))

  interface ServiceRow {
    name: string
    count: number
    memoryUsed: number
    memoryTotal: number
    memoryRSS: number
    cpu: number
  }

  let groupByName = true

  $: totals = services.reduce(
    (acc, [, svc]) => {
      acc.memoryUsed += svc.memory.memoryUsed
      acc.memoryTotal += svc.memory.memoryTotal
      acc.memoryRSS += svc.memory.memoryRSS
      acc.cpu += svc.cpu.usage
      return acc
    },
    { memoryUsed: 0, memoryTotal: 0, memoryRSS: 0, cpu: 0 }
  )

  $: serviceRows = ((): ServiceRow[] => {
    if (!groupByName) {
      return services.map(([id, svc]) => ({
        name: `${svc.serviceName} - ${id}`,
        count: 1,
        memoryUsed: svc.memory.memoryUsed,
        memoryTotal: svc.memory.memoryTotal,
        memoryRSS: svc.memory.memoryRSS,
        cpu: svc.cpu.usage
      }))
    }
    const byName = new Map<string, ServiceRow>()
    for (const [, svc] of services) {
      const row = byName.get(svc.serviceName) ?? {
        name: svc.serviceName,
        count: 0,
        memoryUsed: 0,
        memoryTotal: 0,
        memoryRSS: 0,
        cpu: 0
      }
      row.count++
      row.memoryUsed += svc.memory.memoryUsed
      row.memoryTotal += svc.memory.memoryTotal
      row.memoryRSS += svc.memory.memoryRSS
      row.cpu += svc.cpu.usage
      byName.set(svc.serviceName, row)
    }
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
  })()
</script>

<div class="p-3">
  <div class="fs-title mb-2"><Label label={adminRes.string.Workspaces} /></div>
  <div class="flex-row-center flex-wrap">
    <span class="mr-4"><Label label={adminRes.string.Total} />: {summary?.total ?? '-'}</span>
    {#each Object.entries(summary?.byMode ?? {}) as [mode, count]}
      <span class="mr-4">{mode}: {count}</span>
    {/each}
  </div>
  <div class="flex-row-center flex-wrap mt-1">
    {#each Object.entries(summary?.byVersion ?? {}) as [k, v]}
      <span class="mr-4">{k}: {v}</span>
    {/each}
    {#each Object.entries(summary?.byRegion ?? {}) as [k, v]}
      <span class="mr-4">{k === '' ? 'Default' : k}: {v}</span>
    {/each}
  </div>

  <div class="fs-title mt-4 mb-2"><Label label={adminRes.string.LiveStats} /></div>
  <div class="flex-row-center">
    <span class="mr-4"><Label label={adminRes.string.Users} />: {overview?.usersTotal ?? '-'}</span>
    <span class="mr-4"><Label label={adminRes.string.Connections} />: {overview?.connectionsTotal ?? '-'}</span>
    <span class="mr-4"><Label label={adminRes.string.ActiveWorkspaces} />: {overview?.workspaces?.length ?? '-'}</span>
  </div>

  <div class="fs-title mt-4 mb-2"><Label label={adminRes.string.PaidSeats} /></div>
  <div class="flex-row-center flex-wrap">
    <span class="mr-4"><Label label={adminRes.string.Total} />: {paidSeats}</span>
    {#each billing as b}
      <span class="mr-4">
        {plans?.labels[b.plan] ?? b.plan}: {b.seats}
        <span class="content-dark-color">({b.workspaces} ws)</span>
      </span>
    {/each}
  </div>
</div>

<RegistrationsChart {refreshTick} />

<div class="p-3">
  <div class="flex-row-center mb-2">
    <span class="fs-title mr-4"><Label label={adminRes.string.Services} /></span>
    <Button
      label={adminRes.string.GroupByName}
      kind={groupByName ? 'primary' : 'regular'}
      size={'small'}
      on:click={() => (groupByName = !groupByName)}
    />
    <span class="ml-4 content-dark-color">
      <Label label={adminRes.string.Total} />: mem {Math.round(totals.memoryUsed)}/{Math.round(totals.memoryTotal)} MB, RSS
      {Math.round(totals.memoryRSS)}
      MB, CPU {Math.round(totals.cpu * 10) / 10}%
    </span>
  </div>
  <table class="services-table">
    <thead>
      <tr>
        <th><Label label={adminRes.string.Service} /></th>
        <th>Mem (MB)</th>
        <th>RSS (MB)</th>
        <th>CPU (%)</th>
      </tr>
    </thead>
    <tbody>
      {#each serviceRows as row}
        <tr>
          <td>{row.name}{row.count > 1 ? ` x${row.count}` : ''}</td>
          <td>{Math.round(row.memoryUsed)}/{Math.round(row.memoryTotal)}</td>
          <td>{Math.round(row.memoryRSS)}</td>
          <td>{Math.round(row.cpu * 10) / 10}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style lang="scss">
  .services-table {
    border-collapse: collapse;
    th,
    td {
      text-align: left;
      padding: 0.25rem 1rem 0.25rem 0;
      border-bottom: 1px solid var(--theme-divider-color, #8883);
    }
  }
</style>
