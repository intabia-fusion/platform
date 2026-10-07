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
// See the License for the specific language governing permissions and
// limitations under the License.
-->
<script lang="ts">
  import type { Asset, IntlString } from '@hcengineering/platform'
  import { Icon, IconOpenedArrow, Label } from '@hcengineering/ui'

  import type { UsedInItem } from '../types'

  export let headerLabel: IntlString
  export let icon: Asset
  export let items: UsedInItem[] = []
</script>

{#if items.length > 0}
  <div class="used-in-list">
    <div class="used-in-list--header">
      <Label label={headerLabel} />
    </div>
    <div class="used-in-list--list">
      {#each items as item (item.id)}
        <button type="button" class="used-in-list--item" title={item.name} on:click|stopPropagation={item.onClick}>
          <span class="used-in-list--icon-box">
            <Icon {icon} size="small" />
          </span>
          <span class="used-in-list--text">
            <span class="used-in-list--name">{item.name}</span>
            {#if item.details !== undefined}
              <span class="used-in-list--details">{item.details}</span>
            {/if}
          </span>
          <span class="used-in-list--arrow">
            <Icon icon={IconOpenedArrow} size="x-small" />
          </span>
        </button>
      {/each}
    </div>
  </div>
{/if}

<style lang="scss">
  .used-in-list {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
    width: 100%;
    margin-top: 0.5rem;

    &--header {
      font-size: 0.8125rem;
      font-weight: 500;
      color: var(--global-secondary-TextColor);
      text-align: left;
    }

    &--list {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
      width: 100%;
    }

    &--item {
      display: flex;
      align-items: center;
      gap: 0.625rem;
      width: 100%;
      padding: 0.5rem 0.625rem;
      border: 1px solid var(--global-subtle-ui-BorderColor);
      border-radius: var(--medium-BorderRadius);
      background-color: var(--global-ui-highlight-BackgroundColor);
      cursor: pointer;
      text-align: left;
      box-sizing: border-box;
      transition:
        background-color 0.15s ease,
        border-color 0.15s ease;

      &:hover {
        background-color: var(--global-ui-active-BackgroundColor);
        border-color: var(--global-subtle-ui-BorderColor);

        .used-in-list--arrow {
          opacity: 1;
          transform: translateX(2px);
        }
      }
    }

    &--icon-box {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 1.5rem;
      height: 1.5rem;
      border-radius: var(--extra-small-BorderRadius);
      background-color: var(--global-subtle-ui-BorderColor);
      color: var(--global-primary-TextColor);
      flex-shrink: 0;
    }

    &--text {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
    }

    &--name,
    &--details {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    &--name {
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--global-primary-TextColor);
    }

    &--details {
      font-size: 0.75rem;
      color: var(--global-secondary-TextColor);
    }

    &--arrow {
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--global-tertiary-TextColor);
      opacity: 0.6;
      transition:
        opacity 0.15s ease,
        transform 0.15s ease;
      flex-shrink: 0;
    }
  }
</style>
