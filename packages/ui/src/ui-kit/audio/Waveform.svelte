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

  import { WAVEFORM_BARS } from './peaks'
  import { seekable } from './seek'

  /** `undefined` while decoding: a flat line holds the place. */
  export let peaks: number[] | undefined
  export let progress: number = 0
  export let active: boolean = false
  export let duration: number | undefined = undefined
  export let valueText: string | undefined = undefined

  const dispatch = createEventDispatcher<{ seek: number }>()
  const flat = new Array<number>(WAVEFORM_BARS).fill(0.1)

  $: bars = peaks ?? flat
  // A gentle curve lifts the quiet parts without flattening the shape of the speech.
  const shown = (peak: number): number => 0.1 + 0.9 * Math.pow(Math.min(Math.max(peak, 0), 1), 0.8)
</script>

<div
  class="waveform"
  class:active
  class:pending={peaks == null}
  use:seekable={{ progress, duration, valueText, onSeek: (to) => dispatch('seek', to) }}
>
  {#each bars as bar, i}
    <span
      class="bar"
      class:played={active && (i + 0.5) / bars.length <= progress}
      style:height={peaks == null ? undefined : `${shown(bar) * 100}%`}
    />
  {/each}
</div>

<style lang="scss">
  .waveform {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.125rem;
    width: 100%;
    min-width: 0;
    max-width: var(--waveform-max-width, 15rem);
    overflow: hidden;
    height: 1.5rem;
    border-radius: 0.125rem;
    cursor: pointer;

    &:focus-visible {
      outline: 0.125rem solid var(--global-focus-BorderColor);
      outline-offset: 0.125rem;
    }
  }

  .bar {
    // Bars thin out in a narrow card instead of running under the time.
    flex: 0 1 0.25rem;
    min-width: 1px;
    height: 0.25rem;
    min-height: 0.25rem;
    border-radius: 0.125rem;
    background-color: color-mix(in srgb, var(--theme-caption-color) 26%, transparent);
    transition:
      height 0.25s ease,
      background-color 0.1s ease;
  }

  .active .bar {
    background-color: color-mix(in srgb, var(--theme-caption-color) 34%, transparent);
  }

  .active .bar.played {
    background-color: var(--theme-caption-color);
  }

  .pending .bar {
    background-color: color-mix(in srgb, var(--theme-caption-color) 16%, transparent);
  }
</style>
