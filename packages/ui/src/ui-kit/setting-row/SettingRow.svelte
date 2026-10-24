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
<script lang="ts" context="module">
  let lastId = 0
</script>

<script lang="ts">
  import type { IntlString } from '@hcengineering/platform'

  import IconInfo from '../../components/icons/Info.svelte'
  import Label from '../../components/Label.svelte'
  import IconButton from '../button/IconButton.svelte'
  import type { SettingRowProps, SettingRowSlots } from './types'

  type $$Props = SettingRowProps
  type $$Slots = SettingRowSlots

  export let label: IntlString
  export let labelParams: Record<string, any> = {}
  export let hint: IntlString | undefined = undefined
  export let stacked: boolean = false

  const labelId = `setting-row-label-${++lastId}`
</script>

<div class="setting-row" class:setting-row--stacked={stacked}>
  <div class="setting-row__main">
    <span class="setting-row__caption">
      <span class="setting-row__label" id={labelId}><Label {label} params={labelParams} /></span>
      {#if hint !== undefined}
        <IconButton icon={IconInfo} size="extra-small" kind="ghost" tooltip={{ label: hint }} />
      {/if}
    </span>
    <div class="setting-row__control"><slot {labelId} /></div>
  </div>
  {#if $$slots.details}
    <div class="setting-row__details"><slot name="details" /></div>
  {/if}
</div>

<style lang="scss">
  .setting-row {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    min-width: 0;
    border-bottom: 1px solid var(--global-subtle-ui-BorderColor);

    // No line above the first row, so the gap above it is the container's own.
    &:first-child .setting-row__main {
      min-height: calc(var(--global-max-Size) - var(--spacing-1_5));
      padding-top: 0;
    }

    &__main {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: var(--spacing-2);
      min-width: 0;
      min-height: var(--global-max-Size);
      padding: var(--spacing-1_5) 0;
    }
    &__caption {
      display: flex;
      flex-shrink: 0;
      align-items: center;
      gap: var(--spacing-0_5);
      min-width: 0;
    }
    &__label {
      font-size: 0.75rem;
      font-weight: 500;
      line-height: 1rem;
      text-transform: uppercase;
      color: var(--global-secondary-TextColor);
    }
    // Takes the rest of the line, so a full-width control fills it and a sized one keeps to the right.
    &__control {
      display: flex;
      flex-grow: 1;
      justify-content: flex-end;
      align-items: center;
      min-width: 0;
    }
    &__details {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--spacing-0_75);
      padding-bottom: var(--spacing-1_5);

      // The slot is passed even with nothing picked: no empty gap above the line then.
      &:not(:has(*)) {
        display: none;
      }
    }

    &--stacked .setting-row__main {
      flex-direction: column;
      align-items: stretch;
      gap: var(--spacing-1);
    }
    &--stacked .setting-row__control {
      display: block;
    }
  }
</style>
