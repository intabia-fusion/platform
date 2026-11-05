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
<!--
  A rule of a recurring series in one line: "Кажд. 2 недели · Пн, Ср · До 31.12.2026". The editor
  needs it as a preview of what the picked options mean, and a meeting panel needs it to tell a
  series from a one-off event without opening the rule editor.
-->
<script lang="ts">
  import type { RecurringRule } from '@hcengineering/calendar'
  import type { IntlString } from '@hcengineering/platform'
  import { getFormattedDate, Label } from '@hcengineering/ui'
  import calendar from '../plugin'

  export let rules: RecurringRule[] = []
  export let startDate: number | undefined = undefined

  const FREQ_LABEL: Record<string, IntlString> = {
    DAILY: calendar.string.Day,
    WEEKLY: calendar.string.Week,
    MONTHLY: calendar.string.Month,
    YEARLY: calendar.string.Year
  }

  const WEEKDAY_LABEL: Record<string, IntlString> = {
    MO: calendar.string.MondayShort,
    TU: calendar.string.TuesdayShort,
    WE: calendar.string.WednesdayShort,
    TH: calendar.string.ThursdayShort,
    FR: calendar.string.FridayShort,
    SA: calendar.string.SaturdayShort,
    SU: calendar.string.SundayShort
  }

  $: rule = rules.length > 0 ? rules[0] : undefined
  $: interval = rule?.interval ?? 1
  $: freq = FREQ_LABEL[rule?.freq ?? ''] ?? calendar.string.Day
  // `byDay` also carries the "second Tuesday" form (`2TU`) in monthly rules - only the two-letter
  // tail is a weekday, the position is printed separately by `bySetPos`.
  $: days = (rule?.byDay ?? [])
    .map((it) => WEEKDAY_LABEL[it.slice(-2)])
    .filter((it): it is IntlString => it !== undefined)
  $: endDate = rule?.endDate !== undefined ? getFormattedDate(rule.endDate) : undefined
</script>

{#if rule !== undefined}
  <span class="recurrence-summary" data-id="recurrence-summary">
    <Label label={calendar.string.Every} />
    &nbsp;{interval}&nbsp;
    <Label label={freq} params={{ count: interval }} />
    {#if days.length > 0}
      &nbsp;·
      {#each days as day}<Label label={day} />{/each}
    {/if}
    {#if rule.byMonthDay !== undefined && rule.byMonthDay.length > 0}
      &nbsp;· {rule.byMonthDay.join(', ')}
    {/if}
    {#if rule.bySetPos !== undefined && rule.bySetPos.length > 0}
      &nbsp;· <Label label={calendar.string.OnThe} /> {rule.bySetPos.join(', ')}
    {/if}
    {#if rule.count !== undefined}
      &nbsp;· <Label label={calendar.string.After} /> {rule.count} <Label label={calendar.string.Times} params={{ count: rule.count }} />
    {:else if endDate !== undefined}
      &nbsp;· <Label label={calendar.string.OnUntil} /> {endDate}
    {/if}
  </span>
{/if}

<style lang="scss">
  .recurrence-summary {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    font-size: 0.8125rem;
    color: var(--theme-content-color);
  }
</style>
