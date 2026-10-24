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
  import { createEventDispatcher } from 'svelte'

  import Label from '../../components/Label.svelte'
  import type { ButtonShape } from '../button/types'
  import { pointerFocus } from '../utils/pointerFocus'
  import type { CheckboxEvents, CheckboxKind, CheckboxProps, CheckboxSize } from './types'

  type $$Props = CheckboxProps
  type $$Events = CheckboxEvents
  interface $$Slots {
    default: Record<string, never>
  }

  export let checked: boolean = false
  export let indeterminate: boolean = false
  export let label: IntlString | undefined = undefined
  export let labelParams: Record<string, any> | undefined = undefined
  export let kind: CheckboxKind | undefined = undefined
  export let size: CheckboxSize | undefined = undefined
  export let shape: ButtonShape | undefined = undefined
  export let color: string | undefined = undefined
  export let disabled: boolean = false
  export let readonly: boolean = false
  export let error: boolean = false
  export let decorative: boolean = false
  export let stopPropagation: boolean | undefined = undefined

  const dispatch = createEventDispatcher<{ change: boolean }>()

  let input: HTMLInputElement | undefined

  // Defaults resolve here: a declaration default applies only at mount, a prop later set to undefined stays undefined.
  $: resolvedKind = kind ?? 'primary'
  $: resolvedSize = size ?? 'medium'
  $: resolvedShape = shape ?? 'rectangle'
  $: labelled = label !== undefined || $$slots.default
  // `indeterminate` is a DOM property only, there is no attribute for it.
  $: if (input !== undefined) input.indeterminate = indeterminate

  // A checkbox has no native readonly: the click that would flip it is cancelled.
  function handleInputClick (event: MouseEvent): void {
    if (readonly) event.preventDefault()
  }

  function handleChange (event: Event): void {
    const target = event.currentTarget as HTMLInputElement
    checked = target.checked
    indeterminate = false
    dispatch('change', checked)
  }

  function handleClick (event: MouseEvent): void {
    if (stopPropagation ?? true) event.stopPropagation()
  }
</script>

{#if decorative}
  <span
    class="checkbox checkbox--{resolvedKind} checkbox--{resolvedSize} checkbox--{resolvedShape} checkbox--decorative"
    class:checkbox--checked={checked && !indeterminate}
    class:checkbox--indeterminate={indeterminate}
    class:checkbox--colored={color !== undefined}
    class:checkbox--disabled={disabled}
    style:--_user-color={color}
    aria-hidden="true"
  >
    <span class="checkbox__control">
      <span class="checkbox__box">
        <svg class="checkbox__mark checkbox__mark--check" viewBox="-0.2 -0.2 10.4 8.6" fill="currentColor">
          <path
            d="M9.7,0.5c0.4,0.4,0.4,1,0,1.4L4.1,7.8L0.3,4.2c-0.4-0.4-0.4-1,0-1.4c0.4-0.4,1-0.4,1.4,0L4,5l4.3-4.5C8.6,0.1,9.3,0.1,9.7,0.5z"
          />
        </svg>
        <svg class="checkbox__mark checkbox__mark--dash" viewBox="0 0 10 8" fill="currentColor">
          <path d="M0,4c0-0.6,0.4-1,1-1h8c0.6,0,1,0.4,1,1c0,0.6-0.4,1-1,1H1C0.4,5,0,4.6,0,4z" />
        </svg>
      </span>
    </span>
  </span>
{:else}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-noninteractive-element-interactions -->
  <label
    class="checkbox checkbox--{resolvedKind} checkbox--{resolvedSize} checkbox--{resolvedShape}"
    class:checkbox--labelled={labelled}
    class:checkbox--colored={color !== undefined}
    class:checkbox--disabled={disabled}
    class:checkbox--readonly={readonly && !disabled}
    class:checkbox--error={error}
    style:--_user-color={color}
    use:pointerFocus={'checkbox--pointer'}
    on:click={handleClick}
  >
    <span class="checkbox__control">
      <input
        bind:this={input}
        class="checkbox__input"
        type="checkbox"
        {checked}
        {disabled}
        aria-readonly={readonly || undefined}
        aria-invalid={error || undefined}
        on:click={handleInputClick}
        on:change={handleChange}
        {...$$restProps}
      />
      <span class="checkbox__box" aria-hidden="true">
        <svg class="checkbox__mark checkbox__mark--check" viewBox="-0.2 -0.2 10.4 8.6" fill="currentColor">
          <path
            d="M9.7,0.5c0.4,0.4,0.4,1,0,1.4L4.1,7.8L0.3,4.2c-0.4-0.4-0.4-1,0-1.4c0.4-0.4,1-0.4,1.4,0L4,5l4.3-4.5C8.6,0.1,9.3,0.1,9.7,0.5z"
          />
        </svg>
        <svg class="checkbox__mark checkbox__mark--dash" viewBox="0 0 10 8" fill="currentColor">
          <path d="M0,4c0-0.6,0.4-1,1-1h8c0.6,0,1,0.4,1,1c0,0.6-0.4,1-1,1H1C0.4,5,0,4.6,0,4z" />
        </svg>
      </span>
    </span>
    {#if labelled}
      <span class="checkbox__label">
        {#if label !== undefined}<Label {label} params={labelParams} />{/if}
        <slot />
      </span>
    {/if}
  </label>
{/if}

<style lang="scss">
  .checkbox {
    display: inline-flex;
    flex-shrink: 0;
    align-items: flex-start;
    gap: var(--_gap);
    min-width: 0;
    // An empty inline box sits on its bottom edge, a checked one on its mark: align both to the middle.
    vertical-align: middle;
    font-family: var(--font-family);
    font-size: var(--_font);
    font-weight: 400;
    line-height: var(--_line);
    color: var(--global-primary-TextColor);
    user-select: none;
    cursor: pointer;

    --_color: var(--selector-active-BackgroundColor);
    --_mark: var(--selector-IconColor);
    // The unchecked border takes the kind color, as in the legacy checkboxes.
    --_border: var(--_color);
    --_on-border: var(--_color);

    &__control {
      position: relative;
      display: inline-flex;
      flex-shrink: 0;
      align-items: center;
    }
    // Covers the box and stays transparent: clicks, hit tests and focus land on the real checkbox.
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
    &__box {
      display: flex;
      justify-content: center;
      align-items: center;
      width: var(--_box);
      height: var(--_box);
      border: 1px solid var(--_border);
      border-radius: var(--extra-small-BorderRadius);
      background-color: var(--selector-BackgroundColor);
      color: var(--_mark);
      transition:
        background-color 0.15s,
        border-color 0.15s;
    }
    &__mark {
      display: none;
      width: 62.5%;
      height: 50%;
      pointer-events: none;
    }

    &__input:checked:not(:indeterminate) + &__box,
    &--checked &__box {
      border-color: var(--_on-border);
      background-color: var(--_color);

      .checkbox__mark--check {
        display: block;
      }
    }
    &__input:indeterminate + &__box,
    &--indeterminate &__box {
      border-color: var(--_on-border);
      background-color: var(--_color);

      .checkbox__mark--dash {
        display: block;
      }
    }
    &__input:focus-visible + &__box {
      outline: 2px solid var(--global-focus-BorderColor);
      outline-offset: 2px;
    }
    // Checked by a click: no ring when a shortcut key follows.
    &:global(.checkbox--pointer) &__input:focus-visible + &__box {
      outline: none;
    }
    // Hover previews the check in the border color instead of a halo around the box.
    &:not(.checkbox--disabled):not(.checkbox--readonly):not(.checkbox--decorative):hover
      &__input:not(:checked):not(:indeterminate)
      + &__box
      .checkbox__mark--check {
      display: block;
      color: var(--_border);
    }

    &--labelled &__control {
      height: var(--_line);
    }
    &__label {
      min-width: 0;
    }

    &--brand {
      --_color: var(--button-brand-BackgroundColor);
      --_mark: var(--button-accent-IconColor);
    }
    &--positive {
      --_color: var(--button-positive-BackgroundColor);
      --_mark: var(--button-positive-IconColor);
    }
    &--negative {
      --_color: var(--button-negative-BackgroundColor);
      --_mark: var(--button-negative-IconColor);
    }
    // A routine mark, not an accent (mark as read): a gray circle and check without fill, a soft plate on hover.
    &--neutral {
      --_color: transparent;
      --_border: var(--global-tertiary-TextColor);
      --_on-border: var(--_border);
      --_mark: var(--_border);

      .checkbox__box {
        background-color: transparent;
      }
      // The plate is part of the control, so the whole of it takes the click; the negative margin keeps the box in line.
      .checkbox__control {
        margin: calc(-1 * var(--spacing-0_5));
        padding: var(--spacing-0_5);
        border-radius: var(--extra-small-BorderRadius);
        transition: background-color 0.15s;
      }
      &.checkbox--round .checkbox__control {
        border-radius: 50%;
      }
      &:not(.checkbox--disabled):not(.checkbox--readonly):not(.checkbox--decorative):hover .checkbox__control {
        background-color: var(--kit-button-secondary-hover-BackgroundColor);
      }
    }
    // The user's color is a separate variable, so `disabled` below can still override the fill.
    &--colored {
      --_color: var(--_user-color);
      --_mark: var(--global-on-accent-TextColor);
    }
    &--round &__box {
      border-radius: 50%;
    }
    &--error {
      --_border: var(--global-error-TextColor);
    }
    &--readonly,
    &--decorative {
      cursor: default;
    }
    &--decorative {
      pointer-events: none;
    }
    &--disabled {
      color: var(--global-disabled-TextColor);
      cursor: not-allowed;

      // No fill, so a disabled control never looks lighter than the page or than an enabled one.
      --_color: transparent;
      --_border: var(--global-disabled-TextColor);
      --_on-border: var(--_border);
      --_mark: var(--global-disabled-TextColor);

      .checkbox__box {
        background-color: transparent;
      }
    }

    &--medium {
      --_box: var(--spacing-2);
      --_font: 0.875rem;
      --_line: var(--spacing-2_5);
      --_gap: var(--spacing-1);
    }
    &--small {
      --_box: var(--spacing-1_75);
      --_font: 0.75rem;
      --_line: var(--spacing-2);
      --_gap: var(--spacing-0_75);
    }

    // Fills are not printed by default: the mark takes the text color on a bare box.
    @media print {
      &__box {
        background-color: transparent !important;
        color: currentColor !important;
      }
    }
  }
</style>
