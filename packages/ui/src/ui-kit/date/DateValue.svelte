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
  import type { DateRangeMode } from '@hcengineering/core'

  import { formatDateParts } from './format'

  export let value: number
  export let mode: DateRangeMode

  // A space Svelte keeps: a whitespace-only text node in the markup is dropped.
  const space = ' '

  $: parts = formatDateParts(value, mode)
</script>

<!-- The divider holds a space: the text reads and copies as "date time". -->
<span class="date-value"
  >{#if parts.date !== undefined}<span class="date-value__part">{parts.date}</span
    >{/if}{#if parts.date !== undefined && parts.time !== undefined}<span class="date-value__divider">{space}</span
    >{/if}{#if parts.time !== undefined}<span class="date-value__part">{parts.time}</span>{/if}</span
>

<style lang="scss">
  .date-value {
    display: inline-flex;
    align-items: center;
    min-width: 0;
    white-space: nowrap;

    &__part {
      overflow: hidden;
      text-overflow: ellipsis;
    }
    &__part + &__divider + &__part {
      flex-shrink: 0;
    }
    // A thin rule between the date and the time, as in the legacy date presenter.
    &__divider {
      flex-shrink: 0;
      margin: 0 var(--spacing-0_5);
      width: 1px;
      height: 0.75rem;
      overflow: hidden;
      font-size: 0;
      background-color: var(--theme-divider-color);
    }
  }
</style>
