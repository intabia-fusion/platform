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
  // Segmented switch: icons or labels
  import Icon from '../Icon.svelte'

  // An item is an icon name or a plain label; 'ns/id' and kit icon names count as icons
  export let items: string[]
  export let selected: string | undefined = undefined

  const isIcon = (item: string): boolean => item.includes('/')
</script>

<div class="kit-switcher">
  {#each items as item}
    <button type="button" class="element" class:selected={item === selected} class:icon={isIcon(item)} title={item}>
      {#if isIcon(item)}<Icon name={item} />{:else}{item}{/if}
    </button>
  {/each}
</div>

<style lang="scss">
  .kit-switcher {
    display: inline-flex;
    flex-shrink: 0;
    gap: 0.25rem;
    border-radius: 0.375rem;
    background-color: var(--theme-button-hovered);
  }
  .element {
    min-width: 2rem;
    height: 2rem;
    padding: 0 0.75rem;
    font: inherit;
    font-size: 0.875rem;
    color: var(--global-secondary-TextColor);
    background: transparent;
    border: none;
    border-radius: 0.375rem;
    cursor: pointer;

    &.icon {
      padding: 0;
      color: var(--content-color);
    }
    &.selected {
      color: var(--global-primary-TextColor);
      background-color: var(--global-ui-active-BackgroundColor);
    }
  }
</style>
