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
  import { onDestroy } from 'svelte'

  import { lazyObserver } from '../../lazy'
  import ui from '../../plugin'
  import IconButton from '../button/IconButton.svelte'
  import { formatMediaDuration } from '../file/format'
  import { loadDuration } from './duration'
  import { loadWaveform, MAX_WAVEFORM_BYTES, MAX_WAVEFORM_SECONDS } from './peaks'
  import { playbackOf, sharedPlayback } from './playback'
  import type { Playback, WaveformData } from './types'
  import RateButton from './RateButton.svelte'
  import SeekLine from './SeekLine.svelte'
  import Waveform from './Waveform.svelte'

  export let id: string
  export let src: string
  export let size: number = 0
  /** Known before playing for a recording; a file learns it from its waveform or its header. */
  export let duration: number | undefined = undefined
  export let playback: Playback = sharedPlayback()

  let wave: WaveformData | undefined
  let waveFailed = false
  let probed: number | undefined
  let seen = false
  // The file asked for, not a flag: a bar given another recording loads that one.
  let requestedFor: string | undefined

  let alive = true
  onDestroy(() => {
    alive = false
  })

  $: length = duration ?? probed
  // An unknown size is not a small one: the decode reads the whole file.
  $: withWave = size > 0 && size <= MAX_WAVEFORM_BYTES && (length == null || length <= MAX_WAVEFORM_SECONDS)
  $: player = playbackOf(playback, id)
  $: active = $player.active
  $: playing = $player.playing
  $: total = $player.duration > 0 ? $player.duration : (length ?? wave?.duration)
  $: progress = total != null && total > 0 ? $player.time / total : 0
  // One figure in one place: the length at rest, the position while it plays, so the bar never jumps.
  $: elapsed = formatMediaDuration($player.time) ?? '0:00'
  $: time = $player.time > 0 ? elapsed : formatMediaDuration(total)
  $: valueText = `${elapsed} / ${formatMediaDuration(total) ?? '–'}`

  $: resetWave(src)
  // Decoding fetches the whole file, so only the players scrolled into view do it.
  $: if (seen && requestedFor !== src) load(src)

  function resetWave (_: string): void {
    wave = undefined
    waveFailed = false
    probed = undefined
  }

  function load (url: string): void {
    requestedFor = url
    if (!withWave) {
      void probe(url)
      return
    }
    if (duration != null) {
      decode(url)
      return
    }
    // The header first: a long low-bitrate file passes the byte cap but would decode to hundreds of megabytes.
    void probe(url).then((result) => {
      if (url === src && (result == null || result <= MAX_WAVEFORM_SECONDS)) decode(url)
    })
  }

  function decode (url: string): void {
    void loadWaveform(id, url, () => alive).then((result) => {
      if (url !== src) return
      wave = result
      waveFailed = result == null
      if (result == null) void probe(url)
    })
  }

  // Without a wave the length is still shown at rest, not only once it plays.
  async function probe (url: string): Promise<number | undefined> {
    if (duration != null) return duration
    const result = await loadDuration(id, url)
    if (alive && url === src) probed = result
    return result
  }

  function toggle (): void {
    playback.toggle(id, src, total)
  }

  function onSeek (e: CustomEvent<number>): void {
    if (!active) toggle()
    playback.seek(e.detail)
  }
</script>

<div class="audio-bar" class:active use:lazyObserver={(visible) => (seen ||= visible)}>
  <IconButton
    icon={playing ? ui.icon.PauseFill : ui.icon.PlayFill}
    kind="secondary"
    size="medium"
    shape="round"
    tooltip={{ label: playing ? ui.string.Pause : ui.string.Play }}
    on:click={toggle}
  />
  <span class="body">
    <span class="track">
      {#if withWave && !waveFailed}
        <Waveform
          peaks={wave?.peaks}
          {progress}
          active={active || progress > 0}
          duration={total}
          {valueText}
          on:seek={onSeek}
        />
      {:else}
        <SeekLine {progress} duration={total} {valueText} on:seek={onSeek} />
      {/if}
    </span>
    <span class="time">{time ?? ''}</span>
  </span>
  <span class="rate-slot"><RateButton {playback} /></span>
</div>

<style lang="scss">
  // Fixed width so a speed appearing or changing never moves the waveform.
  .rate-slot {
    display: flex;
    flex-shrink: 0;
    align-self: flex-start;
    align-items: center;
    justify-content: flex-end;
    width: 2.8125rem;
    height: 1.5rem;
    // The button's own padding already keeps the speed off the line.
    margin-left: -0.375rem;
  }

  // Shown on hover too: the speed can be set before playing.
  .audio-bar:not(.active):not(:hover):not(:focus-within) .rate-slot {
    visibility: hidden;
  }

  .audio-bar {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    min-width: 0;
  }

  .body {
    display: flex;
    flex-direction: column;
    flex-grow: 1;
    min-width: 0;
  }

  .track {
    display: flex;
    align-items: center;
    min-width: 0;
    height: 1.5rem;
  }

  .time {
    height: 1rem;
    font-size: 0.75rem;
    line-height: 1rem;
    font-variant-numeric: tabular-nums;
    color: var(--theme-dark-color);
  }
</style>
