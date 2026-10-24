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

  import Label from '../../components/Label.svelte'
  import Spinner from '../../components/Spinner.svelte'
  import IconCheck from '../../components/icons/Check.svelte'
  import IconClose from '../../components/icons/Close.svelte'
  import ui from '../../plugin'
  import IconButton from '../button/IconButton.svelte'
  import { formatMediaDuration } from '../file/format'

  export let state: 'starting' | 'recording' | 'saving' = 'recording'
  export let elapsed: number = 0
  export let levels: number[] = []

  const dispatch = createEventDispatcher<{ discard: undefined, attach: undefined }>()

  $: time = formatMediaDuration(elapsed) ?? '0:00'

  // A bar and the gap after it, as drawn below.
  const PITCH_REM = 0.3125
  let waveWidth = 0
  $: fit = Math.floor(waveWidth / (PITCH_REM * rootFontSize()))
  // Silence pads the front so the line always runs the whole width.
  $: shown = fit > 0 ? [...new Array(Math.max(0, fit - levels.length)).fill(0), ...levels.slice(-fit)] : []

  function rootFontSize (): number {
    const size = parseFloat(getComputedStyle(document.documentElement).fontSize)
    return Number.isFinite(size) && size > 0 ? size : 16
  }
</script>

<div class="recorder">
  <IconButton
    icon={IconClose}
    kind="ghost"
    shape="round"
    size="small"
    iconSize="small"
    disabled={state === 'saving'}
    tooltip={{ label: ui.string.VoiceDiscard }}
    on:click={() => dispatch('discard')}
  />
  {#if state === 'starting'}
    <span class="status"><Spinner size="small" /><Label label={ui.string.VoiceStarting} /></span>
  {:else}
    <span class="dot" class:still={state === 'saving'} />
    <span class="time">{time}</span>
    <span class="wave" aria-hidden="true" bind:clientWidth={waveWidth}>
      {#each shown as level}
        <span class="bar" style:height="{Math.max(0.1875, Math.min(1, level) * 1.25)}rem" />
      {/each}
    </span>
  {/if}
  <IconButton
    icon={IconCheck}
    kind="secondary"
    shape="round"
    size="small"
    iconSize="small"
    loading={state === 'saving'}
    disabled={state === 'starting'}
    tooltip={{ label: ui.string.VoiceAttach }}
    on:click={() => dispatch('attach')}
  />
</div>

<style lang="scss">
  // A recording needs no more room than this, however wide the input.
  .recorder {
    display: flex;
    max-width: 24rem;
    align-items: center;
    gap: 0.625rem;
    min-width: 0;
    padding: 0.375rem;
    border-radius: var(--large-BorderRadius);
    background-color: color-mix(in srgb, var(--theme-caption-color) 5%, transparent);
    // A borderless check: a ring would outweigh the recording.
    --kit-button-secondary-BorderColor: transparent;
  }

  .status {
    display: flex;
    flex-grow: 1;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8125rem;
    color: var(--theme-dark-color);
  }

  .dot {
    flex-shrink: 0;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background-color: var(--global-error-TextColor);
    animation: pulse 1.2s ease-in-out infinite;

    &.still {
      animation: none;
    }
  }

  @keyframes pulse {
    50% {
      opacity: 0.3;
    }
  }

  .time {
    flex-shrink: 0;
    min-width: 2.25rem;
    font-weight: 500;
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
    color: var(--theme-caption-color);
  }

  .wave {
    display: flex;
    flex-grow: 1;
    align-items: center;
    justify-content: flex-end;
    gap: 0.125rem;
    min-width: 0;
    height: 1.5rem;
    overflow: hidden;
    mask-image: linear-gradient(to right, transparent, currentColor 3rem);
  }

  .bar {
    flex-shrink: 0;
    width: 0.1875rem;
    border-radius: 0.125rem;
    background-color: color-mix(in srgb, var(--theme-caption-color) 60%, transparent);
    transition: height 0.1s linear;
  }
</style>
