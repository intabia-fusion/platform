<!--
// Copyright © 2020, 2021 Anticrm Platform Contributors.
// Copyright © 2021, 2023 Hardcore Engineering Inc.
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
  import type { IntlString } from '@hcengineering/platform'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { Issue, Project, TimeSpendReport, reduceChildInfoTree, splitReportedTime } from '@hcengineering/tracker'
  import {
    ActionIcon,
    IconAdd,
    Label,
    eventToHTMLElement,
    floorFractionDigits,
    showPopup,
    tooltip
  } from '@hcengineering/ui'

  import trackerPlugin from '../../../plugin'
  import { activeProjects } from '../../../utils'
  import ReportsPopup from './ReportsPopup.svelte'
  import TimePresenter from './TimePresenter.svelte'
  import TimeSpendReportPopup from './TimeSpendReportPopup.svelte'
  import {
    DraftTimeReportPayload,
    ITimeReportService,
    DirectTimeReportService,
    DraftTimeReportService
  } from './service'

  // export let label: IntlString
  export let placeholder: IntlString
  export let object: Issue
  export let value: number
  export let kind: 'no-border' | 'link' = 'no-border'
  export let size: 'small' | 'medium' | 'large' = 'large'
  export let currentProject: Project | undefined = undefined
  export let readonly: boolean = false
  export let draft: boolean = false
  export let onChange: ((val: any) => void) | undefined = undefined
  export let showChildIssues: boolean = true
  // Pass it in when several editors share an issue; left out, the editor queries on its own.
  export let reports: TimeSpendReport[] | undefined = undefined

  $: if (currentProject === undefined) {
    currentProject = $activeProjects.get(object.space)
  }

  $: defaultTimeReportDay = currentProject?.defaultTimeReportDay

  const client = getClient()

  let service: ITimeReportService

  $: {
    if (service?.isDraft !== draft) {
      if (draft) {
        const initialVal = typeof value === 'number' ? value : ((value as DraftTimeReportPayload)?.reportedTime ?? 0)
        service = new DraftTimeReportService((val) => {
          value = val.reportedTime
          onChange?.(val)
        }, initialVal)
      } else {
        service = new DirectTimeReportService(client)
      }
    }
  }

  function addTimeReport (event: MouseEvent): void {
    if (readonly) return
    showPopup(
      TimeSpendReportPopup,
      {
        issue: object,
        issueId: object._id,
        defaultTimeReportDay,
        issueClass: object._class,
        space: object.space,
        assignee: object.assignee,
        currentProject,
        service
      },
      eventToHTMLElement(event)
    )
  }
  function showReports (event: MouseEvent): void {
    if (readonly) return
    showPopup(ReportsPopup, { issue: object, service }, eventToHTMLElement(event))
  }
  $: childInfos = object.childInfo ?? []
  $: treeInfo = reduceChildInfoTree(childInfos, 0, 0)
  $: childTime = floorFractionDigits(treeInfo.totalReportedTime, 3)

  $: numericValue =
    typeof value === 'number'
      ? value
      : ((typeof value === 'object' && value !== null ? (value as DraftTimeReportPayload)?.reportedTime : undefined) ??
        object?.reportedTime ??
        0)

  // Reports mirror planner work slots, so part of the reported time may still be ahead of now.
  const reportsQuery = createQuery()
  let ownReports: TimeSpendReport[] | undefined = undefined

  $: if (reports === undefined && !draft && object?._id !== undefined) {
    reportsQuery.query(
      trackerPlugin.class.TimeSpendReport,
      { attachedTo: object._id },
      (res) => {
        ownReports = res
      },
      { projection: { date: 1, value: 1, workslot: 1 } }
    )
  }

  $: effectiveReports = reports ?? ownReports
  $: split = effectiveReports !== undefined ? splitReportedTime(effectiveReports) : undefined
  $: spentValue = split !== undefined ? floorFractionDigits(split.spent, 3) : numericValue
  $: plannedValue = split !== undefined ? floorFractionDigits(split.planned, 3) : 0
</script>

{#if kind === 'link'}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    id="ReportedTimeEditor"
    class="link-container antiButton link {size} flex-grow flex-between"
    class:readonly
    on:click={showReports}
  >
    {#if numericValue !== undefined}
      <span class="flex-row-center">
        {#if showChildIssues}
          <TimePresenter value={spentValue + childTime} />
          {#if childTime !== 0}
            <span class="ml-1">
              (<TimePresenter value={spentValue} />
              / <TimePresenter value={childTime} />)
            </span>
          {/if}
        {:else}
          <TimePresenter value={spentValue} />
        {/if}
        {#if plannedValue > 0}
          <span class="ml-2 content-dark-color" use:tooltip={{ label: trackerPlugin.string.PlannedTime }}>
            +<TimePresenter value={plannedValue} />
          </span>
        {/if}
      </span>
    {:else}
      <span class="content-dark-color"><Label label={placeholder} /></span>
    {/if}
    {#if !readonly}
      <div class="add-action">
        <ActionIcon icon={IconAdd} size={'small'} action={addTimeReport} />
      </div>
    {/if}
  </div>
{:else if numericValue !== undefined}
  <span class="flex-row-center">
    <TimePresenter value={spentValue} />
    {#if childTime !== 0}
      / <TimePresenter value={childTime} />
    {/if}
    {#if plannedValue > 0}
      <span class="ml-2 content-dark-color" use:tooltip={{ label: trackerPlugin.string.PlannedTime }}>
        +<TimePresenter value={plannedValue} />
      </span>
    {/if}
  </span>
{:else}
  <span class="content-dark-color"><Label label={placeholder} /></span>
{/if}

<style lang="scss">
  .link-container {
    padding: 0px 0.75rem;
    border-radius: 0.375rem;

    &:not(.readonly) {
      cursor: pointer;

      .add-action {
        visibility: hidden;
      }

      &:hover {
        .add-action {
          visibility: visible;
        }
      }
    }
  }
</style>
