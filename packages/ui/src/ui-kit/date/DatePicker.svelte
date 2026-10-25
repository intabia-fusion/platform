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
  import { DateRangeMode, convertToDay } from '@hcengineering/core'
  import { translateCB, type IntlString } from '@hcengineering/platform'
  import { languageStore } from '@hcengineering/theme'
  import { createEventDispatcher, onMount } from 'svelte'

  import Label from '../../components/Label.svelte'
  import { deviceOptionsStore as deviceInfo } from '../../index'
  import ui from '../../plugin'
  import { DAY, HOUR, MINUTE } from '../../types'
  import { checkAdaptiveMatching } from '../../utils'
  import Button from '../button/Button.svelte'
  import IconButton from '../button/IconButton.svelte'
  import Calendar from '../calendar/Calendar.svelte'
  import type { CalendarRange } from '../calendar/types'
  import DateInput from './DateInput.svelte'
  import RelativeTime from '../relative-time/RelativeTime.svelte'
  import type { DatePickerEvents, DatePickerProps, DatePickerResult } from './types'

  type $$Props = DatePickerProps
  type $$Events = DatePickerEvents

  export let value: number | null | undefined = undefined
  export let end: number | null | undefined = undefined
  export let range: boolean = false
  export let mode: DateRangeMode = DateRangeMode.DATE
  export let compact: boolean = false
  export let label: IntlString | undefined = undefined
  export let detail: IntlString | undefined = undefined
  export let shifts: boolean = false
  export let timeZone: string | undefined = undefined
  export let autofocus: boolean = true

  const dispatch = createEventDispatcher<{ close: DatePickerResult | null }>()

  let draft: number | null = value ?? null
  let draftEnd: number | null = end ?? null
  let month = startOfMonth(value ?? end ?? Date.now())
  let input: DateInput | undefined

  const titleId = `date-picker-${Math.random().toString(36).slice(2, 10)}`

  // Two inputs of a range look alike to a screen reader without their names.
  let startName: string | undefined
  let endName: string | undefined
  let namesRequest = 0
  $: translateRangeNames(range, $languageStore)

  function translateRangeNames (isRange: boolean, lang: string): void {
    const request = ++namesRequest
    if (!isRange) return
    const language = lang === '' ? undefined : lang
    translateCB(ui.string.StartDate, {}, language, (text) => {
      if (request === namesRequest) startName = text
    })
    translateCB(ui.string.EndDate, {}, language, (text) => {
      if (request === namesRequest) endName = text
    })
  }

  $: withTime = mode !== DateRangeMode.DATE
  // Only the time of the day: the months have nothing to pick.
  $: timeOnly = !range && (mode === DateRangeMode.TIME || mode === DateRangeMode.TIMEONLY)
  $: title = label ?? (timeOnly ? ui.string.SelectTime : ui.string.SelectDate)
  $: inputMode = range
    ? DateRangeMode.DATE
    : timeOnly
      ? DateRangeMode.TIME
      : withTime
        ? DateRangeMode.DATETIME
        : DateRangeMode.DATE
  $: oneMonth = checkAdaptiveMatching($deviceInfo.size, 'sm')
  $: secondMonth = addMonths(month, 1)
  $: shiftGroups = buildShifts(mode)

  function startOfMonth (ts: number): number {
    const date = new Date(ts)
    return new Date(date.getFullYear(), date.getMonth(), 1).getTime()
  }

  function addMonths (ts: number, delta: number): number {
    const date = new Date(ts)
    return new Date(date.getFullYear(), date.getMonth() + delta, 1).getTime()
  }

  function buildShifts (mode: DateRangeMode): number[][] {
    const groups: number[][] = []
    if (mode !== DateRangeMode.DATE) {
      groups.push(
        [5, 15, 30].map((m) => m * MINUTE),
        [1, 2, 4, 8, 12].map((h) => h * HOUR)
      )
    }
    if (mode !== DateRangeMode.TIME && mode !== DateRangeMode.TIMEONLY) groups.push([1, 3, 7, 30].map((d) => d * DAY))
    return groups
  }

  // A date without time is stored at noon UTC (the same day in most zones); with time the seconds are dropped.
  function normalize (ts: number, keepTime: boolean): number {
    const date = new Date(ts)
    if (!keepTime) return convertToDay(date).getTime()
    date.setSeconds(0, 0)
    return date.getTime()
  }

  // Range ends are local midnights, as the filters expect.
  function startOfDay (ts: number): number {
    return new Date(ts).setHours(0, 0, 0, 0)
  }

  function close (result: DatePickerResult | null): void {
    dispatch('close', result)
  }

  function save (): void {
    if (!range) {
      close({ value: draft === null ? null : normalize(draft, withTime) })
      return
    }
    let start = draft === null ? null : startOfDay(draft)
    let last = draftEnd === null ? null : startOfDay(draftEnd)
    if (start === null && last !== null) {
      start = last
      last = null
    }
    if (start !== null && last !== null && last < start) [start, last] = [last, start]
    close({ value: start, end: last })
  }

  function handleSelect (ts: number): void {
    if (range) return
    // Compact gives the day at the time of `value`: an event moved to another day keeps its hour.
    if (compact) {
      close({ value: ts })
    } else if (!withTime) {
      close({ value: normalize(ts, false) })
    } else {
      // With time the picked day only fills the input: the time may still change.
      draft = ts
    }
  }

  function handleRange (detail: CalendarRange): void {
    draft = detail.start
    draftEnd = detail.end
  }

  function handleTyped (ts: number | null): void {
    draft = ts
    if (ts !== null) month = startOfMonth(ts)
  }

  function shiftBy (shift: number): void {
    close({ value: normalize(new Date().setSeconds(0, 0) + shift, withTime) })
  }

  onMount(() => {
    if (autofocus && !compact) input?.focus()
  })
</script>

{#if compact}
  <div class="date-picker date-picker--compact">
    <Calendar
      value={draft}
      {timeZone}
      on:select={(e) => {
        handleSelect(e.detail)
      }}
    />
  </div>
{:else}
  <div class="date-picker" class:date-picker--range={range} role="dialog" aria-labelledby={titleId}>
    {#if shifts && !range && shiftGroups.length > 0}
      <div class="date-picker__shifts">
        {#each shiftGroups as group, i}
          {#if i > 0}<div class="date-picker__shifts-divider" />{/if}
          {#each group as shift}
            <Button
              kind="ghost"
              size="small"
              inheritFont
              on:click={() => {
                shiftBy(shift)
              }}
            >
              <RelativeTime value={shift} format="offset" />
            </Button>
          {/each}
        {/each}
      </div>
    {/if}
    <div class="date-picker__main">
      <div class="date-picker__header">
        <span id={titleId} class="date-picker__title"><Label label={title} /></span>
        <IconButton
          kind="ghost"
          size="extra-small"
          icon={ui.icon.Cross}
          tooltip={{ label: ui.string.Close }}
          on:click={() => {
            close(null)
          }}
        />
      </div>
      <div class="date-picker__content">
        {#if detail}
          <div class="date-picker__detail"><Label label={detail} /></div>
        {/if}
        <div class="date-picker__inputs">
          <DateInput
            bind:this={input}
            value={draft}
            mode={inputMode}
            size="large"
            clearable
            {timeZone}
            aria-label={range ? startName : undefined}
            on:change={(e) => {
              handleTyped(e.detail)
            }}
            on:submit={save}
          />
          {#if range}
            <span class="date-picker__dash" aria-hidden="true">—</span>
            <DateInput
              value={draftEnd}
              size="large"
              clearable
              {timeZone}
              aria-label={endName}
              on:change={(e) => {
                draftEnd = e.detail
              }}
              on:submit={save}
            />
          {/if}
        </div>
        {#if !timeOnly}
          <div class="date-picker__months">
            <Calendar
              value={draft}
              end={draftEnd}
              {range}
              bind:month
              navigation={oneMonth ? 'both' : 'previous'}
              {timeZone}
              on:select={(e) => {
                handleSelect(e.detail)
              }}
              on:range={(e) => {
                handleRange(e.detail)
              }}
            />
            {#if !oneMonth}
              <Calendar
                value={draft}
                end={draftEnd}
                {range}
                month={secondMonth}
                navigation="next"
                {timeZone}
                on:select={(e) => {
                  handleSelect(e.detail)
                }}
                on:range={(e) => {
                  handleRange(e.detail)
                }}
                on:navigate={(e) => {
                  month = addMonths(e.detail, -1)
                }}
              />
            {/if}
          </div>
        {/if}
      </div>
      <div class="date-picker__footer">
        <Button kind="brand" size="medium" label={ui.string.Save} on:click={save} />
      </div>
    </div>
  </div>
{/if}

<style lang="scss">
  .date-picker {
    display: flex;
    width: max-content;
    min-height: 0;
    max-width: calc(100vw - 2rem);
    max-height: calc(100vh - 2rem);
    border: 1px solid var(--theme-popup-divider);
    border-radius: var(--medium-BorderRadius);
    background-color: var(--theme-popup-color);
    box-shadow: var(--global-popover-ShadowX) var(--global-popover-ShadowY) var(--global-popover-ShadowBlur)
      var(--global-popover-ShadowSpread) var(--global-popover-ShadowColor);
    font-family: var(--font-family);
    color: var(--global-primary-TextColor);

    &--compact {
      padding: var(--spacing-2);
    }

    // A list of choices, not actions: rows of the column width in the value weight.
    &__shifts {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      flex-shrink: 0;
      gap: var(--spacing-0_25);
      min-width: 11rem;
      padding: var(--spacing-1);
      overflow-y: auto;
      border-right: 1px solid var(--theme-popup-divider);
      font-size: 0.875rem;
      font-weight: 400;
      line-height: 1.25rem;
    }
    &__shifts > :global(.button) {
      justify-content: flex-start;
    }
    &__shifts-divider {
      align-self: stretch;
      flex-shrink: 0;
      height: 1px;
      margin: var(--spacing-0_25) 0;
      background-color: var(--theme-popup-divider);
    }

    &__main {
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
    }
    &__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-1);
      padding: var(--spacing-2) var(--spacing-3);
    }
    &__title {
      min-width: 0;
      overflow: hidden;
      font-size: 1rem;
      font-weight: 500;
      line-height: 1.5rem;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    &__content {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-2);
      min-height: 0;
      // The scrolling area clips: room inside it for the focus ring of the inputs, moved up so they stay in place.
      margin-top: -0.25rem;
      padding: 0.25rem var(--spacing-3) var(--spacing-3);
      overflow-y: auto;
    }
    &__detail {
      margin-bottom: calc(-1 * var(--spacing-1));
      font-size: 0.875rem;
      line-height: 1.25rem;
      color: var(--global-secondary-TextColor);
    }
    &__inputs {
      display: flex;
      align-items: center;
      gap: var(--spacing-1);
    }
    &__dash {
      color: var(--global-secondary-TextColor);
    }
    &__months {
      display: flex;
      gap: var(--spacing-4);
    }
    // Pinned to the bottom: a short column (time only) sits next to a taller list of shifts.
    &__footer {
      display: flex;
      justify-content: flex-end;
      margin-top: auto;
      padding: var(--spacing-2) var(--spacing-3);
      border-top: 1px solid var(--theme-popup-divider);
    }
  }
</style>
