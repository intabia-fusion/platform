<!--
// Copyright © 2022-2023 Hardcore Engineering Inc.
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
  import contact, { Employee, getCurrentEmployee } from '@hcengineering/contact'
  import { AttachedData, Class, DocumentUpdate, Ref, Space, getCurrentAccount } from '@hcengineering/core'
  import { getEmbeddedLabel, type IntlString } from '@hcengineering/platform'
  import presentation, { Card, createQuery, getClient } from '@hcengineering/presentation'
  import { UserBox } from '@hcengineering/contact-resources'
  import { Issue, type Project, TimeReportDayType, TimeSpendReport, TrackerEvents } from '@hcengineering/tracker'
  import {
    Button,
    DatePresenter,
    EditBox,
    IconChevronLeft,
    IconChevronRight,
    Label,
    getFormattedDate
  } from '@hcengineering/ui'
  import tracker from '../../../plugin'
  import { getTimeReportDate, getTimeReportDayType } from '../../../utils'
  import TitlePresenter from '../TitlePresenter.svelte'
  import { Analytics } from '@hcengineering/analytics'

  export let issue: Issue | undefined = undefined
  export let issueId: Ref<Issue> | undefined = issue?._id
  export let issueClass: Ref<Class<Issue>> = issue?._class ?? tracker.class.Issue
  export let space: Ref<Space> | undefined = issue?.space
  export let assignee: Ref<Employee> | null | undefined = issue?.assignee as Ref<Employee>

  export let value: TimeSpendReport | undefined
  export let placeholder: IntlString = tracker.string.TimeSpendReportValue
  export let defaultTimeReportDay: TimeReportDayType = TimeReportDayType.CurrentWorkDay
  export let initialDate: number | undefined = undefined

  const data = {
    date: value?.date ?? initialDate ?? Date.now(),
    description: value?.description ?? '',
    value: value?.value,
    employee: value?.employee ?? getCurrentEmployee() ?? assignee ?? null
  }

  let isSpaceOwner = false
  const spaceQuery = createQuery()
  $: if (space !== undefined) {
    spaceQuery.query(
      tracker.class.Project,
      { _id: space as Ref<Project> },
      (res) => {
        const sp = res[0]
        const me = getCurrentAccount()
        isSpaceOwner = sp?.owners?.includes(me.uuid) ?? false
      },
      { limit: 1 }
    )
  }

  const myEmployee = getCurrentEmployee() ?? null
  $: isOwnReport = value === undefined || value.employee === myEmployee
  $: canEdit = isSpaceOwner || isOwnReport
  $: if (!isSpaceOwner && value === undefined) {
    data.employee = myEmployee
  }

  function dayBounds (ts: number): { start: number, end: number } {
    const d = new Date(ts)
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).valueOf()
    const end = start + 24 * 60 * 60 * 1000
    return { start, end }
  }

  let dayTotalHours = 0
  const dayReportsQuery = createQuery()
  $: if (data.employee != null && data.date != null) {
    const { start, end } = dayBounds(data.date)
    dayReportsQuery.query(
      tracker.class.TimeSpendReport,
      {
        employee: data.employee,
        date: { $gte: start, $lt: end }
      },
      (res) => {
        dayTotalHours = res
          .filter((r) => value === undefined || r._id !== value._id)
          .reduce((sum, r) => sum + (r.value ?? 0), 0)
      }
    )
  } else {
    dayTotalHours = 0
  }

  let selectedTimeReportDay = getTimeReportDayType(data.date)

  // Suffix → multiplier in hours. 1 day = 8h, 1 week = 40h.
  const unitMultipliers: Array<{ suffixes: string[], hours: number }> = [
    { suffixes: ['m', 'min', 'mins', 'minute', 'minutes', 'м', 'мин', 'минута', 'минуты', 'минут'], hours: 1 / 60 },
    { suffixes: ['h', 'hr', 'hrs', 'hour', 'hours', 'ч', 'час', 'часа', 'часов'], hours: 1 },
    { suffixes: ['d', 'day', 'days', 'д', 'дн', 'день', 'дня', 'дней'], hours: 8 },
    { suffixes: ['w', 'week', 'weeks', 'н', 'нед', 'неделя', 'недели', 'недель'], hours: 40 }
  ]

  function parseTimeInput (input: string): number | undefined {
    const trimmed = input.trim().toLowerCase().replace(',', '.')
    if (trimmed === '') return undefined
    const match = trimmed.match(/^([0-9]*\.?[0-9]+)\s*([a-zA-Zа-яА-Я]*)$/)
    if (match === null) return undefined
    const num = Number(match[1])
    if (!Number.isFinite(num)) return undefined
    const suffix = match[2]
    if (suffix === '') return num
    for (const unit of unitMultipliers) {
      if (unit.suffixes.includes(suffix)) {
        return num * unit.hours
      }
    }
    return undefined
  }

  let textValue: string = data.value !== undefined ? String(data.value) : ''

  $: data.value = parseTimeInput(textValue)
  $: hasSuffix = /[a-zA-Zа-яА-Я]/.test(textValue.trim())
  $: dayProjectedHours = dayTotalHours + (Number.isFinite(data.value) ? (data.value as number) : 0)

  function setNumericValue (hours: number): void {
    textValue = String(hours)
  }

  function shiftDay (delta: number): void {
    const base = data.date != null ? new Date(data.date) : new Date()
    base.setDate(base.getDate() + delta)
    data.date = base.valueOf()
    selectedTimeReportDay = getTimeReportDayType(data.date)
  }

  function setToday (): void {
    data.date = Date.now()
    selectedTimeReportDay = getTimeReportDayType(data.date)
  }

  $: todayDate = Date.now()
  $: previousWorkDate = getTimeReportDate(TimeReportDayType.PreviousWorkDay)
  $: isToday = data.date != null && new Date(data.date).toDateString() === new Date(todayDate).toDateString()
  $: previousWorkDateLabel = getFormattedDate(previousWorkDate, { weekday: 'short', day: 'numeric', month: 'short' })
  $: todayLabel = getFormattedDate(todayDate, { weekday: 'short', day: 'numeric', month: 'short' })

  let todayHours = 0
  let prevHours = 0
  const navReportsQuery = createQuery()
  $: if (data.employee != null) {
    const todayBounds = dayBounds(todayDate)
    const prevBounds = dayBounds(previousWorkDate)
    const start = Math.min(todayBounds.start, prevBounds.start)
    const end = Math.max(todayBounds.end, prevBounds.end)
    navReportsQuery.query(
      tracker.class.TimeSpendReport,
      {
        employee: data.employee,
        date: { $gte: start, $lt: end }
      },
      (res) => {
        const filtered = res.filter((r) => value === undefined || r._id !== value._id)
        todayHours = filtered
          .filter((r) => r.date != null && r.date >= todayBounds.start && r.date < todayBounds.end)
          .reduce((sum, r) => sum + (r.value ?? 0), 0)
        prevHours = filtered
          .filter((r) => r.date != null && r.date >= prevBounds.start && r.date < prevBounds.end)
          .reduce((sum, r) => sum + (r.value ?? 0), 0)
      }
    )
  } else {
    todayHours = 0
    prevHours = 0
  }

  function fmtHours (h: number): string {
    return Math.round(h * 1000) / 1000 + ''
  }

  export function canClose (): boolean {
    return true
  }

  const client = getClient()

  async function create (): Promise<void> {
    if (value === undefined) {
      if (space && issueId) {
        await client.addCollection(
          tracker.class.TimeSpendReport,
          space,
          issueId,
          issueClass,
          'reports',
          data as AttachedData<TimeSpendReport>
        )
        Analytics.handleEvent(TrackerEvents.IssueTimeSpentAdded, { issue: issue?.identifier ?? issueId })
      }
    } else {
      const ops: DocumentUpdate<TimeSpendReport> = {}
      if (value.value !== data.value) {
        ops.value = data.value
      }
      if (value.employee !== data.employee) {
        ops.employee = data.employee
      }
      if (value.description !== data.description) {
        ops.description = data.description
      }
      if (value.date !== data.date) {
        ops.date = data.date
      }
      if (Object.keys(ops).length > 0) {
        await client.update(value, ops)
        Analytics.handleEvent(TrackerEvents.IssueTimeSpentUpdated, { issue: issue?.identifier ?? issueId })
      }
    }
  }

  $: canSave =
    canEdit && Number.isFinite(data.value) && data.value !== 0 && space !== undefined && issueId !== undefined
</script>

<Card
  label={value === undefined ? tracker.string.TimeSpendReportAdd : tracker.string.TimeSpendReportValue}
  {canSave}
  okAction={create}
  gap={'gapV-4'}
  width={'medium'}
  thinHeader
  on:close
  okLabel={value === undefined ? presentation.string.Create : presentation.string.Save}
  on:changeContent
>
  <svelte:fragment slot="header">
    {#if issue}
      <TitlePresenter showParent={false} value={issue} />
    {/if}
  </svelte:fragment>
  <div class="flex-row-center gap-2">
    <EditBox autoFocus bind:value={textValue} {placeholder} maxWidth={'15rem'} kind={'editbox'} disabled={!canEdit} />
    {#if hasSuffix && data.value !== undefined && Number.isFinite(data.value)}
      <span class="text-sm content-dark-color">
        = {Math.round(data.value * 1000) / 1000}<Label label={tracker.string.HourLabel} />
      </span>
    {/if}
    <Button
      kind={'link-bordered'}
      disabled={!canEdit}
      on:click={() => {
        setNumericValue(0.25)
      }}
    >
      <span slot="content">15<Label label={tracker.string.MinuteLabel} /></span>
    </Button>
    <Button
      kind={'link-bordered'}
      disabled={!canEdit}
      on:click={() => {
        setNumericValue(0.5)
      }}
    >
      <span slot="content">30<Label label={tracker.string.MinuteLabel} /></span>
    </Button>
    <Button
      kind={'link-bordered'}
      disabled={!canEdit}
      on:click={() => {
        setNumericValue(1)
      }}
    >
      <span slot="content">1<Label label={tracker.string.HourLabel} /></span>
    </Button>
    <Button
      kind={'link-bordered'}
      disabled={!canEdit}
      on:click={() => {
        setNumericValue(2)
      }}
    >
      <span slot="content">2<Label label={tracker.string.HourLabel} /></span>
    </Button>
    <Button
      kind={'link-bordered'}
      disabled={!canEdit}
      on:click={() => {
        setNumericValue(4)
      }}
    >
      <span slot="content">4<Label label={tracker.string.HourLabel} /></span>
    </Button>
    <Button
      kind={'link-bordered'}
      disabled={!canEdit}
      on:click={() => {
        setNumericValue(8)
      }}
    >
      <span slot="content">8<Label label={tracker.string.HourLabel} /></span>
    </Button>
  </div>
  <div class="mt-2 mb-2">
    <EditBox
      bind:value={data.description}
      placeholder={tracker.string.TimeSpendReportDescription}
      kind={'editbox'}
      disabled={!canEdit}
    />
  </div>
  <svelte:fragment slot="footer">
    <div class="flex flex-col">
      <div class="flex flex-row-center gap-2">
        <div
          class="text-base"
          class:overReported={dayProjectedHours > 8}
          class:content-dark-color={dayProjectedHours <= 8}
        >
          <Label
            label={tracker.string.AlreadyReportedThisDay}
            params={{ hours: Math.round(dayProjectedHours * 1000) / 1000 }}
          />
        </div>
        {#if dayProjectedHours > 8 && canEdit}
          <Button
            kind={'regular'}
            size={'small'}
            label={tracker.string.FixToEightHours}
            on:click={() => {
              const remaining = 8 - dayTotalHours
              setNumericValue(Math.max(0, Math.round(remaining * 1000) / 1000))
            }}
          />
        {/if}
      </div>
    </div>
  </svelte:fragment>
  <svelte:fragment slot="pool">
    <div class="flex flex-grow flex-between">
      <UserBox
        _class={contact.mixin.Employee}
        label={contact.string.Employee}
        kind={'regular'}
        size={'large'}
        bind:value={data.employee}
        showNavigate={false}
        readonly={!isSpaceOwner || !canEdit}
      />
      <div class="flex-row-center gap-2">
        <DatePresenter
          bind:value={data.date}
          editable={canEdit}
          kind={'regular'}
          size={'large'}
          on:change={({ detail }) => (selectedTimeReportDay = getTimeReportDayType(detail))}
        />
        <div class="flex flex-row-center gap-1">
          <Button
            icon={IconChevronLeft}
            kind={'regular'}
            size={'large'}
            disabled={!canEdit}
            on:click={() => {
              shiftDay(-1)
            }}
          />
          <Button
            size={'large'}
            kind={isToday ? 'primary' : 'regular'}
            label={getEmbeddedLabel(todayLabel + ' (' + fmtHours(todayHours) + 'h)')}
            disabled={!canEdit || isToday}
            on:click={setToday}
          />
          <Button
            icon={IconChevronRight}
            kind={'regular'}
            size={'large'}
            disabled={!canEdit}
            on:click={() => {
              shiftDay(1)
            }}
          />
        </div>
      </div>
    </div>
    <span class="flex flex-grow flex-reverse text-base content-dark-color">
      <Label label={tracker.string.PreviousWorkDay} />: {previousWorkDateLabel}
    </span>
  </svelte:fragment>
</Card>

<style lang="scss">
  .overReported {
    color: var(--theme-error-color);
    font-weight: 500;
  }
</style>
