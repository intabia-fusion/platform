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
  import { lazyObserver } from '../../lazy'
  import FileBadge from '../file/FileBadge.svelte'
  import { formatMediaDuration } from '../file/format'
  import type { FileBadgeData } from '../file/types'
  import { loadDuration } from './duration'

  export let id: string
  export let src: string
  export let badge: FileBadgeData
  /** Known for a recording; a file learns it from its header once the cover is seen. */
  export let duration: number | undefined = undefined

  // A sign, the same for every file: drawn per file, it would pass for the recording's real loudness.
  const BARS = [0.3, 0.55, 0.85, 0.6, 1, 0.7, 0.45, 0.8, 0.5, 0.3]

  let probed: number | undefined
  // The file asked about, not a flag: a cover given another recording asks again.
  let probedFor: string | undefined
  let visible = false

  $: length = formatMediaDuration(duration ?? (probedFor === src ? probed : undefined))
  // On the file too, not only on scrolling in: a new version may come while the cover is in view.
  $: if (visible) probe(src, duration)

  // Only the header is read, and only for the covers scrolled into view.
  function probe (url: string, known: number | undefined): void {
    if (known != null || probedFor === url) return
    probedFor = url
    probed = undefined
    void loadDuration(id, url).then((result) => {
      if (url === src) probed = result
    })
  }
</script>

<div class="audio-cover" use:lazyObserver={(value) => (visible = value)}>
  <FileBadge {...badge} variant="tint" />
  <span class="corner"><FileBadge {...badge} variant="small" /></span>
  <span class="center">
    <span class="sign" aria-hidden="true">
      {#each BARS as height}<span class="bar" style:height={`${height * 100}%`} />{/each}
    </span>
    <!-- Its line is kept while the length loads, so the sign does not jump up when it arrives. -->
    <span class="time">{length ?? ''}</span>
  </span>
</div>

<style lang="scss">
  .audio-cover {
    position: relative;
    aspect-ratio: 16 / 10;
    overflow: hidden;
    border-radius: var(--small-BorderRadius);

    > :global(.badge.tint) {
      position: absolute;
      inset: 0;
    }
  }

  .corner {
    position: absolute;
    left: 0.5rem;
    bottom: 0.5rem;
    border-radius: var(--small-BorderRadius);
    background-color: var(--theme-panel-color);
    box-shadow: 0 0.0625rem 0.1875rem var(--global-popover-ShadowColor);
  }

  .center {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }

  .sign {
    display: flex;
    align-items: center;
    gap: 0.1875rem;
    height: 2rem;
  }

  .bar {
    width: 0.25rem;
    border-radius: 0.125rem;
    background-color: color-mix(in srgb, var(--card-hue, var(--theme-caption-color)) 70%, transparent);
  }

  .time {
    min-height: 1rem;
    line-height: 1rem;
    font-size: 0.75rem;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    color: color-mix(in srgb, var(--card-hue, var(--theme-caption-color)) 75%, var(--theme-caption-color));
  }
</style>
