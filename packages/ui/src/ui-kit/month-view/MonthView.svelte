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

  import { day as addDays, firstDay, getCurrentLocale } from '../../components/calendar/internal/DateUtils'
  import { deviceOptionsStore as deviceInfo } from '../../index'
  import { capitalizeFirstLetter } from '../../utils'
  import type { MonthViewEvents, MonthViewProps, MonthViewSlots, MonthViewWeekdayFormat } from './types'

  type $$Props = MonthViewProps
  type $$Events = MonthViewEvents
  type $$Slots = MonthViewSlots

  export let month: number | undefined = undefined
  export let value: number | null | undefined = undefined
  export let weeks: number = 6
  export let rowHeight: string | undefined = undefined
  export let weekdayFormat: MonthViewWeekdayFormat = 'long'

  const dispatch = createEventDispatcher<{ select: number, navigate: number }>()

  let grid: HTMLElement | undefined
  let focusKey: number | undefined = undefined

  $: view = startOfMonth(month ?? value ?? Date.now())
  $: locale = $languageStore === '' ? getCurrentLocale() : $languageStore
  $: gridStart = firstDay(view, $deviceInfo.firstDayOfWeek)
  $: weekDays = [...Array(7).keys()].map((i) => {
    const date = addDays(gridStart, i)
    return {
      name: capitalizeFirstLetter(format(date, locale, { weekday: weekdayFormat })),
      long: capitalizeFirstLetter(format(date, locale, { weekday: 'long' }))
    }
  })
  $: rows = [...Array(weeks).keys()].map((w) => [...Array(7).keys()].map((d) => addDays(gridStart, w * 7 + d)))
  $: todayKey = keyOf(new Date())
  $: valueKey = value === null || value === undefined || Number.isNaN(value) ? undefined : keyOf(new Date(value))
  $: tabKey = pickTabKey(rows, focusKey, valueKey, todayKey, view)

  // A formatter is costly to build and the table asks for one per day.
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

  function isWeekend (date: Date): boolean {
    return date.getDay() === 0 || date.getDay() === 6
  }

  function pickTabKey (
    rows: Date[][],
    focusKey: number | undefined,
    valueKey: number | undefined,
    todayKey: number,
    view: Date
  ): number {
    const shown = new Set(rows.flat().map(keyOf))
    for (const key of [focusKey, valueKey, todayKey]) if (key !== undefined && shown.has(key)) return key
    return keyOf(view)
  }

  function pick (date: Date): void {
    focusKey = keyOf(date)
    value = date.getTime()
    dispatch('select', value)
  }

  function navigate (target: Date): void {
    month = startOfMonth(target.getTime()).getTime()
    dispatch('navigate', month)
  }

  async function moveFocus (date: Date): Promise<void> {
    const shown = rows.flat().some((it) => keyOf(it) === keyOf(date))
    if (!shown) navigate(date)
    focusKey = keyOf(date)
    await tick()
    grid?.querySelector<HTMLButtonElement>(`[data-key="${focusKey}"]`)?.focus()
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
      const target = new Date(date.getFullYear(), date.getMonth() + (event.key === 'PageUp' ? -1 : 1), 1)
      const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
      target.setDate(Math.min(date.getDate(), last))
      navigate(target)
      void moveFocus(target)
    }
  }

  function fullDate (date: Date, locale: string): string {
    return format(date, locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  }
</script>

<div
  bind:this={grid}
  class="month-view"
  role="grid"
  aria-label={$$props['aria-label'] ?? format(view, locale, { month: 'long', year: 'numeric' })}
  style:--_rows={`repeat(${weeks}, ${rowHeight ?? 'minmax(0, 1fr)'})`}
>
  <div class="month-view__header" role="row">
    {#each weekDays as weekDay}
      <span class="month-view__weekday" role="columnheader" aria-label={weekDay.long}>{weekDay.name}</span>
    {/each}
  </div>
  <div class="month-view__body" class:month-view__body--fixed={rowHeight !== undefined}>
    {#each rows as row}
      <div class="month-view__row" role="row">
        {#each row as date}
          {@const key = keyOf(date)}
          {@const today = key === todayKey}
          {@const selected = key === valueKey}
          {@const outside = date.getMonth() !== view.getMonth()}
          <div
            class="month-view__cell"
            class:month-view__cell--weekend={isWeekend(date)}
            role="gridcell"
            aria-selected={selected}
          >
            <button
              type="button"
              class="month-view__day"
              class:month-view__day--today={today}
              class:month-view__day--selected={selected}
              class:month-view__day--outside={outside}
              data-key={key}
              tabindex={key === tabKey ? 0 : -1}
              aria-label={fullDate(date, locale)}
              aria-current={today ? 'date' : undefined}
              on:click={() => {
                pick(date)
              }}
              on:keydown={(event) => {
                handleKeydown(event, date)
              }}
              on:focus={() => {
                focusKey = key
              }}
            >
              {date.getDate()}
            </button>
            {#if $$slots.day}
              <div class="month-view__content"><slot name="day" {date} {today} {selected} {outside} /></div>
            {/if}
          </div>
        {/each}
      </div>
    {/each}
  </div>
</div>

<style lang="scss">
  .month-view {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
    font-family: var(--font-family);
    color: var(--global-primary-TextColor);

    &__header,
    &__row {
      display: grid;
      grid-template-columns: repeat(7, minmax(0, 1fr));
    }
    // The weekday names stay in view when tall rows scroll.
    &__header {
      position: sticky;
      top: 0;
      z-index: 1;
      flex-shrink: 0;
      background-color: var(--theme-comp-header-color);
      border-bottom: 1px solid var(--global-subtle-ui-BorderColor);
    }
    &__weekday {
      overflow: hidden;
      padding: var(--spacing-1);
      font-size: 0.75rem;
      line-height: 1rem;
      text-align: center;
      white-space: nowrap;
      text-overflow: ellipsis;
      color: var(--global-secondary-TextColor);
    }
    // Without a row height the rows share the view; with it the body keeps its size and the view scrolls.
    &__body {
      display: grid;
      flex-grow: 1;
      min-height: 0;
      grid-template-rows: var(--_rows);

      &--fixed {
        flex-shrink: 0;
      }
    }

    &__cell {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: var(--spacing-0_5);
      min-width: 0;
      min-height: 0;
      padding: var(--spacing-0_5);
      border-bottom: 1px solid var(--global-subtle-ui-BorderColor);

      &:not(:first-child) {
        border-left: 1px solid var(--global-subtle-ui-BorderColor);
      }
      // A faint tint of the brand: the weekend columns read at a glance without competing with the events.
      &--weekend {
        background-color: color-mix(in srgb, var(--button-brand-BackgroundColor) 6%, transparent);
      }
    }
    &__content {
      align-self: stretch;
      flex-grow: 1;
      min-height: 0;
      overflow: hidden;
    }

    &__day {
      flex-shrink: 0;
      min-width: 1.5rem;
      height: 1.5rem;
      margin: 0;
      padding: 0 var(--spacing-0_5);
      border: none;
      border-radius: var(--small-BorderRadius);
      background: transparent;
      font: inherit;
      font-size: 0.75rem;
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
      &--outside {
        color: var(--global-tertiary-TextColor);
      }
      &--today {
        font-weight: 500;
        color: var(--button-brand-BackgroundColor);
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
