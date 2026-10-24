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
<script lang="ts" generics="Value = string">
  import type { IntlString } from '@hcengineering/platform'
  import { createEventDispatcher } from 'svelte'

  import Label from '../../components/Label.svelte'
  import type { RadioEvents, RadioKind, RadioProps, RadioSize } from './types'

  type $$Props = RadioProps<Value>
  type $$Events = RadioEvents<Value>

  export let value: Value
  export let group: Value | null | undefined = undefined
  export let name: string | undefined = undefined
  export let label: IntlString | undefined = undefined
  export let labelParams: Record<string, any> | undefined = undefined
  export let kind: RadioKind | undefined = undefined
  export let size: RadioSize | undefined = undefined
  export let disabled: boolean = false
  export let readonly: boolean = false
  export let error: boolean = false
  export let stopPropagation: boolean | undefined = undefined

  const dispatch = createEventDispatcher<{ change: Value }>()

  // Defaults resolve here: a declaration default applies only at mount, a prop later set to undefined stays undefined.
  $: resolvedKind = kind ?? 'primary'
  $: resolvedSize = size ?? 'medium'
  $: labelled = label !== undefined || $$slots.default
  $: checked = group === value

  // aria-readonly and aria-invalid are not radio attributes: RadioGroup carries them.
  // A radio has no native readonly: the click (also sent by arrow keys) that would select it is cancelled.
  function handleInputClick (event: MouseEvent): void {
    if (readonly) event.preventDefault()
  }

  function handleKeydown (event: KeyboardEvent): void {
    if (readonly && event.key.startsWith('Arrow')) event.preventDefault()
  }

  function handleChange (event: Event): void {
    if (!(event.currentTarget as HTMLInputElement).checked) return
    group = value
    dispatch('change', value)
  }

  function handleClick (event: MouseEvent): void {
    if (stopPropagation ?? true) event.stopPropagation()
  }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-noninteractive-element-interactions -->
<label
  class="radio radio--{resolvedKind} radio--{resolvedSize}"
  class:radio--labelled={labelled}
  class:radio--disabled={disabled}
  class:radio--readonly={readonly && !disabled}
  class:radio--error={error}
  on:click={handleClick}
>
  <span class="radio__control">
    <input
      class="radio__input"
      type="radio"
      {name}
      {checked}
      {disabled}
      on:click={handleInputClick}
      on:keydown={handleKeydown}
      on:change={handleChange}
      {...$$restProps}
    />
    <span class="radio__circle" aria-hidden="true" />
  </span>
  {#if labelled}
    <span class="radio__label">
      {#if label !== undefined}<Label {label} params={labelParams} />{/if}
      <slot />
    </span>
  {/if}
</label>

<style lang="scss">
  .radio {
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
    // The unselected border takes the kind color, as on Checkbox.
    --_border: var(--_color);
    --_on-border: var(--_color);

    &__control {
      position: relative;
      display: inline-flex;
      flex-shrink: 0;
      align-items: center;
    }
    // Covers the circle and stays transparent: clicks, hit tests and focus land on the real radio.
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
    &__circle {
      position: relative;
      display: block;
      width: var(--_box);
      height: var(--_box);
      border: 1px solid var(--_border);
      border-radius: 50%;
      background-color: var(--selector-BackgroundColor);
      transition:
        background-color 0.15s,
        border-color 0.15s;

      &::after {
        content: '';
        position: absolute;
        top: 50%;
        left: 50%;
        display: none;
        width: var(--_dot);
        height: var(--_dot);
        border-radius: 50%;
        background-color: var(--_mark);
        transform: translate(-50%, -50%);
      }
    }
    &__input:checked + &__circle {
      border-color: var(--_on-border);
      background-color: var(--_color);

      &::after {
        display: block;
      }
    }
    &__input:focus-visible + &__circle {
      outline: 2px solid var(--global-focus-BorderColor);
      outline-offset: 2px;
    }
    // Hover previews the dot in the border color instead of a halo around the circle.
    &:not(.radio--disabled):not(.radio--readonly):hover &__input:not(:checked) + &__circle::after {
      display: block;
      background-color: var(--_border);
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
    &--error {
      --_border: var(--global-error-TextColor);
    }
    &--readonly {
      cursor: default;
    }
    &--disabled {
      color: var(--global-disabled-TextColor);
      cursor: not-allowed;

      // No fill, so a disabled control never looks lighter than the page or than an enabled one.
      --_color: transparent;
      --_border: var(--global-disabled-TextColor);
      --_on-border: var(--_border);
      --_mark: var(--global-disabled-TextColor);

      .radio__circle {
        background-color: transparent;
      }
    }

    &--medium {
      --_box: var(--spacing-2);
      --_dot: var(--spacing-0_75);
      --_font: 0.875rem;
      --_line: var(--spacing-2_5);
      --_gap: var(--spacing-1);
    }
    &--small {
      --_box: var(--spacing-1_75);
      --_dot: calc(var(--_box) * 0.375);
      --_font: 0.75rem;
      --_line: var(--spacing-2);
      --_gap: var(--spacing-0_75);
    }

    // Fills are not printed by default: the dot takes the text color in a bare circle.
    @media print {
      &__circle {
        background-color: transparent !important;

        &::after {
          background-color: currentColor !important;
        }
      }
    }
  }
</style>
