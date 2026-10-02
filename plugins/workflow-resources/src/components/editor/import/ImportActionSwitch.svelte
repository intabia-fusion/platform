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
  import type { IntlString } from '@hcengineering/platform'
  import { Label } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'

  type ActionId = $$Generic<string>

  export let items: Array<{ id: ActionId, label: IntlString }>
  export let selected: ActionId

  const dispatch = createEventDispatcher<{ select: ActionId }>()
</script>

<div class="import-action-switch">
  {#each items as item (item.id)}
    <button
      type="button"
      class="action-btn"
      class:selected={item.id === selected}
      on:click={() => {
        if (item.id !== selected) dispatch('select', item.id)
      }}
    >
      <!-- The hidden bold copy reserves the selected width, so switching does not shift the buttons -->
      <span class="action-label"><Label label={item.label} /></span>
      <span class="action-label bold" aria-hidden="true"><Label label={item.label} /></span>
    </button>
  {/each}
</div>

<style lang="scss">
  .import-action-switch {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    padding: 3px;
    gap: 2px;
    border-radius: 0.5rem;
    border: 1px solid var(--theme-divider-color);
    background-color: var(--theme-bg-color);
  }

  .action-btn {
    display: inline-grid;
    padding: 0.25rem 0.625rem;
    border: none;
    border-radius: 0.375rem;
    background: transparent;
    font-family: var(--font-family);
    font-size: 0.75rem;
    font-weight: 500;
    line-height: 1rem;
    white-space: nowrap;
    color: var(--theme-dark-color);
    cursor: pointer;
    transition:
      color 0.15s ease,
      background-color 0.15s ease,
      box-shadow 0.15s ease;

    &:hover:not(.selected) {
      color: var(--theme-content-color);
      background-color: var(--theme-button-hovered);
    }

    &.selected {
      color: var(--primary-color-purple-02);
      font-weight: 600;
      background-color: var(--theme-popup-color);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    }
  }

  .action-label {
    grid-area: 1 / 1;
    text-align: center;

    &.bold {
      font-weight: 600;
      visibility: hidden;
    }
  }
</style>
