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
  import { createEventDispatcher, onMount } from 'svelte'

  import IconAdd from '../../components/icons/Add.svelte'
  import { registerFocus } from '../../focus'
  import ui from '../../plugin'
  import IconButton from '../button/IconButton.svelte'
  import type { ButtonSize } from '../button/types'
  import IconMinus from './IconMinus.svelte'
  import type { NumberInputEvents, NumberInputProps, NumberInputSize } from './types'

  type $$Props = NumberInputProps
  type $$Events = NumberInputEvents

  export let value: number | undefined = undefined
  export let min: number | undefined = undefined
  export let max: number | undefined = undefined
  export let step: number = 1
  export let fractionDigits: number | undefined = undefined
  export let placeholder: IntlString | undefined = undefined
  export let placeholderParams: Record<string, any> | undefined = undefined
  export let size: NumberInputSize | undefined = undefined
  export let fullWidth: boolean = false
  export let disabled: boolean = false
  export let autofocus: boolean = false
  export let focusIndex: number | undefined = undefined

  const dispatch = createEventDispatcher<{ change: number | null }>()

  // One step smaller than the field, so the steppers sit inside it with an even margin.
  const stepperSizes: Record<NumberInputSize, ButtonSize> = {
    large: 'medium',
    medium: 'small',
    small: 'extra-small',
    'extra-small': 'min'
  }

  let input: HTMLInputElement | undefined
  let text = format(value)
  let committed = value
  let placeholderText = ''

  $: resolvedSize = size ?? 'small'
  $: syncText(value)
  $: if (placeholder !== undefined) {
    translateCB(placeholder, placeholderParams ?? {}, $languageStore === '' ? undefined : $languageStore, (res) => {
      placeholderText = res
    })
  } else {
    placeholderText = ''
  }
  $: chars = Math.max(text.length, placeholderText.length, 1)
  $: canDecrease = !disabled && (min === undefined || value === undefined || value > min)
  $: canIncrease = !disabled && (max === undefined || value === undefined || value < max)

  function format (v: number | undefined): string {
    return v === undefined || Number.isNaN(v) ? '' : String(v)
  }

  function parse (t: string): number | undefined {
    if (t.trim() === '') return undefined
    const n = Number(t)
    return Number.isNaN(n) ? undefined : n
  }

  // A value set by the place shows in the field; one typed there is left as typed until commit.
  function syncText (v: number | undefined): void {
    if (parse(text) === v) return
    text = format(v)
    committed = v
  }

  function normalize (v: number | undefined): number | undefined {
    if (v === undefined) return undefined
    // 15 significant digits drop the float noise of steps such as 0.1 + 0.2; integers are exact and stay as they are.
    let n =
      fractionDigits !== undefined
        ? Number(v.toFixed(fractionDigits))
        : Number.isInteger(v)
          ? v
          : Number(v.toPrecision(15))
    if (min !== undefined && n < min) n = min
    if (max !== undefined && n > max) n = max
    return n
  }

  function commit (v: number | undefined): void {
    value = normalize(v)
    text = format(value)
    if (input !== undefined) input.value = text
    // Enter is followed by the native change: one commit, one event.
    if (value === committed) return
    committed = value
    dispatch('change', value ?? null)
  }

  function stepBy (direction: 1 | -1): void {
    commit((value ?? 0) + direction * step)
  }

  function handleInput (): void {
    if (input === undefined) return
    text = input.value
    value = parse(text)
  }

  function handleKeydown (event: KeyboardEvent): void {
    // Own stepping, so the arrows round and clamp like the buttons and report `change` once.
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      stepBy(event.key === 'ArrowUp' ? 1 : -1)
    } else if (event.key === 'Enter' && input !== undefined) {
      commit(parse(input.value))
    }
  }

  export function focus (): void {
    input?.focus()
  }

  export function select (): void {
    input?.select()
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

<span
  class="number-input number-input--{resolvedSize}"
  class:number-input--full-width={fullWidth}
  class:number-input--disabled={disabled}
  style:--_chars={chars}
>
  <!-- Arrow keys step the field, so the steppers stay out of the Tab order, as in a native spin button. -->
  <IconButton
    tabindex={-1}
    kind="ghost"
    size={stepperSizes[resolvedSize]}
    icon={IconMinus}
    tooltip={{ label: ui.string.Decrease }}
    disabled={!canDecrease}
    on:click={() => {
      stepBy(-1)
    }}
  />
  <input
    bind:this={input}
    class="number-input__input"
    type="number"
    value={text}
    {min}
    {max}
    {step}
    {disabled}
    placeholder={placeholderText}
    aria-label={$$restProps['aria-labelledby'] !== undefined ? undefined : $$restProps['aria-label']}
    aria-labelledby={$$restProps['aria-labelledby']}
    aria-describedby={$$restProps['aria-describedby']}
    on:input={handleInput}
    on:change={() => {
      if (input !== undefined) commit(parse(input.value))
    }}
    on:keydown={handleKeydown}
    on:keydown
    on:focus={handleFocus}
    on:focus
    on:blur
  />
  <IconButton
    tabindex={-1}
    kind="ghost"
    size={stepperSizes[resolvedSize]}
    icon={IconAdd}
    tooltip={{ label: ui.string.Increase }}
    disabled={!canIncrease}
    on:click={() => {
      stepBy(1)
    }}
  />
</span>

<style lang="scss">
  .number-input {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    gap: var(--spacing-0_5);
    height: var(--_height);
    // The steppers are one size step (0.5rem) lower than the field: a quarter of a rem on each side.
    padding: 0 var(--spacing-0_5);
    border-radius: var(--_radius);
    box-shadow: inset 0 0 0 1px var(--input-BorderColor, transparent);
    background-color: var(--input-BackgroundColor);
    font-family: var(--font-family);
    font-size: 0.875rem;
    line-height: 1.25rem;
    color: var(--global-primary-TextColor);

    &:not(.number-input--disabled):hover {
      background-color: var(--input-hover-BackgroundColor);
    }
    // Only the input's own focus: a stepper draws its own ring.
    &:has(.number-input__input:focus) {
      outline: 2px solid var(--global-focus-BorderColor);
      outline-offset: 2px;
    }

    // The value fits its digits, and grows when the place stretches the field: the steppers go to the edges.
    &__input {
      flex: 1 1 auto;
      width: calc(var(--_chars) * 1ch + var(--spacing-0_5));
      min-width: 0;
      height: 100%;
      margin: 0;
      padding: 0;
      border: none;
      outline: none;
      background: transparent;
      font: inherit;
      font-variant-numeric: tabular-nums;
      text-align: center;
      color: inherit;
      caret-color: var(--global-focus-BorderColor);
      appearance: textfield;

      &::placeholder {
        color: var(--global-secondary-TextColor);
      }
      // The field has its own steppers.
      &::-webkit-outer-spin-button,
      &::-webkit-inner-spin-button {
        margin: 0;
        appearance: none;
      }
      &:disabled {
        color: var(--button-disabled-LabelColor);
        cursor: not-allowed;

        &::placeholder {
          color: var(--button-disabled-LabelColor);
        }
      }
    }

    // No outline, as on a disabled button: only an enabled field is a box to type into.
    &--disabled {
      box-shadow: none;
      background-color: var(--button-disabled-BackgroundColor);
      cursor: not-allowed;
    }
    &--full-width {
      display: flex;
      width: 100%;
    }

    // Sizes
    &--large {
      --_height: var(--global-large-Size);
      --_radius: var(--medium-BorderRadius);
    }
    &--medium {
      --_height: var(--global-medium-Size);
      --_radius: var(--medium-BorderRadius);
    }
    &--small {
      --_height: var(--global-small-Size);
      --_radius: var(--small-BorderRadius);
    }
    &--extra-small {
      --_height: var(--global-extra-small-Size);
      --_radius: var(--extra-small-BorderRadius);
      font-size: 0.75rem;
      line-height: 1rem;
    }
  }
</style>
