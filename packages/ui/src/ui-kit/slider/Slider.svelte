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
  import { createEventDispatcher } from 'svelte'

  import type { SliderEvents, SliderProps, SliderSize } from './types'

  type $$Props = SliderProps
  type $$Events = SliderEvents

  export let value: number = 0
  export let min: number = 0
  export let max: number = 100
  export let step: number | 'any' = 1
  export let size: SliderSize | undefined = undefined
  export let disabled: boolean = false
  export let showValue: boolean = false
  export let formatValue: ((value: number) => string) | undefined = undefined

  const dispatch = createEventDispatcher<{ input: number, change: number }>()

  // Defaults resolve here: a declaration default applies only at mount, a prop later set to undefined stays undefined.
  $: lo = min ?? 0
  $: hi = max ?? 100
  $: current = snap(Number.isFinite(value) ? Math.min(Math.max(value, lo), Math.max(lo, hi)) : lo, lo, hi, step)
  $: ratio = hi > lo ? (current - lo) / (hi - lo) : 0
  $: format = formatValue ?? String
  $: text = format(current)
  // Room for the longest end of the range, so the track does not jump while the value changes.
  $: valueWidth = showValue ? Math.max(format(lo).length, format(hi).length, text.length) : 0

  function decimals (num: number): number {
    const [mantissa, exponent] = String(num).split('e')
    return Math.max(0, (mantissa.split('.')[1]?.length ?? 0) - Number(exponent ?? 0))
  }

  // The native range rests on min + k * step and never above max; the fill and the text follow it.
  function snap (num: number, from: number, to: number, grid: number | 'any' | undefined): number {
    if (grid === 'any' || grid === undefined || !(grid > 0)) return num
    let steps = Math.round((num - from) / grid)
    if (from + steps * grid > to) steps -= 1
    return Number((from + Math.max(0, steps) * grid).toFixed(Math.min(20, Math.max(decimals(grid), decimals(from)))))
  }

  function handleInput (event: Event & { currentTarget: HTMLInputElement }): void {
    value = event.currentTarget.valueAsNumber
    dispatch('input', value)
  }

  function handleChange (event: Event & { currentTarget: HTMLInputElement }): void {
    dispatch('change', event.currentTarget.valueAsNumber)
  }
</script>

<div class="slider slider--{size ?? 'medium'}" class:slider--disabled={disabled}>
  <!-- min, max and step go before value: the native range clamps the value to the bounds it has at that moment. -->
  <input
    class="slider__input"
    type="range"
    min={lo}
    max={hi}
    step={step ?? 1}
    value={current}
    {disabled}
    aria-valuetext={formatValue !== undefined ? text : undefined}
    style:--_ratio={ratio}
    on:input={handleInput}
    on:change={handleChange}
    {...$$restProps}
  />
  {#if showValue}
    <span class="slider__value" aria-hidden="true" style:min-width="{valueWidth}ch">{text}</span>
  {/if}
</div>

<style lang="scss">
  @mixin thumb {
    &::-webkit-slider-thumb {
      @content;
    }
    &::-moz-range-thumb {
      @content;
    }
  }
  @mixin track {
    &::-webkit-slider-runnable-track {
      @content;
    }
    &::-moz-range-track {
      @content;
    }
  }

  .slider {
    display: flex;
    align-items: center;
    gap: var(--spacing-1);
    width: 100%;
    min-width: 0;

    --_track: var(--spacing-0_5);
    --_accent: var(--kit-button-primary-BackgroundColor);
    // Half of the tertiary text color: the track keeps 1.5:1 against the page in both themes, a plain tint does not.
    --_rest: color-mix(in srgb, var(--global-tertiary-TextColor) 50%, transparent);
    --_halo: var(--button-tertiary-hover-BackgroundColor);

    &__input {
      flex-grow: 1;
      min-width: 0;
      height: var(--_thumb);
      margin: 0;
      background: transparent;
      cursor: pointer;
      appearance: none;

      // The thumb center travels from half a thumb to the end minus half a thumb; the fill follows it.
      --_pos: calc(var(--_thumb) / 2 + (100% - var(--_thumb)) * var(--_ratio));

      &:focus {
        outline: none;
      }

      @include track {
        height: var(--_track);
        border: none;
        border-radius: var(--_track);
        background: linear-gradient(to right, var(--_accent) var(--_pos), var(--_rest) var(--_pos));
      }
      @include thumb {
        box-sizing: border-box;
        width: var(--_thumb);
        height: var(--_thumb);
        border: none;
        border-radius: 50%;
        background-color: var(--_accent);
        appearance: none;
      }
      &::-webkit-slider-thumb {
        // Centers the thumb on the track: the webkit thumb sits at the track top.
        margin-top: calc((var(--_track) - var(--_thumb)) / 2);
      }

      // The hover and pressed accent of the theme darken the small thumb: the reaction is a halo, the fill stays.
      @include thumb {
        transition: box-shadow 0.15s ease;
      }
      &:not(:disabled):is(:hover, :active) {
        @include thumb {
          box-shadow: 0 0 0 var(--spacing-0_5) var(--_halo);
        }
      }
      &:focus-visible {
        @include thumb {
          outline: 2px solid var(--global-focus-BorderColor);
          outline-offset: 2px;
        }
      }
      &:disabled {
        cursor: not-allowed;
      }
    }

    &__value {
      flex-shrink: 0;
      font-size: 0.875rem;
      font-variant-numeric: tabular-nums;
      line-height: 1.25rem;
      text-align: end;
      white-space: nowrap;
      color: var(--global-primary-TextColor);
    }

    &--medium {
      --_thumb: var(--spacing-2);
    }
    &--small {
      --_thumb: var(--spacing-1_5);

      .slider__value {
        font-size: 0.75rem;
        line-height: 1rem;
      }
    }

    // Neutral, as every disabled control: the grey fill still shows the position.
    &--disabled {
      --_accent: var(--global-disabled-TextColor);
      --_rest: var(--button-disabled-BackgroundColor);

      .slider__value {
        color: var(--global-disabled-TextColor);
      }
    }
  }
</style>
