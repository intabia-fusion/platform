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
  import type { Board } from '@hcengineering/tracker'
  import { createEventDispatcher } from 'svelte'

  export let board: Board
  export let active: ReadonlySet<string>

  const dispatch = createEventDispatcher<{ toggle: string }>()
</script>

{#if board.quickFilters.length > 0}
  <div class="quick-filters" data-id="boardQuickFilters">
    <div class="divider" />
    {#each board.quickFilters as filter (filter.id)}
      <button
        type="button"
        class="quick-filter"
        class:on={active.has(filter.id)}
        aria-pressed={active.has(filter.id)}
        data-id="boardQuickFilter"
        on:click={() => {
          dispatch('toggle', filter.id)
        }}
      >
        {filter.title}
      </button>
    {/each}
  </div>
{/if}

<style lang="scss">
  .quick-filters {
    display: flex;
    align-items: center;
    gap: var(--spacing-1);
  }
  .divider {
    flex-shrink: 0;
    width: 1px;
    height: 1.25rem;
    background-color: var(--theme-divider-color);
  }
  // The kit has no toggle pill: a chip-sized button that takes the accent when on
  .quick-filter {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    height: 1.75rem;
    padding: 0 0.625rem;
    font: inherit;
    font-size: 0.8125rem;
    white-space: nowrap;
    color: var(--theme-content-color);
    background-color: transparent;
    border: 1px solid var(--theme-button-border);
    border-radius: 0.875rem;
    cursor: pointer;

    &:hover {
      background-color: var(--global-ui-hover-BackgroundColor);
    }
    &:focus-visible {
      outline: 0.125rem solid var(--global-focus-BorderColor);
      outline-offset: 0.125rem;
    }
    &.on {
      color: var(--primary-button-default);
      background-color: color-mix(in srgb, var(--primary-button-default) 10%, transparent);
      border-color: var(--primary-button-default);
    }
  }
</style>
