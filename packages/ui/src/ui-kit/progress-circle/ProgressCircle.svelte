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
  import type { ProgressCircleProps, ProgressCircleSize } from './types'

  type $$Props = ProgressCircleProps

  export let value: number
  export let min: number = 0
  export let max: number = 100
  export let size: ProgressCircleSize | undefined = undefined

  // A value not yet known (NaN from an empty division) counts as the start of the range.
  $: now = Number.isFinite(value) ? Math.min(Math.max(value, min), max) : min
  // An empty range (no approvals required) draws an empty ring instead of dividing by zero.
  $: percent = max > min ? ((now - min) / (max - min)) * 100 : 0
</script>

<svg
  class="progress-circle progress-circle--{size ?? 'small'}"
  viewBox="0 0 16 16"
  fill="none"
  role="progressbar"
  aria-valuemin={min}
  aria-valuemax={max}
  aria-valuenow={now}
  {...$$restProps}
>
  <circle class="progress-circle__track" cx="8" cy="8" r="7" />
  <circle
    class="progress-circle__arc"
    class:progress-circle__arc--empty={percent === 0}
    cx="8"
    cy="8"
    r="7"
    pathLength="100"
    stroke-dasharray="{percent} 100"
  />
</svg>

<style lang="scss">
  .progress-circle {
    flex-shrink: 0;

    &__track,
    &__arc {
      stroke-width: 2px;
    }
    &__track {
      // The pale divider tone of the legacy ring: the track stays quiet beside the brand arc.
      stroke: color-mix(in srgb, var(--theme-divider-color) 50%, transparent);
    }
    // The soft blue-violet of the legacy ring: calmer than the brand next to small counters.
    &__arc {
      stroke: var(--primary-bg-color);
      stroke-linecap: round;
      // From twelve o'clock, clockwise.
      transform: rotate(-90deg);
      transform-origin: center;
      transition:
        stroke-dasharray 0.3s ease,
        opacity 0.3s ease;
    }
    // A round cap would leave a dot at zero.
    &__arc--empty {
      opacity: 0;
    }

    &--small {
      width: 1rem;
      height: 1rem;
    }
    &--extra-small {
      width: 0.75rem;
      height: 0.75rem;
    }
  }
</style>
