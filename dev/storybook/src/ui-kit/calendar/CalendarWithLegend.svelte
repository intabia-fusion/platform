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
  import { Calendar } from '@hcengineering/ui/kit'

  export let value: number | null = null
  export let month: number | undefined = undefined
</script>

<!-- The planner sidebar: a legend in the header slot, the padding is the place's. -->
<div class="calendar-legend">
  <Calendar bind:value {month}>
    <div slot="header" class="calendar-legend__items">
      <span class="calendar-legend__item"><span class="calendar-legend__dot calendar-legend__dot--due" />Due date</span>
      <span class="calendar-legend__item"><span class="calendar-legend__dot" />Scheduled</span>
    </div>
  </Calendar>
</div>

<style lang="scss">
  .calendar-legend {
    display: inline-flex;
    padding: var(--spacing-1) var(--spacing-1_5) var(--spacing-1_5);
    border: 1px solid var(--theme-divider-color);
    border-radius: var(--medium-BorderRadius);

    &__items {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-0_25);
      padding: 0 var(--spacing-0_5);
      font-size: 0.75rem;
      line-height: 1rem;
      white-space: nowrap;
      color: var(--global-secondary-TextColor);
    }
    &__item {
      display: flex;
      align-items: center;
      gap: var(--spacing-0_5);
    }
    &__dot {
      width: 0.375rem;
      height: 0.375rem;
      border-radius: 50%;
      background-color: var(--kit-button-primary-BackgroundColor);

      &--due {
        background-color: var(--button-negative-BackgroundColor);
      }
    }
  }
</style>
