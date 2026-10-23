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
  import type { AnySvelteComponent } from '@hcengineering/ui'
  import Icon from '../Icon.svelte'
  import type { IconName } from '../types'

  // A sprite or kit icon name, or an icon component
  export let icon: IconName | AnySvelteComponent
  export let label: string
  export let selected: boolean = false
  export let navigator: boolean = false
  export let notify: boolean = false
  export let size: 'small' | 'medium' | 'large' = 'large'
</script>

<button class="app {size}" class:selected class:navigator title={label}>
  <div class="flex-center icon-container" class:noty={notify}>
    {#if typeof icon === 'string'}
      <Icon name={icon} size={size === 'small' ? 16 : 20} />
    {:else}
      <svelte:component this={icon} size={size === 'small' ? 'small' : 'medium'} />
    {/if}
  </div>
  {#if notify}<div class="marker" />{/if}
</button>

<style lang="scss">
  .app {
    position: relative;
    flex-shrink: 0;
    padding: 0;
    background-color: transparent;
    border: 1px solid transparent;
    border-radius: 0.25rem;
    cursor: pointer;
    outline: none;

    &.large {
      width: 2.25rem;
      height: 2.25rem;
    }
    &.medium {
      width: 2rem;
      height: 2rem;
    }
    &.small,
    &.small .icon-container {
      width: calc(var(--status-bar-normal-height) - 8px);
      height: calc(var(--status-bar-normal-height) - 8px);
      border-radius: 0.25rem;
    }
    &.small.selected {
      background-color: var(--theme-button-pressed);
    }

    .icon-container {
      width: 1.25rem;
      height: 1.25rem;
      color: var(--theme-navpanel-icons-color);
    }

    &:hover .icon-container {
      color: var(--theme-caption-color);
    }

    &.selected {
      background-color: var(--theme-button-pressed);
      .icon-container {
        color: var(--theme-caption-color);
      }
    }
    &.navigator {
      border-color: var(--theme-button-border);
    }
  }

  .marker {
    position: absolute;
    top: 1.1rem;
    right: 0.375rem;
    width: 0.425rem;
    height: 0.425rem;
    border-radius: 50%;
    background-color: var(--highlight-red);
  }
</style>
