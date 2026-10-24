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
  import Icon from '../Icon.svelte'
  import type { MenuEntry } from '../types'

  export let items: MenuEntry[]
  export let width: number = 260
</script>

<div class="kit-menu" style:width="{width}px">
  {#each items as item}
    {#if item.divider === true}
      <div class="divider" />
    {:else if item.header !== undefined}
      <div class="header">{item.header}</div>
    {:else}
      <div class="item" class:hover={item.hover} class:accent={item.accent}>
        {#if item.icon !== undefined}<Icon name={item.icon} />{/if}
        <span class="label">{item.label}</span>
        {#if item.hint !== undefined}<span class="hint">{item.hint}</span>{/if}
        {#if item.selected === true}<Icon name="tick" color="var(--theme-popup-checkicon)" />{/if}
      </div>
    {/if}
  {/each}
</div>

<style lang="scss">
  .kit-menu {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    padding: 0.375rem;
    box-sizing: border-box;
    background-color: var(--theme-popup-color);
    border: 1px solid var(--theme-popup-divider);
    border-radius: 0.5rem;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  }
  .divider {
    height: 1px;
    margin: 0.125rem 0;
    background-color: var(--theme-divider-color);
  }
  .header {
    padding: 0.25rem 0.5rem;
    font-size: 0.6875rem;
    font-weight: 500;
    text-transform: uppercase;
    color: var(--theme-darker-color);
  }
  .item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    height: 2rem;
    padding: 0 0.5rem;
    border-radius: 0.25rem;
    color: var(--theme-dark-color);

    .label {
      flex: 1;
      color: var(--theme-caption-color);
    }
    .hint {
      font-size: 0.75rem;
      color: var(--theme-darker-color);
    }
    &.hover {
      background-color: var(--theme-popup-hover);
    }
    &.accent .label {
      color: var(--primary-button-default);
    }
  }
</style>
