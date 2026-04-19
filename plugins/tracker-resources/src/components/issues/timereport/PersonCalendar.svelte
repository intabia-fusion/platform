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
  import contact, { Person } from '@hcengineering/contact'
  import { PersonPresenter } from '@hcengineering/contact-resources'
  import { Ref } from '@hcengineering/core'
  import {
    Label,
    Scroller,
    areDatesEqual,
    daysInMonth,
    deviceOptionsStore as deviceInfo,
    day as getDay,
    getWeekDayName,
    isWeekend,
    resizeObserver
  } from '@hcengineering/ui'

  export let headerHeightRem = 4.375
  export let minColWidthRem = 2.5
  export let rowHeightRem = 8

  export let currentDate: Date = new Date()
  export let startDate: Date
  export let maxDays: number = 33
  export let persons: (Ref<Person> | null)[]
  export let multipler = 1
  export let highlightToday = true
  // 'end' - legacy mode, days go backward from currentDate; 'start' - days go forward from startDate
  export let anchor: 'end' | 'start' = 'end'
  // When true, renders person info next to the name instead of below it.
  export let personInfoInline = false

  const todayDate = new Date()

  function getColumnWidth (gridWidth: number, currentDate: Date, maxDays: number): number {
    const width = gridWidth / Math.min(daysInMonth(currentDate), maxDays)
    return Math.max(width, minColWidthRem)
  }

  export function getCellStyle (): string {
    return `width: ${columnWidthRem}rem;`
  }

  export function getRowStyle (): string {
    return `height: ${rowHeightRem}rem;`
  }

  export function getHeaderStyle (): string {
    return `height: ${headerHeightRem}rem;`
  }

  let headerWidth: number
  $: headerWidthRem = headerWidth / $deviceInfo.fontSize

  let containerWidth: number = window.outerWidth
  $: containerWidthRem = containerWidth / $deviceInfo.fontSize

  // For 'end' anchor: days go backward from currentDate. For 'start' anchor: days go forward from startDate.
  $: values =
    anchor === 'start'
      ? Array.from(Array(maxDays).keys())
      : [
          ...Array.from(Array(maxDays - 1).keys())
            .reverse()
            .map((it) => currentDate.getDate() - (it + 1)),
          currentDate.getDate()
        ]

  $: columnWidthRem = getColumnWidth(containerWidthRem - headerWidthRem, currentDate, maxDays) * multipler

  function resolveDay (value: number): Date {
    return anchor === 'start' ? getDay(startDate, value) : getDay(startDate, value - currentDate.getDate())
  }

  $: leftDay = (values ?? []).length > 0 ? resolveDay(values[0]) : startDate
  $: rightDay = (values ?? []).length > 0 ? resolveDay(values[values.length - 1]) : startDate
</script>

<Scroller horizontal fade={{ multipler: { top: headerHeightRem, left: headerWidthRem } }} noFade>
  <div
    use:resizeObserver={(evt) => {
      const parent = evt.parentElement
      containerWidth = parent != null ? parent.clientWidth : evt.clientWidth
    }}
    class="timeline"
  >
    {#key [containerWidthRem, columnWidthRem, headerWidthRem]}
      <!-- Resource Header -->
      <div
        use:resizeObserver={(evt) => {
          headerWidth = evt.clientWidth
        }}
        class="timeline-header timeline-resource-header"
      >
        <div class="timeline-row" style={getHeaderStyle()}>
          <div class="timeline-resource-cell flex-row-center">
            <!-- <div class="timeline-resource-header__title">----</div> -->
            <div class="timeline-resource-header__subtitle">
              <Label label={contact.string.NumberMembers} params={{ count: persons.length }} />
            </div>
          </div>
        </div>
      </div>

      <!-- Resource Content -->
      <div class="timeline-resource-content">
        {#each persons as person}
          <div class="timeline-row" style={getRowStyle()}>
            <div class="timeline-resource-cell flex-row-center" class:compact={personInfoInline}>
              <div class="flex {personInfoInline ? 'flex-row-center gap-2' : 'flex-col'}">
                {#if person != null}
                  <PersonPresenter value={person} />
                {:else}
                  *
                {/if}
                <slot name="person-info" {person} {leftDay} {rightDay} />
              </div>
            </div>
          </div>
        {/each}
      </div>

      <!-- Grid Header -->
      <div class="timeline-header timeline-grid-header">
        <div class="timeline-row flex" style={getHeaderStyle()}>
          {#each values as value}
            {@const day = resolveDay(value)}
            {@const today = areDatesEqual(todayDate, day)}
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <div class="flex-col">
              <div class="timeline-cell timeline-day-header flex-col-center justify-center" style={getCellStyle()}>
                {#if maxDays > 1}
                  <div
                    class="timeline-day-header__day flex-col-center justify-center"
                    class:timeline-day-header__day--today={today}
                  >
                    {day.getDate()}
                  </div>
                  <div class="timeline-day-header__weekday">{getWeekDayName(day, 'short')}</div>
                {/if}
                <slot name="day-header" {day} width={columnWidthRem} />
              </div>
            </div>
          {/each}
        </div>
      </div>

      <!-- Grid Content -->
      <div class="timeline-grid-content timeline-grid-bg">
        {#each persons as person}
          <div class="timeline-row flex" style={getRowStyle()}>
            <div class="timeline-events" />

            {#each values as value, i}
              {@const day = resolveDay(value)}
              {@const today = areDatesEqual(todayDate, day)}
              {@const weekend = isWeekend(day)}
              <!-- svelte-ignore a11y-click-events-have-key-events -->
              <div
                class="timeline-cell"
                class:timeline-cell--today={today}
                class:timeline-cell--weekend={weekend}
                style={getCellStyle()}
              >
                <div class:timeline-cell-today-marker={today && highlightToday}>
                  <slot name="day" {day} {today} {weekend} {person} height={rowHeightRem} width={columnWidthRem} />
                </div>
              </div>
            {/each}
          </div>
        {/each}
      </div>
    {/key}
  </div>
</Scroller>

<style lang="scss">
  $timeline-header-height: 4.5rem;
  $timeline-column-width: 2rem;

  $timeline-bg-color: var(--theme-comp-header-color);
  $timeline-border-color: var(--theme-bg-divider-color);
  $timeline-border: 1px solid $timeline-border-color;
  $timeline-weekend-stroke-color: var(--theme-calendar-weekend-stroke-color);

  .timeline {
    width: max-content;
    min-width: 100%;
    display: grid;
    grid-auto-flow: column;
    grid-template-columns: auto auto;
    grid-template-rows: auto 1fr;
  }

  .timeline-header {
    background-color: $timeline-bg-color;
  }

  .timeline-header {
    position: sticky;
    top: 0;
    z-index: 1;

    &.timeline-resource-header {
      left: 0;
      z-index: 2;
    }
  }

  .timeline-resource-header__title {
    white-space: nowrap;
    font-size: 0.875rem;
    font-weight: 500;
  }

  .timeline-resource-header__subtitle {
    white-space: nowrap;
    font-size: 0.6875rem;
    font-weight: 400;
    line-height: 1.25rem;
    opacity: 0.4;
  }

  .timeline-resource-content {
    background-color: $timeline-bg-color;

    position: sticky;
    left: 0;
    z-index: 1;
  }

  .timeline-day-header {
    cursor: pointer;

    .timeline-day-header__day {
      width: 1.3125rem;
      height: 1.3125rem;
      font-size: 0.8125rem;
      font-weight: 500;

      &.timeline-day-header__day--today {
        color: white;
        background-color: #3871e0;
        border-radius: 0.375rem;
      }
    }

    .timeline-day-header__weekday {
      font-size: 0.6875rem;
      font-weight: 400;
      line-height: 1.25rem;
      opacity: 0.4;
    }
  }

  .timeline-grid-bg {
    background-image: linear-gradient(
      135deg,
      $timeline-weekend-stroke-color 10%,
      $timeline-bg-color 10%,
      $timeline-bg-color 50%,
      $timeline-weekend-stroke-color 50%,
      $timeline-weekend-stroke-color 60%,
      $timeline-bg-color 60%,
      $timeline-bg-color 100%
    );
    background-size: 7px 7px;
  }

  .timeline-row {
    position: relative;
    border-bottom: $timeline-border;
  }

  .timeline-events {
    position: absolute;
    width: 100%;
    top: 1em;
    bottom: 1em;
    pointer-events: none;
  }

  .timeline-cell {
    border-right: $timeline-border;

    width: $timeline-column-width;
    height: 100%;

    &:not(.timeline-cell--weekend, .timeline-cell--holiday) {
      background-color: $timeline-bg-color;
    }

    &.timeline-cell--holiday {
      background-color: transparent;
    }

    &.timeline-cell--weekend {
      background-color: transparent;
    }

    &.timeline-cell--today {
      background-color: $timeline-bg-color;
    }

    .timeline-cell-today-marker {
      width: 100%;
      height: 100%;
      background-color: var(--theme-calendar-today-bgcolor);
    }
  }

  .timeline-resource-cell {
    border-right: $timeline-border;

    width: 100%;
    height: 100%;
    padding: 1rem 2rem;

    &.compact {
      padding: 0.25rem 0.75rem;
    }
  }

  .timeline-event-wrapper {
    position: absolute;
    height: 1.5rem;
    padding-left: 0.125rem;
    padding-right: 0.125rem;

    pointer-events: all;
  }
</style>
