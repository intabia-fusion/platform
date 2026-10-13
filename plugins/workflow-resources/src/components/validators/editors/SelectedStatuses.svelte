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
  import type { DropdownTextItem } from '@hcengineering/ui'
  import { Icon } from '@hcengineering/ui'

  export let items: DropdownTextItem[]
  export let prefix: DropdownTextItem | undefined = undefined
</script>

<span class="selected-statuses">
  {#if prefix}
    <span class="selected-statuses--item selected-statuses--prefix">
      {#if prefix.icon}
        <Icon icon={prefix.icon} size="small" iconProps={prefix.iconProps} />
      {/if}
      <span>{prefix.label}</span>
    </span>
  {/if}
  <span class="selected-statuses--values">
    {#each items as item (item.id)}
      <span class="selected-statuses--item">
        {#if item.icon}
          <Icon icon={item.icon} size="small" iconProps={item.iconProps} />
        {/if}
        <span>{item.label}</span>
      </span>
    {/each}
  </span>
</span>

<style lang="scss">
  .selected-statuses {
    display: inline-flex;
    align-items: flex-start;
    gap: 0.75rem;
    min-width: 0;
    max-width: 100%;

    &--prefix {
      flex-shrink: 0;
    }

    &--values {
      display: inline-flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.25rem 1rem;
      min-width: 0;
    }

    &--item {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      min-width: 0;
    }
  }
</style>
