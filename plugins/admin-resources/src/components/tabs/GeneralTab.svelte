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
  import { getEmbeddedLabel, getMetadata } from '@hcengineering/platform'
  import presentation, { type OverviewStatistics } from '@hcengineering/presentation'
  import { Button, type DropdownIntlItem, Label, Loading, themeStore } from '@hcengineering/ui'
  import { MenuButton } from '@hcengineering/ui/kit'

  import adminRes from '../../plugin'
  import RegistrationsChart from '../RegistrationsChart.svelte'
  import { downloadReport, type ReportFormat, type ReportId } from '../../reports'
  import { getWorkspacesSummary, loadPlanOptions, type PlanOptions, adminFetch } from '../../utils'

  let generating = false
  let reportFormat: ReportFormat = 'csv'
  const reportItems: Array<DropdownIntlItem<ReportId>> = [
    { id: 'accounts', label: adminRes.string.ReportAccounts },
    { id: 'workspaces', label: adminRes.string.ReportWorkspaces },
    { id: 'paid', label: adminRes.string.ReportPaidWorkspaces }
  ]
  async function runReport (id: ReportId): Promise<void> {
    generating = true
    try {
      await downloadReport(id, reportFormat)
    } catch (err) {
      console.error('Report generation failed:', err)
    } finally {
      generating = false
    }
  }

  export let refreshTick: number = 0

  let summary: WorkspacesSummary | null = null
  let summaryLoading = true

  const loadSummary = reduceCalls(async (): Promise<void> => {
    summaryLoading = true
    summary = await getWorkspacesSummary()
    summaryLoading = false
  })

  // Live service stats (in-memory on the stats pod)
  const statsEndpoint = getMetadata(presentation.metadata.StatsUrl)
  let overview: OverviewStatistics | undefined

  async function loadOverview (): Promise<void> {
    try {
      const res = await adminFetch(statsEndpoint + '/api/v1/overview')
      if (!res.ok) throw new Error(`Overview request failed: ${res.status}`)
      overview = await res.json()
    } catch (err) {
      overview = undefined
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
  const categories = [
    { id: 'paid', label: adminRes.string.PaidSubscriptions },
    { id: 'manual', label: adminRes.string.ManualSubscriptions },
    { id: 'trial', label: adminRes.string.TrialingOnly },
    { id: 'free', label: adminRes.string.FreeSubscriptions },
    { id: 'other', label: adminRes.string.OtherSubscriptions }
  ]
  $: subscriptionGroups = categories.map((category) => {
    const rows = billing.filter(
      (row) =>
        row.category === category.id ||
        (category.id === 'paid' && row.category === 'manual') ||
        (category.id === 'other' && row.category == null)
    )
    return {
      ...category,
      workspaces: rows.reduce((total, row) => total + row.workspaces, 0),
      seats: rows.reduce((total, row) => total + row.seats, 0)
    }
  })
</script>

<div class="p-3">
  <div class="flex-row-center mb-2">
    <span class="fs-title mr-4"><Label label={adminRes.string.Reports} /></span>
    <MenuButton
      label={adminRes.string.CreateReport}
      kind="primary"
      size="small"
      disabled={generating}
      items={reportItems}
      on:selected={(it) => {
        void runReport(it.detail)
      }}
    />
    <div class="ml-2 flex-row-center">
      <Button
        label={getEmbeddedLabel('CSV')}
        kind={reportFormat === 'csv' ? 'primary' : 'regular'}
        size="small"
        on:click={() => (reportFormat = 'csv')}
      />
      <Button
        label={getEmbeddedLabel('PDF')}
        kind={reportFormat === 'pdf' ? 'primary' : 'regular'}
        size="small"
        on:click={() => (reportFormat = 'pdf')}
      />
    </div>
  </div>

  <div class="overview-grid mt-4">
    <div class="overview-card">
      <div class="content-dark-color"><Label label={adminRes.string.Workspaces} /></div>
      <div class="metric">{summary?.total ?? '-'}</div>
      <div class="breakdown">
        {#each Object.entries(summary?.byMode ?? {}) as [mode, count]}
          <span>{mode}: {count}</span>
        {/each}
      </div>
    </div>
    <div class="overview-card">
      <div class="content-dark-color"><Label label={adminRes.string.LiveStats} /></div>
      <div class="metric">{overview?.usersTotal ?? '-'} <span><Label label={adminRes.string.Users} /></span></div>
      <div class="breakdown">
        <span><Label label={adminRes.string.Connections} />: {overview?.connectionsTotal ?? '-'}</span>
        <span><Label label={adminRes.string.ActiveWorkspaces} />: {overview?.workspaces?.length ?? '-'}</span>
      </div>
    </div>
  </div>

  <div class="fs-title mt-4 mb-1"><Label label={adminRes.string.SubscriptionSnapshot} /></div>
  <div class="content-dark-color mb-3"><Label label={adminRes.string.SubscriptionSnapshotHint} /></div>
  {#if summaryLoading}
    <Loading />
  {:else if summary === null}
    <div class="content-dark-color"><Label label={adminRes.string.LoadError} /></div>
  {:else}
    <div class="overview-grid subscriptions">
      {#each subscriptionGroups as group}
        <div
          class="overview-card"
          class:paid={group.id === 'paid'}
          class:manual={group.id === 'manual'}
          class:trial={group.id === 'trial'}
        >
          <div class="content-dark-color">
            <Label label={group.id === 'manual' ? adminRes.string.ManualIncluded : group.label} />
          </div>
          <div class="metric">{group.workspaces} <span><Label label={adminRes.string.Workspaces} /></span></div>
          <div>
            <Label label={group.id === 'manual' ? adminRes.string.ActualSeats : adminRes.string.Seats} />: {group.seats}
          </div>
        </div>
      {/each}
    </div>
    <div class="subscription-tables mt-3">
      {#if billing.length > 0}
        <div>
          <div class="fs-title mb-1"><Label label={adminRes.string.Subscriptions} /></div>
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th><Label label={adminRes.string.Plan} /></th>
                  <th><Label label={adminRes.string.Type} /></th>
                  <th><Label label={adminRes.string.Status} /></th>
                  <th class="number"><Label label={adminRes.string.Workspaces} /></th>
                  <th class="number"><Label label={adminRes.string.Seats} /></th>
                </tr>
              </thead>
              <tbody>
                {#each billing as row}
                  <tr>
                    <td>{plans?.labels[row.plan] ?? row.plan}</td>
                    <td
                      ><Label
                        label={categories.find((category) => category.id === row.category)?.label ??
                          adminRes.string.OtherSubscriptions}
                      /></td
                    >
                    <td>{row.status ?? '-'}</td>
                    <td class="number">{row.workspaces}</td>
                    <td class="number">{row.seats}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      {/if}
      {#if (summary.manualWorkspaces?.length ?? 0) > 0}
        <div>
          <div class="fs-title mb-1"><Label label={adminRes.string.ManualWorkspaces} /></div>
          <div class="content-dark-color table-caption mb-2"><Label label={adminRes.string.ManualSeatsHint} /></div>
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th><Label label={adminRes.string.Workspace} /></th>
                  <th><Label label={adminRes.string.Plan} /></th>
                  <th><Label label={adminRes.string.Status} /></th>
                  <th class="number"><Label label={adminRes.string.ActualSeats} /></th>
                </tr>
              </thead>
              <tbody>
                {#each (summary.manualWorkspaces ?? [])
                  .slice()
                  .sort((a, b) => a.name.localeCompare(b.name)) as workspace}
                  <tr>
                    <td title={workspace.url}>{workspace.name}</td>
                    <td>{plans?.labels[workspace.plan] ?? workspace.plan}</td>
                    <td>{workspace.status}</td>
                    <td class="number">{workspace.seats}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      {/if}
    </div>
  {/if}
  <div class="overview-grid mt-4">
    {#each [{ label: adminRes.string.Region, values: summary?.byRegion ?? {} }, { label: adminRes.string.Version, values: summary?.byVersion ?? {} }] as distribution}
      <div class="overview-card">
        <div class="fs-title mb-2"><Label label={distribution.label} /></div>
        <div class="breakdown">
          {#each Object.entries(distribution.values) as [key, count]}
            <span>{key === '' ? 'Default' : key}: {count}</span>
          {/each}
        </div>
      </div>
    {/each}
  </div>
</div>

<RegistrationsChart {refreshTick} />

<style lang="scss">
  .overview-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 19rem), 1fr));
    gap: 0.75rem;
  }
  .subscriptions {
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 13rem), 1fr));
  }
  .overview-card {
    padding: 0.625rem 0.75rem;
    border: 1px solid var(--theme-divider-color);
    border-radius: 0.75rem;
    min-width: 0;
  }
  .paid,
  .manual {
    border-top: 3px solid var(--primary-button-default);
  }
  .trial {
    border-top: 3px solid #d99526;
  }
  .metric {
    font-size: 1.5rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    margin: 0.25rem 0;
    span {
      font-size: 0.875rem;
      font-weight: 400;
    }
  }
  .breakdown {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
  }
  .subscription-tables {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 28rem), 1fr));
    gap: 1rem;
    align-items: start;
    > div {
      min-width: 0;
    }
  }
  .table-caption {
    font-size: 0.75rem;
    line-height: 1.35;
  }
  .table-scroll {
    overflow-x: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8125rem;
  }
  th,
  td {
    padding: 0.25rem 0.5rem;
    line-height: 1.35;
    text-align: left;
    border-bottom: 1px solid var(--theme-divider-color);
  }
  .number {
    width: 1%;
    white-space: nowrap;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
</style>
