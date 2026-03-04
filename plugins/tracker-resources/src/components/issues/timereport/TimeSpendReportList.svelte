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
  import { DocumentQuery, IdMap, PersonId, Ref, toIdMap } from '@hcengineering/core'
  import { createQuery } from '@hcengineering/presentation'
  import { Issue, TimeSpendReport } from '@hcengineering/tracker'
  import tracker from '../../../plugin'
  import PersonCalendar from './PersonCalendar.svelte'
  import { Person } from '@hcengineering/contact'
  import {
    Button,
    CheckBox,
    DropdownLabels,
    Icon,
    IconActivityEdit,
    IconCircleAdd,
    IconEdit,
    ModernToggle,
    showPopup
  } from '@hcengineering/ui'
  import TimePresenter from './TimePresenter.svelte'
  import TimeReportHeader from './TimeReportHeader.svelte'
  import IssuePresenter from '../IssuePresenter.svelte'
  import EstimationPopup from './EstimationPopup.svelte'
  import PersonReportsPopup from './PersonReportsPopup.svelte'
  import { getPersonRefsByPersonIdsCb } from '@hcengineering/contact-resources'
  import IssueStatusPresenter from '../IssueStatusPresenter.svelte'
  import { getEmbeddedLabel } from '@hcengineering/platform'

  export let query: DocumentQuery<Issue> = {}

  // const reportQuery = createQuery()
  const issueQuery = createQuery()

  let issues: IdMap<Issue> = new Map()

  let issuesDayMap = new Map<number, Ref<Issue>[]>()
  let reports: TimeSpendReport[] = []
  let authors: PersonId[] = []

  $: issueQuery.query(
    tracker.class.Issue,
    { ...query },
    (res) => {
      issues = toIdMap(res)
      const reps = res.map((it) => (it.$lookup?.reports as TimeSpendReport[]) ?? []).flat()
      reps.sort((a, b) => (b.date ?? b.createdOn ?? 0) - (a.date ?? a.createdOn ?? 0))
      reports = reps

      authors = Array.from(new Set([...res.map((it) => it.createdBy), ...res.map((it) => it.modifiedBy)])).filter(
        (it) => it !== undefined
      )

      if (!onlyReports) {
        const _dayMap = new Map<number, Ref<Issue>[]>()

        for (const is of res) {
          let day = new Date(is.createdOn ?? 0).setHours(0, 0, 0, 0)
          _dayMap.set(day, Array.from(new Set([...(_dayMap.get(day) ?? []), is._id])))

          day = new Date(is.modifiedOn ?? 0).setHours(0, 0, 0, 0)
          _dayMap.set(day, Array.from(new Set([...(_dayMap.get(day) ?? []), is._id])))
        }

        issuesDayMap = _dayMap
      } else {
        issuesDayMap = new Map<number, Ref<Issue>[]>()
      }
    },
    {
      projection: {
        _class: 1,
        title: 1,
        identifier: 1,
        status: 1,
        modifiedOn: 1,
        createdOn: 1,
        createdBy: 1,
        modifiedBy: 1
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

  let authorRefs = new Map<PersonId, Ref<Person>>()

  $: getPersonRefsByPersonIdsCb(authors, (res) => {
    authorRefs = res
  })

  $: noEmployeeReports = (reports ?? []).filter((it) => it.employee == null)

  let onlyReports = false

  $: finalPersons = [
    ...(noEmployeeReports.length > 0 ? [null] : []),
    ...Array.from(new Set([...reportPersons, ...(!onlyReports ? authorRefs.values() : [])]))
  ]

  let currentDate: Date = new Date()

  let timeMode: 'x1' | 'x2' | 'x4'

  const timeModes: Record<typeof timeMode, number> = {
    x1: 1,
    x2: 2,
    x4: 4
  }
</script>

<TimeReportHeader bind:currentDate>
  <ModernToggle label={tracker.string.TimeSpendReports} bind:checked={onlyReports} />
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
  <svelte:fragment slot="day" let:day let:person let:height>
    {@const dayFrom = new Date(day).setHours(0, 0, 0, 0)}
    {@const dayTo = new Date(day).setHours(23, 59, 59, 999)}
    {@const dayReports = reports.filter(
      (it) => it.employee === person && it.date != null && dayFrom < it.date && it.date <= dayTo
    )}
    <!-- {@const personIds = getPersonByPersonRef(person) -->
    {@const taskIds = new Set(dayReports.map((it) => it.attachedTo))}
    {@const dayIssues = Array.from(new Set([...Array.from(taskIds), ...(issuesDayMap.get(dayFrom) ?? [])]))
      .map((it) => issues.get(it))
      .filter(
        (it) =>
          it !== undefined &&
          (taskIds.has(it._id) ||
            (it.createdBy !== undefined &&
              authorRefs.get(it.createdBy) === person &&
              dayFrom === new Date(it.createdOn ?? 0).setHours(0, 0, 0, 0)) ||
            (it.modifiedBy !== undefined &&
              authorRefs.get(it.modifiedBy) === person &&
              dayFrom === new Date(it.modifiedOn ?? 0).setHours(0, 0, 0, 0)))
      )}
    <div style:overflow="auto" style:height="{height}rem" class="p-1">
      <div class="flex flex-col p-1">
        {#each dayIssues as issue}
          {@const createdByMe = dayFrom === new Date(issue?.createdOn ?? 0).setHours(0, 0, 0, 0)}
          {@const closedByMe =
            dayFrom === new Date(issue?.modifiedOn ?? 0).setHours(0, 0, 0, 0) && issue?.isDone === true}
          <div class="flex flex-row-center gap-2 flex-wrap mb-1">
            <div class="flex flex-row-center gap-2">
              {#if createdByMe}
                <Icon icon={IconCircleAdd} size={'small'} />
              {/if}
              {#if closedByMe || dayReports.length > 0}
                <IssueStatusPresenter value={issue} />
              {/if}
              {#if createdByMe || closedByMe || dayReports.length > 0}
                <IssuePresenter value={issue} />
              {/if}
            </div>
            {#if dayReports.length > 0}
              <Button
                kind={'link'}
                size={'x-small'}
                on:click={() => {
                  showPopup(EstimationPopup, { object: issue })
                }}
              >
                <svelte:fragment slot="content">
                  <TimePresenter
                    value={dayReports.filter((it) => it.attachedTo === issue?._id).reduce((a, b) => a + b.value, 0)}
                  />
                </svelte:fragment>
              </Button>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  </svelte:fragment>
</PersonCalendar>
