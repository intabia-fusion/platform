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
  import { createEventDispatcher } from 'svelte'

  import type { LabelAndProps } from '../../types'
  import Calendar from '../calendar/Calendar.svelte'
  import type { YearViewEvents, YearViewProps } from './types'

  type $$Props = YearViewProps
  type $$Events = YearViewEvents

  export let year: number | undefined = undefined
  export let value: number | null | undefined = undefined
  export let marked: ((date: Date) => boolean) | undefined = undefined
  export let dayTooltip: ((date: Date) => LabelAndProps | undefined) | undefined = undefined

  const dispatch = createEventDispatcher<{ select: number }>()

  $: shownYear = new Date(year ?? value ?? Date.now()).getFullYear()
  $: months = [...Array(12).keys()].map((m) => new Date(shownYear, m, 1).getTime())
</script>

<div class="year-view" role="group" aria-label={$$props['aria-label'] ?? String(shownYear)}>
  {#each months as month (month)}
    <div class="year-view__month">
      <Calendar
        {month}
        {value}
        {marked}
        {dayTooltip}
        navigation="none"
        showYear={false}
        weekends
        on:select={(event) => {
          value = event.detail
          dispatch('select', event.detail)
        }}
      />
    </div>
  {/each}
</div>

<style lang="scss">
  // Fills the place and scrolls itself: a year is taller than the view.
  .year-view {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
    align-content: start;
    gap: var(--spacing-3) var(--spacing-2);
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    padding: var(--spacing-2);
    overflow-y: auto;

    &__month {
      display: flex;
      justify-content: center;
    }
  }
</style>
