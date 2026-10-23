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
  import { translate } from '@hcengineering/platform'
  import { themeStore } from '@hcengineering/theme'
  import { derived } from 'svelte/store'

  import ui from '../../plugin'
  import { tooltip } from '../../tooltips'
  import { sharedPlayback } from './playback'
  import type { Playback } from './types'

  export let playback: Playback = sharedPlayback()

  // Only the speed: the ticks of the time do not reach the button.
  $: rate = derived(playback, (s) => s.rate)
  $: text = `${new Intl.NumberFormat($themeStore.language, { maximumFractionDigits: 2 }).format($rate)}×`

  let speed = ''
  $: void translate(ui.string.PlaybackSpeed, {}, $themeStore.language).then((res) => (speed = res))
</script>

<button
  class="rate-button"
  type="button"
  aria-label={`${speed} ${text}`}
  use:tooltip={{ label: ui.string.PlaybackSpeed }}
  on:click|stopPropagation={() => {
    playback.cycleRate()
  }}
>
  {text}
</button>

<style lang="scss">
  .rate-button {
    flex-shrink: 0;
    height: 1.5rem;
    margin: 0;
    padding: 0 0.375rem;
    border: none;
    border-radius: 0.375rem;
    font: inherit;
    font-size: 0.75rem;
    font-weight: 600;
    line-height: 1rem;
    font-variant-numeric: tabular-nums;
    color: var(--theme-caption-color);
    background-color: transparent;
    cursor: pointer;
    transition: background-color 0.15s ease;

    &:hover {
      background-color: color-mix(in srgb, var(--theme-caption-color) 8%, transparent);
    }

    &:focus-visible {
      outline: 0.125rem solid var(--global-focus-BorderColor);
      outline-offset: 0.0625rem;
    }
  }
</style>
