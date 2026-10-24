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
  import { translateCB } from '@hcengineering/platform'
  import { languageStore } from '@hcengineering/theme'
  import { createEventDispatcher } from 'svelte'

  import Label from '../../components/Label.svelte'
  import { tooltip as tooltipAction } from '../../tooltips'
  import type { LabelAndProps } from '../../types'
  import type { ToggleEvents, ToggleKind, ToggleLabelPosition, ToggleProps, ToggleSize } from './types'

  type $$Props = ToggleProps
  type $$Events = ToggleEvents

  export let checked: boolean = false
  export let size: ToggleSize | undefined = undefined
  export let kind: ToggleKind | undefined = undefined
  export let label: IntlString | undefined = undefined
  export let labelParams: Record<string, any> | undefined = undefined
  export let description: IntlString | undefined = undefined
  export let descriptionParams: Record<string, any> | undefined = undefined
  export let labelPosition: ToggleLabelPosition | undefined = undefined
  export let fullWidth: boolean = false
  export let disabled: boolean = false
  export let readonly: boolean = false
  export let tooltip: LabelAndProps | undefined = undefined

  const dispatch = createEventDispatcher<{ change: boolean }>()
  const descriptionId = `toggle-description-${++lastId}`

  // Defaults resolve here: a declaration default applies only at mount, a prop later set to undefined stays undefined.
  $: resolvedSize = size ?? 'medium'
  $: resolvedPosition = labelPosition ?? 'end'
  $: tooltipOptions = tooltip !== undefined ? { timeout: 500, ...tooltip } : undefined
  $: hasDescription = label !== undefined && description !== undefined

  // Without a visible label the tooltip names the switch, unless the place names it itself.
  $: accessibleLabel =
    label === undefined && $$restProps['aria-label'] === undefined && $$restProps['aria-labelledby'] === undefined
      ? tooltip?.label
      : undefined
  $: accessibleLabelParams = tooltip?.props
  $: translateAccessibleLabel(
    accessibleLabel,
    accessibleLabelParams,
    $languageStore === '' ? undefined : $languageStore
  )

  let accessibleName: string | undefined
  let translation = 0

  function translateAccessibleLabel (
    label: IntlString | undefined,
    params: Record<string, any> | undefined,
    language: string | undefined
  ): void {
    const request = ++translation
    if (label === undefined) {
      accessibleName = undefined
      return
    }
    translateCB(label, params ?? {}, language, (text) => {
      // A slower answer for a previous label must not overwrite the current one.
      if (request === translation) accessibleName = text
    })
  }

  // A checkbox has no native readonly: the click that would flip it is cancelled.
  function handleClick (event: MouseEvent): void {
    if (readonly) event.preventDefault()
  }

  function handleChange (): void {
    dispatch('change', checked)
  }
</script>

<label
  class="toggle toggle--{kind ?? 'brand'} toggle--{resolvedSize} toggle--label-{resolvedPosition}"
  class:toggle--full-width={fullWidth}
  class:toggle--disabled={disabled}
  class:toggle--readonly={readonly && !disabled}
  use:tooltipAction={tooltipOptions}
>
  <span class="toggle__control">
    <input
      class="toggle__input"
      type="checkbox"
      role="switch"
      bind:checked
      {disabled}
      aria-readonly={readonly || undefined}
      aria-label={accessibleName}
      aria-describedby={hasDescription ? descriptionId : undefined}
      on:click={handleClick}
      on:change={handleChange}
      {...$$restProps}
    />
    <span class="toggle__track" aria-hidden="true" />
  </span>
  {#if label !== undefined}
    <span class="toggle__text">
      <span class="toggle__label"><Label {label} params={labelParams} /></span>
      {#if hasDescription && description !== undefined}
        <span class="toggle__description" id={descriptionId}
          ><Label label={description} params={descriptionParams} /></span
        >
      {/if}
    </span>
  {/if}
</label>

<style lang="scss">
  .toggle {
    display: inline-flex;
    align-items: flex-start;
    gap: var(--spacing-1);
    min-width: 0;
    font-family: var(--font-family);
    font-size: 0.875rem;
    font-weight: 400;
    line-height: var(--_line);
    color: var(--global-primary-TextColor);
    user-select: none;
    cursor: pointer;

    --_track: var(--theme-toggle-bg-color);
    --_track-hover: var(--theme-toggle-bg-hover);
    --_thumb: var(--theme-toggle-sw-color);
    --_on: var(--theme-toggle-on-bg-color);
    --_on-hover: var(--theme-toggle-on-bg-hover);

    &__control {
      position: relative;
      display: inline-flex;
      flex-shrink: 0;
      align-items: center;
      // The switch sits on the first text line, so a description below does not pull it down.
      height: var(--_line);
    }
    // Covers the track and stays transparent: clicks, hit tests and focus land on the real checkbox.
    &__input {
      position: absolute;
      inset: 0;
      z-index: 1;
      width: 100%;
      height: 100%;
      margin: 0;
      opacity: 0;
      cursor: inherit;
    }
    &__track {
      position: relative;
      display: block;
      width: var(--_width);
      height: var(--_height);
      border-radius: var(--_height);
      background-color: var(--_track);
      transition: background-color 0.15s;

      // A small thumb with a wide inset, centered on the track height.
      &::after {
        content: '';
        position: absolute;
        top: 50%;
        left: calc((var(--_height) - var(--_thumb-size)) / 2);
        width: var(--_thumb-size);
        height: var(--_thumb-size);
        border-radius: 50%;
        background-color: var(--_thumb);
        transform: translateY(-50%);
        transition: transform 0.15s;
      }
    }
    &__input:checked + &__track {
      --_track: var(--_on);
      --_track-hover: var(--_on-hover);
      --_thumb: var(--theme-toggle-on-sw-color);

      &::after {
        transform: translate(calc(var(--_width) - var(--_height)), -50%);
      }
    }
    &__input:focus-visible + &__track {
      outline: 2px solid var(--global-focus-BorderColor);
      outline-offset: 2px;
    }
    &:not(.toggle--disabled):not(.toggle--readonly):hover &__track {
      background-color: var(--_track-hover);
    }

    &__text {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    &__description {
      font-size: 0.75rem;
      line-height: 1rem;
      color: var(--global-secondary-TextColor);
    }

    // Order, not row-reverse: a stretched toggle keeps its content at the start.
    &--label-start .toggle__text {
      order: -1;
    }
    &--full-width {
      display: flex;
      width: 100%;

      .toggle__text {
        flex-grow: 1;
      }
    }
    &--readonly {
      cursor: default;
    }
    // Neutral like a disabled button; the thumb side still tells on from off.
    &--disabled {
      color: var(--global-disabled-TextColor);
      cursor: not-allowed;

      .toggle__track {
        background-color: var(--button-disabled-BackgroundColor);
      }
      // A white thumb on the faint off track outshone an enabled switch in the dark theme.
      .toggle__input:not(:checked) + .toggle__track::after {
        background-color: var(--global-disabled-TextColor);
      }
      .toggle__input:checked + .toggle__track {
        background-color: var(--global-disabled-TextColor);
      }
      .toggle__description {
        color: var(--global-disabled-TextColor);
      }
    }

    &--primary {
      --_on: var(--kit-button-primary-BackgroundColor);
      --_on-hover: var(--kit-button-primary-hover-BackgroundColor);
    }
    &--positive {
      --_on: var(--button-positive-BackgroundColor);
      --_on-hover: var(--button-positive-hover-BackgroundColor);
    }
    &--negative {
      --_on: var(--button-negative-BackgroundColor);
      --_on-hover: var(--button-negative-hover-BackgroundColor);
    }

    // Sizes: the track is twice as wide as high, the thumb about half the height.
    &--large {
      --_width: var(--spacing-6);
      --_height: var(--spacing-3);
      --_thumb-size: var(--spacing-1_75);
      --_line: var(--spacing-3);
    }
    &--medium {
      --_width: var(--spacing-5);
      --_height: var(--spacing-2_5);
      --_thumb-size: var(--spacing-1_25);
      --_line: var(--spacing-2_5);
    }
    &--small {
      --_width: var(--spacing-4);
      --_height: var(--spacing-2);
      --_thumb-size: var(--spacing-1);
      --_line: var(--spacing-2_5);
    }
    &--extra-small {
      gap: var(--spacing-0_75);
      font-size: 0.75rem;

      --_width: var(--spacing-3_5);
      --_height: var(--spacing-1_75);
      --_thumb-size: var(--spacing-0_75);
      --_line: var(--spacing-2);
    }
  }
</style>
