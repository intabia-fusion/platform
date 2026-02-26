<!--
// Copyright © 2026 Intabia Fusion
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
  import { Class, Doc, DocumentQuery, FindOptions, Ref, toIdMap } from '@hcengineering/core'
  import { createQuery } from '@hcengineering/presentation'
  import { DocWithRank } from '@hcengineering/task'
  import tracker, { Issue, Project, TimeSpendReport } from '@hcengineering/tracker'
  import { ViewOptionModel, ViewOptions, Viewlet, BuildModelKey } from '@hcengineering/view'
  import PersonCalendar from './PersonCalendar.svelte'
  import { Person } from '@hcengineering/contact'
  import { Button, DropdownLabels, DropdownLabelsIntl, Icon, showPopup } from '@hcengineering/ui'
  import TimePresenter from './TimePresenter.svelte'
  import TimeReportHeader from './TimeReportHeader.svelte'
  import IssuePresenter from '../IssuePresenter.svelte'
  import EstimationPopup from './EstimationPopup.svelte'
  import IssueStatusPresenter from '../IssueStatusPresenter.svelte'
  import PersonReportsPopup from './PersonReportsPopup.svelte'

  export let query: DocumentQuery<Issue> = {}

  // const reportQuery = createQuery()
  const issueQuery = createQuery()

  let tasks: Issue[] = []
  let reports: TimeSpendReport[] = []

  $: issueQuery.query(
    tracker.class.Issue,
    { ...query },
    (res) => {
      tasks = res
      const reps = res.map((it) => (it.$lookup?.reports as TimeSpendReport[]) ?? []).flat()
      reps.sort((a, b) => (b.date ?? b.createdOn ?? 0) - (a.date ?? a.createdOn ?? 0))
      reports = reps
    },
    {
      projection: {
        _class: 1,
        title: 1,
        identifier: 1,
        status: 1
      },
      lookup: {
        _id: {
          reports: tracker.class.TimeSpendReport
        }
      }
    }
  )

  // $: persons = Array.from(tasks.filter(it => it.assignee != null).map(it => it.assignee) as Ref<Person>[] ?? [])
  $: reportPersons = Array.from(
    (reports.filter((it) => it.employee != null).map((it) => it.employee) as Ref<Person>[]) ?? []
  )

  $: uneployedReports = (reports ?? []).filter((it) => it.employee == null)

  $: finalPersons = [...(uneployedReports.length > 0 ? [null] : []), ...Array.from(new Set(reportPersons))]

  let currentDate: Date = new Date()

  let timeMode: 'x1' | 'x2' | 'x4'

  const timeModes: Record<typeof timeMode, number> = {
    x1: 1,
    x2: 2,
    x4: 4
  }
</script>

<TimeReportHeader bind:currentDate>
  <DropdownLabels
    items={[
      { id: 'x1', label: 'x1' },
      { id: 'x2', label: 'x2' },
      { id: 'x4', label: 'x4' }
    ]}
    bind:selected={timeMode}
    kind={'regular'}
    size={'medium'}
    showDropdownIcon
  />
  <div class="hulyHeader-divider short" />
</TimeReportHeader>
<PersonCalendar
  persons={finalPersons}
  startDate={currentDate}
  maxDays={7 * (timeModes[timeMode] ?? 1)}
  multipler={timeModes[timeMode] ?? 1}
>
  <svelte:fragment slot="person-info" let:person let:leftDay let:rightDay>
    {@const ld = leftDay.getTime()}
    {@const rd = rightDay.getTime()}
    {@const allReports = reports.filter(
      (it) => it.employee === person && it.date != null && ld < it.date && it.date < rd
    )}
    <Button
      kind={'link'}
      on:click={() => {
        showPopup(PersonReportsPopup, { person, ld, rd })
      }}
    >
      <svelte:fragment slot="content">
        <TimePresenter value={allReports.reduce((a, b) => a + b.value, 0)} />
      </svelte:fragment>
    </Button>
  </svelte:fragment>
  <svelte:fragment slot="day" let:day let:today let:weekend let:person let:height>
    {@const dayFrom = new Date(day).setHours(0, 0, 0, 0)}
    {@const dayTo = new Date(day).setHours(23, 59, 59, 999)}
    {@const dayReports = reports.filter(
      (it) => it.employee === person && it.date != null && dayFrom < it.date && it.date <= dayTo
    )}
    {@const taskIds = new Set(dayReports.map((it) => it.attachedTo))}
    {@const dayIssues = tasks.filter((it) => taskIds.has(it._id))}
    <div style:overflow="auto" style:height="{height}rem" class="p-1">
      {#if reports.length > 0}
        <div class="flex flex-col p-1">
          {#each dayIssues as issue}
            <div class="flex flex-row-center gap-2 flex-wrap">
              <div class="p-1 flex flex-row-center gap-2">
                <IssueStatusPresenter value={issue} />
                <IssuePresenter value={issue} />
              </div>
              <Button
                kind={'link'}
                on:click={() => {
                  showPopup(EstimationPopup, { object: issue })
                }}
              >
                <svelte:fragment slot="content">
                  <TimePresenter
                    value={dayReports.filter((it) => it.attachedTo === issue._id).reduce((a, b) => a + b.value, 0)}
                  />
                </svelte:fragment>
              </Button>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </svelte:fragment>
</PersonCalendar>
