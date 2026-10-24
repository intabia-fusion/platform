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
  import type { ProgressBarKind, ProgressBarProps, ProgressBarSegment, ProgressBarSize } from './types'

  type $$Props = ProgressBarProps

  export let value: number = 0
  export let segments: ProgressBarSegment[] | undefined = undefined
  export let min: number = 0
  export let max: number = 100
  export let kind: ProgressBarKind | undefined = undefined
  export let size: ProgressBarSize | undefined = undefined

  // A value not yet known (NaN from an empty division) counts as the start of the range.
  function clamp (v: number, min: number, max: number): number {
    return Number.isFinite(v) ? Math.min(Math.max(v, min), max) : min
  }

  // An empty range (a limit of 0) draws an empty bar instead of dividing by zero.
  function percent (v: number, min: number, max: number): number {
    return max > min ? ((clamp(v, min, max) - min) / (max - min)) * 100 : 0
  }

  function layout (
    items: ProgressBarSegment[],
    min: number,
    max: number
  ): Array<ProgressBarSegment & { width: number }> {
    let left = 100
    return items
      .filter((it) => Number.isFinite(it.value) && it.value > min)
      .map((it) => {
        const width = Math.min(percent(it.value, min, max), left)
        left -= width
        return { ...it, width }
      })
  }

  $: now = clamp(value, min, max)
  $: fill = percent(value, min, max)
  $: parts = segments !== undefined ? layout(segments, min, max) : []
  // A composite bar is a picture only with a name; without one its numbers speak for themselves.
  $: named = $$restProps['aria-label'] !== undefined || $$restProps['aria-labelledby'] !== undefined
</script>

{#if segments !== undefined}
  <div class="progress-bar progress-bar--{size ?? 'small'}" role={named ? 'img' : undefined} {...$$restProps}>
    {#each parts as part}
      <div class="progress-bar__segment" style:width="{part.width}%" style:background-color={part.color}>
        {#if size === 'large'}<span class="progress-bar__value">{part.value}</span>{/if}
      </div>
    {/each}
  </div>
{:else}
  <div
    class="progress-bar progress-bar--{size ?? 'small'} progress-bar--{kind ?? 'brand'}"
    role="progressbar"
    aria-valuemin={min}
    aria-valuemax={max}
    aria-valuenow={now}
    {...$$restProps}
  >
    <div class="progress-bar__segment progress-bar__fill" style:width="{fill}%" />
  </div>
{/if}

<style lang="scss">
  .progress-bar {
    display: flex;
    overflow: hidden;
    width: 100%;
    background-color: var(--button-tertiary-hover-BackgroundColor);

    &__segment {
      display: flex;
      flex-shrink: 0;
      align-items: center;
      min-width: 0;
      height: 100%;
      transition: width 0.3s ease;
    }
    &__fill {
      background-color: var(--_fill);
    }
    &__value {
      overflow: hidden;
      padding: 0 var(--spacing-1);
      font-size: 0.875rem;
      font-weight: 500;
      line-height: 1.25rem;
      white-space: nowrap;
      color: var(--global-primary-TextColor);
    }

    &--small {
      height: 0.25rem;
      border-radius: var(--min-BorderRadius);
    }
    &--large {
      height: 1.5rem;
      border-radius: var(--extra-small-BorderRadius);
    }

    &--brand {
      --_fill: var(--button-brand-BackgroundColor);
    }
    &--positive {
      --_fill: var(--button-positive-BackgroundColor);
    }
    &--warning {
      --_fill: var(--theme-warning-color);
    }
    &--negative {
      --_fill: var(--button-negative-BackgroundColor);
    }
  }
</style>
