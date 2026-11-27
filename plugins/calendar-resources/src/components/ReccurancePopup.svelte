<!--
// Copyright © 2023 Hardcore Engineering Inc.
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
  import type { RecurringRule } from '@hcengineering/calendar'
  import type { Timestamp } from '@hcengineering/core'
  import type { DropdownIntlItem } from '@hcengineering/ui'
  import ui, { Button, DropdownLabelsIntl, Label, NumberInput, RadioButton } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'
  import calendar from '../plugin'
  import DateEditor from './DateEditor.svelte'
  import RecurrenceSummary from './RecurrenceSummary.svelte'

  export let rules: RecurringRule[]
  export let startDate: Timestamp
  // Offered only where nothing is saved yet: removing the rule of an existing series needs the
  // event itself to change class, and that is not what this popup does.
  export let removable: boolean = false

  type Freq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
  let periodType: Freq = (rules[0]?.freq as Freq) ?? 'WEEKLY'
  let interval: number = rules[0]?.interval ?? 1
  let until: number = rules[0]?.endDate ?? Math.max(startDate, Date.now())

  const dispatch = createEventDispatcher()

  let selected = rules[0]?.endDate !== undefined ? 'on' : 'never'

  // A rule saved with a fixed number of occurrences keeps it: the end condition is not edited here
  // any more, so opening the popup and saving must not turn a finite series into an endless one.
  const savedCount = rules[0]?.count

  const ddItems = [
    {
      id: 'DAILY',
      label: calendar.string.Day
    },
    {
      id: 'WEEKLY',
      label: calendar.string.Week
    },
    {
      id: 'MONTHLY',
      label: calendar.string.Month
    },
    {
      id: 'YEARLY',
      label: calendar.string.Year
    }
  ] as DropdownIntlItem[]

  // The inputs are parameters, not free variables: a reactive statement only re-runs on the values
  // it can see, and `$: preview = buildRule()` read none of them - the preview, the summary and the
  // saved rule kept the values the popup was opened with, so changing the period did nothing.
  //
  // The rule is "every N days/weeks/months/years" and nothing else. RFC 5545 also lets a rule name
  // weekdays, month days and positions ("the second Tuesday"), and the popup asked for all of them
  // at once - five pickers for a repeat that is nearly always "every week on the same day". Those
  // keys are therefore not written: the generator falls back to the weekday and the day of month the
  // series starts on, which is exactly what an interval alone means.
  function buildRule (settings: {
    periodType: Freq
    interval: number
    selected: string
    until: number
    count: number | undefined
  }): RecurringRule {
    const res: RecurringRule = {
      freq: settings.periodType,
      interval: settings.interval
    }
    if (settings.selected === 'on') {
      res.endDate = settings.until
    } else if (settings.count !== undefined) {
      res.count = settings.count
    }
    return res
  }

  // A rule that cannot produce an occurrence is worse than no rule: the series would look scheduled
  // while nothing ever opens. An end date before the first occurrence is the same story.
  function isInvalid (rule: RecurringRule): boolean {
    // The end date is picked by day while the series starts at a time, so a rule ending on the very
    // day of its first occurrence is still valid there.
    return rule.endDate !== undefined && new Date(rule.endDate).setHours(23, 59, 59, 999) < startDate
  }

  $: preview = buildRule({
    periodType,
    interval,
    selected,
    until,
    count: savedCount
  })
  $: invalid = isInvalid(preview)

  function save (): void {
    if (invalid) return
    rules = [preview]
    dispatch('close', rules)
  }
</script>

<div class="repeatPopup-container">
  <div class="header">
    <Label label={calendar.string.Repeat} />
  </div>
  <div class="content flex-col flex-gap-2">
    <div class="flex-row-center gap-1-5">
      <span class="min-w-12"><Label label={calendar.string.Every} /></span>
      <NumberInput bind:value={interval} maxWidth="4rem" maxDigitsAfterPoint={0} minValue={1} />
      <DropdownLabelsIntl bind:selected={periodType} items={ddItems} size="medium" params={{ count: interval }} />
    </div>
    <div class="flex-row-center min-h-8">
      <Label label={calendar.string.Ends} />
    </div>
    <div class="flex-col flex-gap-2">
      <RadioButton
        labelIntl={calendar.string.Never}
        value="never"
        group={selected}
        action={() => {
          selected = 'never'
        }}
      />
      <div class="flex-row-center flex-gap-2">
        <RadioButton
          labelIntl={calendar.string.OnUntil}
          value="on"
          group={selected}
          action={() => {
            selected = 'on'
          }}
        />
        <DateEditor bind:date={until} withoutTime kind="secondary" disabled={selected !== 'on'} />
      </div>
    </div>
  </div>
  <div class="preview flex-row-center">
    <RecurrenceSummary rules={[preview]} {startDate} />
  </div>
  <div class="pool flex-between">
    <div>
      {#if removable}
        <Button label={calendar.string.DoNotRepeat} kind="ghost" on:click={() => dispatch('close', [])} />
      {/if}
    </div>
    <div class="flex-row-reverse flex-gap-3">
      <Button label={ui.string.Save} on:click={save} kind="primary" disabled={invalid} />
      <Button label={ui.string.Cancel} on:click={() => dispatch('close')} />
    </div>
  </div>
</div>

<style lang="scss">
  .repeatPopup-container {
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--theme-popup-color);
    box-shadow: var(--theme-popup-shadow);
    width: 25rem;
    border-radius: 1rem;

    .header {
      padding: 1.25rem;
      font-weight: 500;
      font-size: 1rem;
    }

    .content {
      padding: 0 1.25rem 1.25rem;
    }

    .pool {
      padding: 1.25rem;
      border-top: 1px solid var(--theme-divider-color);
    }
  }
</style>
