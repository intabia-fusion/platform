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
  import { translateCB } from '@hcengineering/platform'
  import { languageStore } from '@hcengineering/theme'
  import { afterUpdate, createEventDispatcher, onMount } from 'svelte'

  import { registerFocus } from '../../focus'
  import type { TextAreaEvents, TextAreaKind, TextAreaProps, TextAreaSize } from './types'

  type $$Props = TextAreaProps
  type $$Events = TextAreaEvents

  export let value: string | undefined = undefined
  export let placeholder: IntlString | undefined = undefined
  export let placeholderParams: Record<string, any> | undefined = undefined
  export let kind: TextAreaKind | undefined = undefined
  export let size: TextAreaSize | undefined = undefined
  export let rows: number = 3
  export let maxRows: number | undefined = undefined
  export let maxlength: number | undefined = undefined
  export let disabled: boolean = false
  export let readonly: boolean = false
  export let error: boolean = false
  export let inset: boolean = false
  export let autofocus: boolean = false
  export let focusIndex: number | undefined = undefined
  export let id: string | undefined = undefined
  export let name: string | undefined = undefined

  const dispatch = createEventDispatcher<{ input: string, change: string }>()

  let textarea: HTMLTextAreaElement | undefined
  let placeholderText = ''

  $: resolvedKind = kind ?? 'secondary'
  $: resolvedSize = size ?? 'small'
  $: if (placeholder !== undefined) {
    translateCB(placeholder, placeholderParams ?? {}, $languageStore === '' ? undefined : $languageStore, (text) => {
      placeholderText = text
    })
  } else {
    placeholderText = ''
  }
  $: accessibleName =
    $$restProps['aria-labelledby'] !== undefined
      ? undefined
      : ($$restProps['aria-label'] ?? (placeholderText !== '' ? placeholderText : undefined))
  $: dataAttributes = Object.fromEntries(Object.entries($$restProps).filter(([key]) => key.startsWith('data-')))

  // Height follows the text; min-height and max-height in CSS keep it within rows..maxRows.
  function fit (): void {
    if (textarea === undefined) return
    textarea.style.height = 'auto'
    // scrollHeight does not include the border, which a limited field uses as its vertical inset.
    textarea.style.height = `${textarea.scrollHeight + textarea.offsetHeight - textarea.clientHeight}px`
  }

  export function focus (): void {
    textarea?.focus()
  }

  export function select (): void {
    textarea?.select()
  }

  function handleInput (): void {
    if (textarea === undefined) return
    // The new value updates the component, and afterUpdate fits the height.
    value = textarea.value
    dispatch('input', value)
  }

  const { idx, focusManager } = registerFocus(focusIndex ?? -1, {
    focus: () => {
      if (disabled || textarea === undefined) return false
      textarea.focus()
      return true
    },
    isFocus: () => document.activeElement === textarea
  })
  $: if (idx !== -1) focusManager?.updateFocus(idx, focusIndex ?? -1)

  function handleFocus (): void {
    if (idx !== -1) focusManager?.setFocus(idx)
  }

  afterUpdate(fit)

  onMount(() => {
    if (autofocus) textarea?.focus()
    // The width the text wraps in changes with the place.
    let frame = 0
    let width = textarea?.clientWidth
    // The fit changes the height of the observed element: refit in the next frame, and only when the width changed.
    const observer = new ResizeObserver(() => {
      if (textarea === undefined || textarea.clientWidth === width) return
      width = textarea.clientWidth
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(fit)
    })
    if (textarea !== undefined) observer.observe(textarea)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  })
</script>

<textarea
  bind:this={textarea}
  class="text-area text-area--{resolvedKind} text-area--{resolvedSize}"
  class:text-area--ghost={resolvedKind === 'ghost' || resolvedKind === 'subtle'}
  class:text-area--error={error}
  class:text-area--inset={inset}
  class:text-area--limited={maxRows !== undefined}
  style:--_rows={rows}
  style:--_max-rows={maxRows}
  {id}
  {name}
  value={value ?? ''}
  placeholder={placeholderText}
  {maxlength}
  {disabled}
  {readonly}
  {rows}
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

<style lang="scss">
  .text-area {
    display: block;
    box-sizing: border-box;
    width: 100%;
    min-height: calc(var(--_rows) * var(--_line-height) + 2 * var(--_pad-y));
    margin: 0;
    padding: var(--_pad-y) var(--_pad-x);
    border: none;
    border-radius: var(--small-BorderRadius);
    outline: none;
    box-shadow: inset 0 0 0 1px var(--_border);
    background-color: var(--_bg);
    font-family: var(--font-family);
    font-size: var(--_font-size);
    font-weight: var(--_font-weight);
    line-height: var(--_line-height);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    color: var(--global-primary-TextColor);
    caret-color: var(--global-focus-BorderColor);
    resize: none;
    overflow-y: hidden;
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-bar-color) transparent;

    &::placeholder {
      color: var(--global-secondary-TextColor);
    }
    &--limited {
      max-height: calc(var(--_max-rows) * var(--_line-height) + 2 * var(--_pad-y));
      overflow-y: auto;
    }

    // Kinds
    &--secondary {
      --_border: var(--input-BorderColor, transparent);
      --_bg: var(--input-BackgroundColor);
      --_pad-x: var(--spacing-1_5);
      --_pad-y: var(--spacing-0_75);

      &:not(:disabled, :read-only):hover {
        --_bg: var(--input-hover-BackgroundColor);
      }
      &:focus {
        outline: 2px solid var(--global-focus-BorderColor);
        outline-offset: 2px;
      }
      // No outline, as on a disabled button: only an enabled field is a box to type into.
      &:disabled {
        --_border: transparent;
        --_bg: var(--button-disabled-BackgroundColor);
      }
      // The inset is a border, outside the scrolled area: the line behind the last visible one does not show in it.
      &.text-area--limited {
        padding-block: 0;
        border-block: var(--_pad-y) solid transparent;
        box-shadow: none;
        outline: 1px solid var(--_border);
        outline-offset: -1px;

        &:focus {
          outline: 2px solid var(--global-focus-BorderColor);
          outline-offset: 2px;
        }
      }
    }
    // A ghost field stays clear in focus, as the legacy ones: the caret shows where the text goes.
    &--ghost {
      --_border: transparent;
      --_bg: transparent;
      --_pad-x: 0;
      --_pad-y: 0;
      border-radius: 0;

      &:not(:disabled, :read-only):hover:not(:focus)::placeholder {
        color: var(--global-primary-TextColor);
      }
      &.text-area--inset {
        --_pad-x: var(--spacing-2);
        --_pad-y: var(--spacing-0_75);
        border-radius: var(--medium-BorderRadius);
      }
    }

    // A ghost that shows the hover fill of a field and becomes a field in focus: fill and ring.
    &--subtle:not(:disabled, :read-only):hover {
      --_bg: var(--input-hover-BackgroundColor);
    }
    &--subtle:not(:disabled, :read-only):focus {
      --_bg: var(--input-BackgroundColor);
      outline: 2px solid var(--global-focus-BorderColor);
      outline-offset: 2px;
    }
    // A flush subtle is the box of a filled field, its padding taken back by margins: the text stays flush.
    &--subtle:not(.text-area--inset) {
      --_pad-x: var(--spacing-1_5);
      --_pad-y: var(--spacing-0_75);
      margin: calc(-1 * var(--_pad-y)) 0 calc(-1 * var(--_pad-y)) calc(-1 * var(--_pad-x));
      border-radius: var(--small-BorderRadius);
    }

    // Sizes
    &--small {
      --_font-size: 0.875rem;
      --_font-weight: 400;
      --_line-height: 1.25rem;
    }
    &--medium {
      --_font-size: 1rem;
      --_font-weight: 400;
      --_line-height: 1.5rem;
    }

    &--error {
      &.text-area--secondary:not(:disabled) {
        --_border: var(--input-error-BorderColor);
      }
      &.text-area--inset:not(:disabled) {
        --_border: var(--input-error-BorderColor);
      }
      // A flush ghost becomes the box of a filled field, its padding taken back by margins, so the text does not move.
      &.text-area--ghost:not(.text-area--inset) {
        --_border: var(--input-error-BorderColor);
        --_pad-x: var(--spacing-1_5);
        --_pad-y: var(--spacing-0_75);
        margin: calc(-1 * var(--_pad-y)) 0 calc(-1 * var(--_pad-y)) calc(-1 * var(--_pad-x));
        border-radius: var(--small-BorderRadius);
      }
    }
    &:read-only {
      cursor: default;
    }
    &:disabled {
      color: var(--button-disabled-LabelColor);
      cursor: not-allowed;

      &::placeholder {
        color: var(--button-disabled-LabelColor);
      }
    }
  }
</style>
