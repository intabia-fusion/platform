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
  import { languageStore } from '@hcengineering/theme'
  import { createEventDispatcher, tick } from 'svelte'

  import {
    day as addDays,
    firstDay,
    fromCurrentToTz,
    fromTzToCurrent,
    getCurrentLocale
  } from '../../components/calendar/internal/DateUtils'
  import IconChevronLeft from '../../components/icons/ChevronLeft.svelte'
  import IconChevronRight from '../../components/icons/ChevronRight.svelte'
  import { deviceOptionsStore as deviceInfo } from '../../index'
  import ui from '../../plugin'
  import { tooltip as tooltipAction } from '../../tooltips'
  import type { LabelAndProps } from '../../types'
  import { capitalizeFirstLetter } from '../../utils'
  import IconButton from '../button/IconButton.svelte'
  import type { CalendarEvents, CalendarNavigation, CalendarProps, CalendarRange } from './types'

  type $$Props = CalendarProps
  type $$Events = CalendarEvents

  export let value: number | null | undefined = undefined
  export let end: number | null | undefined = undefined
  export let range: boolean = false
  export let month: number | undefined = undefined
  export let navigation: CalendarNavigation = 'both'
  export let timeZone: string | undefined = undefined
  export let showYear: boolean = true
  export let weekends: boolean = false
  export let marked: ((date: Date) => boolean) | undefined = undefined
  export let dayTooltip: ((date: Date) => LabelAndProps | undefined) | undefined = undefined

  const dispatch = createEventDispatcher<{ select: number, range: CalendarRange, navigate: number }>()

  let grid: HTMLElement | undefined
  let focusDay: number | undefined = undefined

  $: view = startOfMonth(month ?? value ?? Date.now())
  $: locale = getLocale($languageStore)
  $: monthName = capitalizeFirstLetter(format(view, locale, { month: 'long' }))
  $: title = showYear ? `${monthName} ${view.getFullYear()}` : monthName
  $: gridStart = firstDay(view, $deviceInfo.firstDayOfWeek)
  $: weekDays = [...Array(7).keys()].map((i) => {
    const date = addDays(gridStart, i)
    return {
      short: capitalizeFirstLetter(format(date, locale, { weekday: 'short' })),
      long: format(date, locale, { weekday: 'long' })
    }
  })
  $: weeks = buildWeeks(view, gridStart)
  $: weekendColumns = [...Array(7).keys()].map((i) => [0, 6].includes(addDays(gridStart, i).getDay()))
  $: todayKey = keyOf(new Date())
  $: startKey = dayKey(value)
  $: endKey = range ? dayKey(end) : undefined
  $: [lowKey, highKey] = order(startKey, endKey)
  $: tabDay = pickTabDay(view, focusDay, startKey, todayKey)

  function getLocale (lang: string): string {
    return lang === '' ? getCurrentLocale() : lang
  }

  // A formatter is costly to build and the grid asks for one per day.
  const formatters = new Map<string, Intl.DateTimeFormat>()
  function format (date: Date, locale: string, options: Intl.DateTimeFormatOptions): string {
    const key = `${locale}|${JSON.stringify(options)}`
    let formatter = formatters.get(key)
    if (formatter === undefined) {
      formatter = new Intl.DateTimeFormat(locale, options)
      formatters.set(key, formatter)
    }
    return formatter.format(date)
  }

  function startOfMonth (ts: number): Date {
    const date = new Date(ts)
    return new Date(date.getFullYear(), date.getMonth(), 1)
  }

  function keyOf (date: Date): number {
    return date.getFullYear() * 10000 + date.getMonth() * 100 + date.getDate()
  }

  function dayKey (ts: number | null | undefined): number | undefined {
    if (ts === null || ts === undefined || Number.isNaN(ts)) return undefined
    return keyOf(timeZone !== undefined ? fromCurrentToTz(ts, timeZone) : new Date(ts))
  }

  function order (a: number | undefined, b: number | undefined): [number | undefined, number | undefined] {
    if (a === undefined || b === undefined) return [a, b]
    return a <= b ? [a, b] : [b, a]
  }

  // Cells of the neighbour months are `null`: they show the day faintly and are not a choice.
  function buildWeeks (view: Date, gridStart: Date): Array<Array<Date | null>> {
    const days: Array<Date | null> = []
    let date = new Date(gridStart)
    while (date.getMonth() !== view.getMonth()) {
      days.push(null)
      date = addDays(date, 1)
    }
    while (date.getMonth() === view.getMonth()) {
      days.push(date)
      date = addDays(date, 1)
    }
    while (days.length % 7 !== 0) days.push(null)
    const result: Array<Array<Date | null>> = []
    for (let i = 0; i < days.length; i += 7) result.push(days.slice(i, i + 7))
    return result
  }

  function pickTabDay (
    view: Date,
    focusDay: number | undefined,
    startKey: number | undefined,
    todayKey: number
  ): number {
    const monthKey = view.getFullYear() * 10000 + view.getMonth() * 100
    // The remembered day may not exist in a shorter month.
    if (focusDay !== undefined) {
      return Math.min(focusDay, new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate())
    }
    if (startKey !== undefined && startKey - (startKey % 100) === monthKey) return startKey % 100
    if (todayKey - (todayKey % 100) === monthKey) return todayKey % 100
    return 1
  }

  // The day and the kept time are those seen in `timeZone`, as the grid shows them.
  function withTimeOf (date: Date, source: number | null | undefined): number {
    const result = new Date(date)
    if (source !== null && source !== undefined && !Number.isNaN(source)) {
      const time = timeZone !== undefined ? fromCurrentToTz(source, timeZone) : new Date(source)
      result.setHours(time.getHours(), time.getMinutes(), 0, 0)
    }
    return (timeZone !== undefined ? fromTzToCurrent(result, timeZone) : result).getTime()
  }

  function pick (date: Date): void {
    focusDay = date.getDate()
    const ts = withTimeOf(date, value)
    if (range) {
      if (value === null || value === undefined || (end !== null && end !== undefined)) {
        value = ts
        end = null
      } else if (keyOf(date) < (startKey ?? 0)) {
        end = value
        value = ts
      } else {
        end = withTimeOf(date, end ?? value)
      }
      dispatch('select', ts)
      dispatch('range', { start: value, end: end ?? null })
    } else {
      value = ts
      dispatch('select', ts)
    }
  }

  function navigate (delta: number): void {
    // From the props, not from `view`: two clicks before a re-render still move two months.
    const current = startOfMonth(month ?? value ?? Date.now())
    const next = new Date(current.getFullYear(), current.getMonth() + delta, 1)
    month = next.getTime()
    dispatch('navigate', month)
  }

  async function moveFocus (date: Date): Promise<void> {
    if (date.getMonth() !== view.getMonth() || date.getFullYear() !== view.getFullYear()) {
      if (navigation === 'none') return
      navigate((date.getFullYear() - view.getFullYear()) * 12 + date.getMonth() - view.getMonth())
    }
    focusDay = date.getDate()
    await tick()
    grid?.querySelector<HTMLButtonElement>(`[data-day="${focusDay}"]`)?.focus()
  }

  function handleKeydown (event: KeyboardEvent, date: Date): void {
    const weekday = (date.getDay() - $deviceInfo.firstDayOfWeek + 7) % 7
    const shifts: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
      Home: -weekday,
      End: 6 - weekday
    }
    if (event.key in shifts) {
      event.preventDefault()
      void moveFocus(addDays(date, shifts[event.key]))
    } else if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault()
      const target = new Date(date)
      target.setDate(1)
      target.setMonth(target.getMonth() + (event.key === 'PageUp' ? -1 : 1))
      const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
      target.setDate(Math.min(date.getDate(), last))
      void moveFocus(target)
    }
  }

  function fullDate (date: Date, locale: string): string {
    return format(date, locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  }
</script>

<div class="calendar" class:calendar--weekends={weekends}>
  <div class="calendar__header">
    <span class="calendar__title">{title}</span>
    <slot name="header" />
    {#if navigation !== 'none'}
      <span class="calendar__navigation">
        {#if navigation !== 'next'}
          <IconButton
            kind="ghost"
            size="extra-small"
            icon={IconChevronLeft}
            tooltip={{ label: ui.string.PreviousMonth }}
            on:click={() => {
              navigate(-1)
            }}
          />
        {/if}
        {#if navigation !== 'previous'}
          <IconButton
            kind="ghost"
            size="extra-small"
            icon={IconChevronRight}
            tooltip={{ label: ui.string.NextMonth }}
            on:click={() => {
              navigate(1)
            }}
          />
        {/if}
      </span>
    {/if}
  </div>
  <div bind:this={grid} class="calendar__grid" role="grid" aria-label={$$props['aria-label'] ?? title}>
    <div class="calendar__row" role="row">
      {#each weekDays as weekDay}
        <span class="calendar__weekday" role="columnheader" aria-label={weekDay.long}>{weekDay.short}</span>
      {/each}
    </div>
    {#each weeks as week, row}
      <div class="calendar__row" role="row">
        {#each week as date, column}
          {#if date === null}
            <span
              class="calendar__cell calendar__outside"
              class:calendar__weekend={weekends && weekendColumns[column]}
              role="gridcell"
              aria-hidden="true"
            >
              {addDays(gridStart, row * 7 + column).getDate()}
            </span>
          {:else}
            {@const key = keyOf(date)}
            {@const isEnd = key === lowKey || key === highKey}
            {@const inside = lowKey !== undefined && highKey !== undefined && key > lowKey && key < highKey}
            <span
              class="calendar__cell"
              class:calendar__weekend={weekends && weekendColumns[column]}
              class:calendar__cell--range={inside}
              class:calendar__cell--range-start={highKey !== undefined && key === lowKey && lowKey !== highKey}
              class:calendar__cell--range-end={lowKey !== undefined && key === highKey && lowKey !== highKey}
              role="gridcell"
              aria-selected={isEnd || inside}
            >
              <button
                type="button"
                class="calendar__day"
                class:calendar__day--today={key === todayKey}
                class:calendar__day--selected={isEnd}
                class:calendar__day--inside={inside}
                class:calendar__day--marked={marked?.(date) === true}
                data-day={date.getDate()}
                tabindex={date.getDate() === tabDay ? 0 : -1}
                aria-label={fullDate(date, locale)}
                aria-current={key === todayKey ? 'date' : undefined}
                use:tooltipAction={dayTooltip?.(date)}
                on:click|stopPropagation={() => {
                  pick(date)
                }}
                on:keydown={(event) => {
                  handleKeydown(event, date)
                }}
                on:focus={() => {
                  focusDay = date.getDate()
                }}
              >
                {date.getDate()}
              </button>
            </span>
          {/if}
        {/each}
      </div>
    {/each}
  </div>
</div>

<style lang="scss">
  .calendar {
    // A light tint of the brand: the picked days were brand-filled in the legacy calendars.
    --_band: color-mix(in srgb, var(--button-brand-BackgroundColor) 14%, transparent);

    display: inline-flex;
    flex-direction: column;
    gap: var(--spacing-1);
    min-width: 0;
    font-family: var(--font-family);
    color: var(--global-primary-TextColor);

    &__header {
      display: flex;
      align-items: center;
      gap: var(--spacing-1);
      min-height: var(--global-extra-small-Size);
    }
    &__title {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      font-size: 0.875rem;
      font-weight: 500;
      line-height: 1.25rem;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    &__navigation {
      display: flex;
      flex-shrink: 0;
      gap: var(--spacing-0_5);
    }

    &__grid {
      display: grid;
      grid-template-columns: repeat(7, 2rem);
      row-gap: var(--spacing-0_25);
    }
    // Weekend columns are tinted through the weeks, so the rows close up to keep the column whole.
    &--weekends &__grid {
      row-gap: 0;
    }
    &__outside {
      align-items: center;
      justify-content: center;
      font-size: 0.875rem;
      font-variant-numeric: tabular-nums;
      color: var(--global-tertiary-TextColor);
      user-select: none;
    }
    &__weekend {
      background-color: color-mix(in srgb, var(--button-brand-BackgroundColor) 6%, transparent);
    }
    &__row {
      display: contents;
    }
    &__weekday {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 2rem;
      font-size: 0.75rem;
      line-height: 1rem;
      color: var(--global-secondary-TextColor);
    }

    &__cell {
      display: flex;
      height: 2rem;

      &--range {
        background-color: var(--_band);
      }
      // The band runs under the round ends, so the range reads as one piece.
      &--range-start {
        background: linear-gradient(to right, transparent 50%, var(--_band) 50%);
      }
      &--range-end {
        background: linear-gradient(to left, transparent 50%, var(--_band) 50%);
      }
    }

    &__day {
      flex: 1 1 auto;
      margin: 0;
      padding: 0;
      border: none;
      border-radius: var(--small-BorderRadius);
      background: transparent;
      font: inherit;
      font-size: 0.875rem;
      font-variant-numeric: tabular-nums;
      color: inherit;
      cursor: pointer;

      &:hover {
        background-color: var(--button-tertiary-hover-BackgroundColor);
      }
      &:focus-visible {
        position: relative;
        outline: 2px solid var(--global-focus-BorderColor);
        outline-offset: 2px;
      }
      &--today {
        font-weight: 500;
        color: var(--button-brand-BackgroundColor);
      }
      &--inside:hover {
        background-color: var(--_band);
      }
      // A primary dot under the number: the day has something (events), apart from the brand of today and the pick.
      &--marked {
        position: relative;

        &::after {
          content: '';
          position: absolute;
          bottom: 0.125rem;
          left: 50%;
          width: 0.25rem;
          height: 0.25rem;
          border-radius: 50%;
          background-color: var(--kit-button-primary-BackgroundColor);
          transform: translateX(-50%);
        }
      }
      &--marked.calendar__day--selected::after {
        background-color: currentColor;
      }
      &--selected,
      &--selected:hover {
        font-weight: 500;
        color: var(--button-accent-LabelColor);
        background-color: var(--button-brand-BackgroundColor);
      }
    }
  }
</style>
