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

  import ui from '../../plugin'
  import Icon from '../../components/Icon.svelte'
  import Label from '../../components/Label.svelte'
  import type { IconComponent } from '../../types'
  import type { EmptyStateEvents, EmptyStateKind, EmptyStateProps, EmptyStateSize } from './types'

  type $$Props = EmptyStateProps
  type $$Events = EmptyStateEvents
  interface $$Slots {
    default: Record<string, never>
  }

  export let label: IntlString
  export let labelParams: Record<string, any> = {}
  export let description: IntlString | undefined = undefined
  export let descriptionParams: Record<string, any> = {}
  export let icon: IconComponent | undefined = undefined
  export let iconProps: Record<string, any> = {}
  export let size: EmptyStateSize | undefined = undefined
  export let kind: EmptyStateKind | undefined = undefined
  export let action: IntlString | undefined = undefined
  export let actionParams: Record<string, any> = {}

  $: resolvedSize = size ?? 'large'
  $: resolvedKind = kind ?? 'brand'
</script>

{#if resolvedSize === 'small' && action !== undefined}
  <!-- The whole dashed plate is the add button: the message and the action read as one name. -->
  <button class="empty-state empty-state--small empty-state--add" type="button" on:click>
    {#if icon !== undefined}
      <span class="empty-state__plate" aria-hidden="true">
        <span class="empty-state__icon"><Icon {icon} {iconProps} size="full" /></span>
      </span>
    {/if}
    <span class="empty-state__label"><Label {label} params={labelParams} /></span>
    <span class="empty-state__action">
      <span class="empty-state__add-icon" aria-hidden="true"><Icon icon={ui.icon.Plus} size="full" /></span>
      <Label label={action} params={actionParams} />
    </span>
  </button>
{:else}
  <div class="empty-state empty-state--{resolvedSize} {resolvedSize === 'large' ? `empty-state--${resolvedKind}` : ''}">
    {#if icon !== undefined}
      <span class="empty-state__plate" aria-hidden="true">
        <span class="empty-state__icon"><Icon {icon} {iconProps} size="full" /></span>
      </span>
    {/if}
    <span class="empty-state__label"><Label {label} params={labelParams} /></span>
    {#if description !== undefined}
      <span class="empty-state__description"><Label label={description} params={descriptionParams} /></span>
    {/if}
    {#if $$slots.default}
      <div class="empty-state__actions"><slot /></div>
    {/if}
  </div>
{/if}

<style lang="scss">
  .empty-state {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 0;
    text-align: center;

    &__plate {
      position: relative;
      display: inline-flex;
      flex-shrink: 0;
      justify-content: center;
      align-items: center;
    }
    &__icon {
      display: inline-flex;
      flex-shrink: 0;
      width: 1.5rem;
      height: 1.5rem;
      color: var(--global-primary-TextColor);
    }
    &__label,
    &__description,
    &__actions {
      position: relative;
    }
    &__actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      align-items: center;
      gap: var(--spacing-1);
    }

    // The whole view is empty: it fills the place, so the place does not have to centre it.
    &--large {
      box-sizing: border-box;
      flex: 1 1 auto;
      align-self: stretch;
      isolation: isolate;
      justify-content: center;
      padding: var(--spacing-4) var(--spacing-2);
      width: 100%;
      font-size: 0.875rem;
      line-height: 1.25rem;
      color: var(--global-secondary-TextColor);

      // The whole view is empty: the icon sits on a plate, the picture of the block.
      .empty-state__plate {
        margin-bottom: var(--spacing-2);
        width: 3.5rem;
        height: 3.5rem;
        color: var(--global-secondary-TextColor);
        background-color: color-mix(in srgb, var(--global-ui-hover-BackgroundColor) 60%, transparent);
        border-radius: var(--large-BorderRadius);
      }
      .empty-state__icon {
        width: 1.75rem;
        height: 1.75rem;
        color: inherit;
      }
      .empty-state__label,
      .empty-state__description {
        max-width: 30rem;
      }
      .empty-state__label {
        font-weight: 500;
        color: var(--global-primary-TextColor);
      }
      .empty-state__description {
        margin-top: var(--spacing-0_5);
      }
      .empty-state__actions {
        margin-top: var(--spacing-2);
      }
    }
    // Alone in a block parent it takes its height; next to a table header it only fills what is left.
    &--large:only-child {
      min-height: 100%;
    }
    &--brand .empty-state__plate {
      color: var(--button-selected-IconColor);
      background-color: var(--button-selected-BackgroundColor);
      border-radius: 50%;
    }
    // A light frame inside a section, the pair of the dashed add plate; the icon sits on a soft square.
    &--small {
      box-sizing: border-box;
      justify-content: center;
      padding: var(--spacing-2);
      font-size: 0.75rem;
      line-height: 1rem;
      color: var(--global-secondary-TextColor);
      border: 1px solid var(--theme-divider-color);
      border-radius: var(--medium-BorderRadius);

      .empty-state__plate {
        margin-bottom: var(--spacing-1);
        width: 2rem;
        height: 2rem;
        color: var(--global-secondary-TextColor);
        background-color: color-mix(in srgb, var(--global-ui-hover-BackgroundColor) 60%, transparent);
        border-radius: var(--small-BorderRadius);
      }
      .empty-state__icon {
        width: 1rem;
        height: 1rem;
        color: inherit;
      }
      .empty-state__description {
        margin-top: var(--spacing-0_5);
      }
      .empty-state__actions {
        margin-top: var(--spacing-1);
      }
    }

    // One way to fill the section: the dashed plate is the add button, a click anywhere on it adds.
    &--add {
      box-sizing: border-box;
      align-self: stretch;
      margin: 0;
      font: inherit;
      font-size: 0.75rem;
      line-height: 1rem;
      background-color: transparent;
      border: 1px dashed color-mix(in srgb, var(--global-secondary-TextColor) 40%, transparent);
      cursor: pointer;

      &:hover {
        background-color: color-mix(in srgb, var(--global-ui-hover-BackgroundColor) 50%, transparent);
      }
      &:active {
        background-color: var(--global-ui-hover-BackgroundColor);
      }
      &:focus-visible {
        outline: 2px solid var(--global-focus-BorderColor);
        outline-offset: 2px;
      }
    }
    &__action {
      display: inline-flex;
      align-items: center;
      gap: var(--spacing-0_5);
      margin-top: var(--spacing-1);
      font-weight: 500;
      color: var(--button-selected-LabelColor);
    }
    &__add-icon {
      display: inline-flex;
      width: 1rem;
      height: 1rem;
    }
  }
</style>
