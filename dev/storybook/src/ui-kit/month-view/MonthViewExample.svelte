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
  import { MonthView, type MonthViewProps } from '@hcengineering/ui/kit'

  export let props: MonthViewProps = {}
  /** Events in the days, as the calendar app draws them under the number. */
  export let withEvents: boolean = true
  export let height: string = '44rem'

  const events: Record<number, string[]> = {
    2: ['Planning'],
    7: ['Design review', 'Lunch'],
    15: ['Release 1.4', 'Retro', 'Demo', '1:1'],
    22: ['Offsite']
  }
  // Rows that share the view are lower than fixed ones: the sample shows as many events as fit, then "+N".
  $: shown = props.rowHeight !== undefined ? 3 : 2
  let value = new Date(2026, 9, 15).getTime()
  let month = value
</script>

<div class="month-view-example" style:height>
  <MonthView {...props} bind:value bind:month>
    <svelte:fragment slot="day" let:date let:outside>
      {#if withEvents && !outside}
        {#each (events[date.getDate()] ?? []).slice(0, shown) as title}
          <div class="month-view-example__event">{title}</div>
        {/each}
        {#if (events[date.getDate()] ?? []).length > shown}
          <div class="month-view-example__more">+{(events[date.getDate()] ?? []).length - shown}</div>
        {/if}
      {/if}
    </svelte:fragment>
  </MonthView>
</div>

<style lang="scss">
  .month-view-example {
    width: 56rem;
    max-width: 100%;
    background-color: var(--theme-panel-color);
    border: 1px solid var(--global-subtle-ui-BorderColor);
    border-radius: var(--small-BorderRadius);
    overflow: hidden;

    &__event {
      margin-bottom: var(--spacing-0_25);
      padding: 0 var(--spacing-0_5);
      overflow: hidden;
      font-size: 0.75rem;
      line-height: 1.25rem;
      white-space: nowrap;
      text-overflow: ellipsis;
      border-radius: var(--extra-small-BorderRadius);
      background-color: color-mix(in srgb, var(--button-brand-BackgroundColor) 14%, transparent);
    }
    &__more {
      font-size: 0.75rem;
      color: var(--global-secondary-TextColor);
    }
  }
</style>
