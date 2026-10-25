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

  import Label from '../../components/Label.svelte'
  import ui from '../../plugin'
  import type { IconComponent } from '../../types'
  import IconButton from '../button/IconButton.svelte'
  import IconBox from '../icon-box/IconBox.svelte'
  import type { SettingRowKind, SettingRowProps, SettingRowSlots, SettingRowVariant } from './types'

  type $$Props = SettingRowProps
  type $$Slots = SettingRowSlots

  export let label: IntlString
  export let labelParams: Record<string, any> = {}
  export let variant: SettingRowVariant | undefined = undefined
  export let kind: SettingRowKind = 'line'
  export let hint: IntlString | undefined = undefined
  export let hintParams: Record<string, any> = {}
  export let stacked: boolean = false
  export let fullWidth: boolean = false
  export let icon: IconComponent | undefined = undefined
  export let color: string | undefined = undefined
  export let description: IntlString | undefined = undefined
  export let descriptionParams: Record<string, any> = {}
  export let disabled: boolean = false

  const id = ++lastId
  const labelId = `setting-row-label-${id}`
  const controlId = `setting-row-control-${id}`
  // Only a list item draws the description: a form row would point at a missing id.
  $: descriptionId = variant === 'list' && description != null ? `setting-row-description-${id}` : undefined
</script>

{#if variant === 'list'}
  <div class="setting-row setting-row--list" class:setting-row--disabled={disabled}>
    {#if icon != null}
      <span class="setting-row__icon"><IconBox {icon} {color} size="small" /></span>
    {/if}
    <div class="setting-row__body">
      <label class="setting-row__text" for={controlId}>
        <span class="setting-row__title" id={labelId}><Label {label} params={labelParams} /></span>
        {#if description != null}
          <span class="setting-row__description" id={descriptionId}>
            <Label label={description} params={descriptionParams} />
          </span>
        {/if}
      </label>
      <div class="setting-row__end"><slot {labelId} {descriptionId} {controlId} /></div>
    </div>
  </div>
{:else}
  <div
    class="setting-row setting-row--{kind}"
    class:setting-row--stacked={stacked}
    class:setting-row--full-width={fullWidth}
  >
    <div class="setting-row__main">
      <span class="setting-row__caption">
        <span class="setting-row__label" id={labelId}><Label {label} params={labelParams} /></span>
        {#if hint != null && kind === 'column'}
          <span class="setting-row__hint"><Label label={hint} params={hintParams} /></span>
        {:else if hint != null}
          <IconButton
            icon={ui.icon.InfoCircle}
            size="extra-small"
            kind="ghost"
            tooltip={{ label: hint, props: hintParams }}
          />
        {/if}
      </span>
      <div class="setting-row__control"><slot {labelId} {descriptionId} {controlId} /></div>
    </div>
    {#if $$slots.details}
      <div class="setting-row__details"><slot name="details" /></div>
    {/if}
  </div>
{/if}

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

    // A settings page: rows stand apart by the gap of the place, the controls line up after the caption column.
    &--column {
      border-bottom: none;

      .setting-row__main,
      &:first-child .setting-row__main {
        justify-content: flex-start;
        gap: var(--spacing-2);
        min-height: var(--global-small-Size);
        padding: 0;
      }
      .setting-row__caption {
        flex-direction: column;
        align-items: flex-start;
        gap: 0.125rem;
        width: 13.75rem;
      }
      .setting-row__label {
        font-size: 0.875rem;
        font-weight: 400;
        line-height: normal;
        text-transform: none;
        color: var(--theme-content-color);
      }
      .setting-row__hint {
        font-size: 0.75rem;
        color: var(--theme-darker-color);
      }
      .setting-row__control {
        flex-grow: 0;
        justify-content: flex-start;
      }
    }

    // The control takes the rest of the row in any kind, so a fullWidth field fills it.
    &--full-width .setting-row__control {
      flex: 1 1 0;
    }

    &--stacked .setting-row__main {
      flex-direction: column;
      align-items: stretch;
      gap: var(--spacing-1);
    }
    &--stacked .setting-row__control {
      display: block;
    }

    &--list {
      flex-direction: row;
      align-items: center;
      gap: var(--spacing-1_5);
      border-bottom: none;
    }
    &__icon {
      display: flex;
      flex-shrink: 0;
    }
    // The line starts after the icon, so the plates stand in one column.
    &__body {
      display: flex;
      flex-grow: 1;
      align-items: center;
      gap: var(--spacing-1_5);
      min-width: 0;
      padding: var(--spacing-0_75) 0;
    }
    &--list:not(:last-child) &__body {
      border-bottom: 1px solid var(--global-subtle-ui-BorderColor);
    }
    &__text {
      display: flex;
      flex-direction: column;
      flex-grow: 1;
      min-width: 0;
      cursor: pointer;
    }
    &__title {
      font-size: 0.875rem;
      line-height: 1.25rem;
      color: var(--global-primary-TextColor);
    }
    &__description {
      font-size: 0.75rem;
      line-height: 1rem;
      color: var(--global-secondary-TextColor);
    }
    &__end {
      display: flex;
      flex-shrink: 0;
      align-items: center;
      gap: var(--spacing-1);
    }
    &--disabled {
      .setting-row__text {
        cursor: default;
      }
      .setting-row__title,
      .setting-row__description {
        color: var(--global-disabled-TextColor);
      }
      .setting-row__icon {
        opacity: 0.5;
      }
    }
  }
</style>
