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
  import { createEventDispatcher, onMount } from 'svelte'

  import Icon from '../../components/Icon.svelte'
  import IconClose from '../../components/icons/Close.svelte'
  import { registerFocus } from '../../focus'
  import ui from '../../plugin'
  import type { IconComponent } from '../../types'
  import IconButton from '../button/IconButton.svelte'
  import type { ButtonSize } from '../button/types'
  import type {
    TextInputEvents,
    TextInputKind,
    TextInputMode,
    TextInputProps,
    TextInputSize,
    TextInputType
  } from './types'

  type $$Props = TextInputProps
  type $$Events = TextInputEvents

  export let value: string | undefined = undefined
  export let label: IntlString | undefined = undefined
  export let labelParams: Record<string, any> | undefined = undefined
  export let placeholder: IntlString | undefined = undefined
  export let placeholderParams: Record<string, any> | undefined = undefined
  export let kind: TextInputKind | undefined = undefined
  export let size: TextInputSize | undefined = undefined
  export let heading: boolean = false
  export let inset: boolean = false
  export let icon: IconComponent | undefined = undefined
  export let clearable: boolean = false
  export let type: TextInputType | undefined = undefined
  export let inputmode: TextInputMode | undefined = undefined
  export let required: boolean = false
  export let maxlength: number | undefined = undefined
  export let disabled: boolean = false
  export let readonly: boolean = false
  export let error: boolean = false
  export let fullWidth: boolean = false
  export let autofocus: boolean = false
  export let focusIndex: number | undefined = undefined
  export let id: string | undefined = undefined
  export let name: string | undefined = undefined
  export let autocomplete: string | undefined = undefined

  const dispatch = createEventDispatcher<{ input: string, change: string }>()
  const ownId = `text-input-${++lastId}`

  // One step smaller than the field, so the clear button sits inside it with an even margin.
  const clearSizes: Record<TextInputSize, ButtonSize> = {
    'extra-large': 'large',
    large: 'medium',
    medium: 'small',
    small: 'extra-small',
    'extra-small': 'min'
  }

  let input: HTMLInputElement | undefined
  let labelText = ''
  let placeholderText = ''

  $: resolvedKind = kind ?? 'secondary'
  $: resolvedSize = size ?? 'small'
  $: inputId = id ?? ownId
  $: floating = label !== undefined && resolvedSize === 'extra-large'
  $: filled = (value ?? '') !== ''
  $: showClear = clearable && filled && !disabled && !readonly
  $: language = $languageStore === '' ? undefined : $languageStore
  $: translateLabel(label, labelParams, language)
  $: translatePlaceholder(placeholder, placeholderParams, language)
  // An explicit name wins; otherwise the label, then the placeholder.
  $: accessibleName =
    $$restProps['aria-labelledby'] !== undefined
      ? undefined
      : ($$restProps['aria-label'] ??
        (labelText !== '' ? labelText : placeholderText !== '' ? placeholderText : undefined))
  $: dataAttributes = Object.fromEntries(Object.entries($$restProps).filter(([key]) => key.startsWith('data-')))

  let labelRequest = 0
  let placeholderRequest = 0

  function translateLabel (text: IntlString | undefined, params: Record<string, any> | undefined, lang?: string): void {
    const request = ++labelRequest
    if (text === undefined) {
      labelText = ''
      return
    }
    // A slower answer for a previous text must not overwrite the current one.
    translateCB(text, params ?? {}, lang, (res) => {
      if (request === labelRequest) labelText = res
    })
  }

  function translatePlaceholder (
    text: IntlString | undefined,
    params: Record<string, any> | undefined,
    lang?: string
  ): void {
    const request = ++placeholderRequest
    if (text === undefined) {
      placeholderText = ''
      return
    }
    translateCB(text, params ?? {}, lang, (res) => {
      if (request === placeholderRequest) placeholderText = res
    })
  }

  export function focus (): void {
    input?.focus()
  }

  export function select (): void {
    input?.select()
  }

  function handleInput (): void {
    if (input === undefined) return
    value = input.value
    dispatch('input', value)
  }

  function clear (): void {
    value = ''
    dispatch('input', '')
    dispatch('change', '')
    input?.focus()
  }

  const { idx, focusManager } = registerFocus(focusIndex ?? -1, {
    focus: () => {
      if (disabled || input === undefined) return false
      input.focus()
      return true
    },
    isFocus: () => document.activeElement === input
  })
  $: if (idx !== -1) focusManager?.updateFocus(idx, focusIndex ?? -1)

  function handleFocus (): void {
    if (idx !== -1) focusManager?.setFocus(idx)
  }

  onMount(() => {
    if (autofocus) input?.focus()
  })
</script>

<div
  class="text-input text-input--{resolvedKind} text-input--{resolvedSize}"
  class:text-input--ghost={resolvedKind === 'ghost' || resolvedKind === 'subtle'}
  class:text-input--heading={heading}
  class:text-input--inset={inset}
  class:text-input--floating={floating}
  class:text-input--filled={filled}
  class:text-input--end-action={showClear || $$slots.after}
  class:text-input--disabled={disabled}
  class:text-input--readonly={readonly}
  class:text-input--error={error}
  class:text-input--full-width={fullWidth}
>
  {#if label !== undefined && !floating}
    <label class="text-input__label" for={inputId}>
      {labelText}{#if required}<span class="text-input__required" aria-hidden="true">*</span>{/if}
    </label>
  {/if}
  <!-- A label for the input, so a click on the padding or an icon focuses it; slotted buttons keep their own click. -->
  <label class="text-input__field" for={inputId}>
    <slot name="before" />
    {#if icon !== undefined}
      <span class="text-input__icon"><Icon {icon} size="small" /></span>
    {/if}
    <span class="text-input__control">
      <input
        bind:this={input}
        class="text-input__input"
        id={inputId}
        {name}
        type={type ?? 'text'}
        value={value ?? ''}
        placeholder={floating ? undefined : placeholderText}
        {inputmode}
        {required}
        {maxlength}
        {disabled}
        {readonly}
        autocomplete={autocomplete ?? 'off'}
        spellcheck="false"
        aria-label={accessibleName}
        aria-labelledby={$$restProps['aria-labelledby']}
        aria-describedby={$$restProps['aria-describedby']}
        aria-invalid={error ? 'true' : undefined}
        {...dataAttributes}
        on:input={handleInput}
        on:change={() => dispatch('change', value ?? '')}
        on:keydown
        on:focus={handleFocus}
        on:focus
        on:blur
      />
      {#if floating}
        <span class="text-input__floating" aria-hidden="true">
          {labelText}{#if required}<span class="text-input__required">*</span>{/if}
        </span>
      {/if}
    </span>
    {#if showClear}
      <span class="text-input__clear">
        <IconButton
          kind="ghost"
          size={clearSizes[resolvedSize]}
          icon={IconClose}
          tooltip={{ label: ui.string.Clear }}
          on:click={clear}
        />
      </span>
    {/if}
    <slot name="after" />
  </label>
</div>

<style lang="scss">
  .text-input {
    display: inline-flex;
    flex-direction: column;
    gap: var(--spacing-0_5);
    min-width: 0;
    font-family: var(--font-family);

    &__label {
      font-size: 0.75rem;
      font-weight: 500;
      line-height: 1rem;
      color: var(--global-primary-TextColor);
      user-select: none;
    }
    &__required {
      margin-left: 0.125rem;
      color: var(--global-error-TextColor);
    }

    &__field {
      display: flex;
      align-items: center;
      gap: var(--spacing-0_75);
      height: var(--_height);
      padding: 0 var(--_pad);
      border-radius: var(--_radius);
      box-shadow: inset 0 0 0 1px var(--_border);
      background-color: var(--_bg);
      font-size: var(--_font-size);
      font-weight: var(--_font-weight, 400);
      line-height: var(--_line-height);
      color: var(--global-primary-TextColor);
      cursor: text;
    }
    &__icon {
      display: flex;
      flex-shrink: 0;
      color: color-mix(in srgb, var(--global-secondary-TextColor) 70%, var(--global-primary-TextColor));
    }
    &__control {
      position: relative;
      display: flex;
      flex: 1 1 auto;
      align-self: stretch;
      min-width: 0;
    }
    &__input {
      width: 100%;
      min-width: 0;
      height: 100%;
      margin: 0;
      padding: 0;
      border: none;
      outline: none;
      background: transparent;
      font: inherit;
      text-overflow: ellipsis;
      color: inherit;
      caret-color: var(--global-focus-BorderColor);
      appearance: none;

      &::placeholder {
        color: var(--global-secondary-TextColor);
      }
      // The field has its own clear button.
      &::-webkit-search-decoration,
      &::-webkit-search-cancel-button {
        appearance: none;
      }
      // Browser autofill buttons would cover the clear button and the slots.
      &::-webkit-contacts-auto-fill-button,
      &::-webkit-credentials-auto-fill-button {
        display: none !important;
        visibility: hidden;
      }
    }
    &__clear {
      display: flex;
      flex-shrink: 0;
    }

    // Kinds
    // The input tokens of the legacy fields: a field reads as a field, not as a button.
    &--secondary {
      --_border: var(--input-BorderColor, transparent);
      --_bg: var(--input-BackgroundColor);

      &:not(.text-input--disabled, .text-input--readonly) .text-input__field:hover {
        --_bg: var(--input-hover-BackgroundColor);
      }
      // Only the input's own focus: the clear button and slotted buttons draw their own ring.
      .text-input__field:has(.text-input__input:focus) {
        outline: 2px solid var(--global-focus-BorderColor);
        outline-offset: 2px;
      }
    }
    // A ghost field stays clear in focus, as the legacy ones: the caret shows where the text goes.
    &--ghost {
      --_border: transparent;
      --_bg: transparent;

      &:not(.text-input--disabled, .text-input--readonly)
        .text-input__field:hover
        .text-input__input:not(:focus)::placeholder {
        color: var(--global-primary-TextColor);
      }
    }

    // A ghost that shows the hover fill of a field and becomes a field in focus: fill and ring.
    &--subtle:not(.text-input--disabled, .text-input--readonly) .text-input__field:hover {
      --_bg: var(--input-hover-BackgroundColor);
    }
    &--subtle:not(.text-input--disabled, .text-input--readonly) .text-input__field:has(.text-input__input:focus) {
      --_bg: var(--input-BackgroundColor);
      outline: 2px solid var(--global-focus-BorderColor);
      outline-offset: 2px;
    }

    // Sizes
    &--extra-large {
      --_height: var(--global-extra-large-Size);
      --_radius: var(--medium-BorderRadius);
      --_pad: var(--spacing-2);
      --_pad-end: var(--spacing-1);
      --_font-size: 0.875rem;
      --_line-height: 1.25rem;
    }
    &--large {
      --_height: var(--global-large-Size);
      --_radius: var(--medium-BorderRadius);
      --_pad: var(--spacing-2);
      --_pad-end: var(--spacing-0_5);
      --_font-size: 0.875rem;
      --_line-height: 1.25rem;
    }
    &--medium {
      --_height: var(--global-medium-Size);
      --_radius: var(--medium-BorderRadius);
      --_pad: var(--spacing-2);
      --_pad-end: var(--spacing-0_5);
      --_font-size: 0.875rem;
      --_line-height: 1.25rem;
    }
    &--small {
      --_height: var(--global-small-Size);
      --_radius: var(--small-BorderRadius);
      --_pad: var(--spacing-1_5);
      --_pad-end: var(--spacing-0_5);
      --_font-size: 0.875rem;
      --_line-height: 1.25rem;
    }
    &--extra-small {
      --_height: var(--global-extra-small-Size);
      --_radius: var(--extra-small-BorderRadius);
      --_pad: var(--spacing-1);
      --_pad-end: var(--spacing-0_5);
      --_font-size: 0.75rem;
      --_line-height: 1rem;
    }
    // A button at the end is one size step lower than the field: a quarter of a rem from the edge.
    &--end-action .text-input__field {
      padding-right: var(--_pad-end);
    }

    &--ghost:not(.text-input--inset) .text-input__field {
      padding: 0;
      border-radius: 0;
    }
    // A flush subtle is the box of a filled field moved left by its padding: the text stays flush, the fill has room.
    &--subtle:not(.text-input--inset) .text-input__field {
      margin: 0 var(--_pad) 0 calc(-1 * var(--_pad));
      padding: 0 var(--_pad);
      border-radius: var(--_radius);
    }
    // A button at the end keeps the right edge of the place, so it lines up with the buttons of the fields around.
    &--subtle.text-input--end-action:not(.text-input--inset) .text-input__field {
      margin-right: 0;
      padding-right: var(--_pad-end);
    }

    // Title typography, the scale of the titles it replaces.
    &--heading.text-input--large {
      --_font-size: 1.5rem;
      --_font-weight: 500;
      --_line-height: 2rem;
    }
    &--heading.text-input--medium {
      --_font-size: 1.25rem;
      --_font-weight: 400;
      --_line-height: 1.75rem;
    }
    &--heading.text-input--small {
      --_font-size: 1rem;
      --_font-weight: 500;
      --_line-height: 1.5rem;
    }

    // The label sits in the middle of the empty field and moves up on focus or with a value.
    &--floating {
      .text-input__input {
        padding-top: var(--spacing-2);
      }
      .text-input__floating {
        position: absolute;
        top: 50%;
        left: 0;
        max-width: 100%;
        overflow: hidden;
        font-size: 0.875rem;
        line-height: 1.25rem;
        white-space: nowrap;
        text-overflow: ellipsis;
        color: var(--global-secondary-TextColor);
        transform: translateY(-50%);
        transition:
          top 0.15s,
          font-size 0.15s;
        pointer-events: none;
        user-select: none;
      }
      &.text-input--filled .text-input__floating,
      .text-input__control:focus-within .text-input__floating {
        top: var(--spacing-1_5);
        font-size: 0.75rem;
        line-height: 1rem;
        transform: none;
      }
    }

    &--error {
      &.text-input--secondary,
      &.text-input--inset {
        --_border: var(--input-error-BorderColor);
      }
      // A flush ghost becomes the box of a filled field moved left by its padding, so the text does not move.
      &.text-input--ghost:not(.text-input--inset) .text-input__field {
        --_border: var(--input-error-BorderColor);
        margin: 0 var(--_pad) 0 calc(-1 * var(--_pad));
        padding: 0 var(--_pad);
        border-radius: var(--_radius);
      }
      &.text-input--ghost.text-input--end-action:not(.text-input--inset) .text-input__field {
        margin-right: 0;
        padding-right: var(--_pad-end);
      }
    }
    &--readonly .text-input__field {
      cursor: default;
    }
    &--disabled {
      .text-input__field {
        color: var(--button-disabled-LabelColor);
        cursor: not-allowed;
      }
      // No outline, as on a disabled button: only an enabled field is a box to type into.
      &.text-input--secondary {
        --_border: transparent;
        --_bg: var(--button-disabled-BackgroundColor);
      }
      .text-input__icon {
        color: var(--button-disabled-IconColor);
      }
      .text-input__input {
        cursor: not-allowed;

        &::placeholder {
          color: var(--button-disabled-LabelColor);
        }
      }
    }

    &--full-width {
      display: flex;
      width: 100%;
    }
  }
</style>
