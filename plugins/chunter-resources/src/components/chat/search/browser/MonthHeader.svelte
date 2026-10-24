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
  import type { Timestamp } from '@hcengineering/core'
  import { themeStore } from '@hcengineering/ui'

  import { formatMonth } from '../../../../search/browser'

  /** Absent when the rows are ranked rather than dated. */
  export let month: Timestamp | undefined

  $: label = month != null ? formatMonth(month, $themeStore.language) : undefined
</script>

{#if label != null}
  <!-- A heading, so a screen reader can jump between months. -->
  <h3 class="month">
    {label.name}{#if label.year != null}<span class="year">{label.year}</span>{/if}
  </h3>
{/if}

<style lang="scss">
  .month {
    display: flex;
    align-items: baseline;
    gap: 0.375rem;
    margin: 0;
    padding: 1.25rem 0 0.75rem;
    font-size: 1rem;
    font-weight: 600;
    line-height: 1.25rem;
    color: var(--theme-caption-color);
  }

  .year {
    font-weight: 500;
    color: var(--theme-dark-color);
  }
</style>
