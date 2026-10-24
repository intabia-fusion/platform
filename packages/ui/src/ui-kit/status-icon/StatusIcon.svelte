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
  import { tooltip as tooltipAction } from '../../tooltips'
  import type { LabelAndProps } from '../../types'
  import type { StatusIconKind, StatusIconProps, StatusIconSize, StatusIconTone } from './types'

  type $$Props = StatusIconProps

  export let tone: StatusIconTone
  export let kind: StatusIconKind | undefined = undefined
  export let size: StatusIconSize | undefined = undefined
  export let dot: boolean = false
  export let tooltip: LabelAndProps | undefined = undefined

  $: named = $$restProps['aria-label'] !== undefined
</script>

<span
  class="status-icon status-icon--{tone} status-icon--{size ?? 'small'} status-icon--{kind ?? 'solid'}"
  class:status-icon--dot={dot}
  role={named ? 'img' : undefined}
  aria-hidden={named ? undefined : 'true'}
  use:tooltipAction={tooltip}
  {...$$restProps}
>
  {#if dot}
    <span class="status-icon__dot" />
  {:else}
    <svg class="status-icon__svg" viewBox="0 0 16 16" aria-hidden="true">
      <circle class="status-icon__circle" cx="8" cy="8" r="7" />
      {#if tone === 'positive'}
        <polygon class="status-icon__glyph" points="7.2,11.4 4.3,8.5 5.3,7.5 7.1,9.3 10.6,5.1 11.7,6 " />
      {:else if tone === 'negative' || tone === 'error'}
        <polygon
          class="status-icon__glyph"
          points="11.1,5.8 10.2,4.9 8,7.1 5.8,4.9 4.9,5.8 7.1,8 4.9,10.2 5.8,11.1 8,8.9 10.2,11.1 11.1,10.2 8.9,8 "
        />
      {:else if tone === 'warning'}
        <path
          class="status-icon__glyph"
          d="M7.3,4h1.4l-0.2,5.2H7.5L7.3,4z M8,12.1c-0.5,0-0.9-0.4-0.9-0.9s0.4-0.9,0.9-0.9s0.9,0.4,0.9,0.9 S8.5,12.1,8,12.1z"
        />
      {:else if tone === 'info'}
        <path
          class="status-icon__glyph"
          d="M8.7,12H7.3V6.8h1.4V12z M8,3.9c0.5,0,0.9,0.4,0.9,0.9S8.5,5.7,8,5.7S7.1,5.3,7.1,4.8S7.5,3.9,8,3.9z"
        />
      {:else}
        <path
          class="status-icon__glyph"
          d="M7.3,9.3h1.3V9c0.1-0.5,0.6-0.9,1.1-1.4c0.4-0.4,0.8-0.9,0.8-1.6c0-1.1-0.8-1.8-2.2-1.8c-1.4,0-2.4,0.8-2.5,2.2h1.4c0.1-0.6,0.4-1,1-1C8.8,5.4,9,5.7,9,6.2c0,0.4-0.3,0.7-0.7,1.1c-0.5,0.5-1,0.9-1,1.7V9.3z M8,11.6c0.5,0,0.9-0.4,0.9-0.9c0-0.5-0.4-0.9-0.9-0.9c-0.5,0-0.9,0.4-0.9,0.9C7.1,11.2,7.5,11.6,8,11.6z"
        />
      {/if}
    </svg>
  {/if}
</span>

<style lang="scss">
  .status-icon {
    display: inline-flex;
    flex-shrink: 0;
    justify-content: center;
    align-items: center;
    width: var(--_size);
    height: var(--_size);
    vertical-align: middle;

    &__svg {
      width: 100%;
      height: 100%;
    }
    &__circle {
      fill: var(--_bg);
    }
    &__glyph {
      fill: var(--_glyph);
    }
    &__dot {
      width: 0.5rem;
      height: 0.5rem;
      border-radius: 50%;
      background-color: var(--_bg);
    }

    &--positive {
      --_bg: var(--button-positive-BackgroundColor);
      --_glyph: var(--button-positive-LabelColor);
    }
    &--negative {
      --_bg: var(--button-negative-BackgroundColor);
      --_glyph: var(--button-negative-IconColor);
    }
    // The red of every error in the kit, not the red of a dangerous action.
    &--error {
      --_bg: var(--global-error-TextColor);
      --_glyph: var(--button-negative-IconColor);
    }
    &--warning {
      --_bg: var(--theme-warning-color);
      --_glyph: var(--global-on-accent-TextColor);
    }
    &--info {
      --_bg: var(--kit-button-primary-BackgroundColor);
      --_glyph: var(--kit-button-primary-LabelColor);
    }
    &--neutral {
      --_bg: var(--global-tertiary-TextColor);
      --_glyph: var(--global-on-accent-TextColor);
    }

    // Quieter than the filled one: a paler shade of the tone; the ring stays inside the 16 box (7 + 1.25 / 2).
    &--outline {
      --_line: color-mix(in srgb, var(--_bg) 60%, transparent);

      .status-icon__circle {
        fill: none;
        stroke: var(--_line);
        stroke-width: 1.25;
      }
      .status-icon__glyph {
        fill: var(--_line);
      }
    }

    &--small {
      --_size: 1rem;
    }
    &--medium {
      --_size: 1.25rem;
    }
  }
</style>
