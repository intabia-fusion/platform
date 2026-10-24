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
  import type { Blob, Ref } from '@hcengineering/core'
  import { lazyObserver } from '@hcengineering/ui'
  import { FileCover, formatMediaDuration, type FileBadgeData, type ImageSource } from '@hcengineering/ui/kit'

  import { videoDuration } from '../video'

  /** A mark that it is a video: a frame alone passes for a photo. */
  export let badge: FileBadgeData
  export let picture: ImageSource | undefined = undefined
  export let blurhash: string | undefined = undefined
  export let playlist: Ref<Blob> | undefined = undefined
  /** Saved with the file; without it the length is summed from the playlist. */
  export let duration: number | undefined = undefined
  export let alt: string = ''
  export let cacheKey: string | undefined = undefined

  let summed: number | undefined
  // The playlist asked about, not a flag: a cover given another video asks again.
  let askedFor: Ref<Blob> | undefined
  let visible = false

  $: length = formatMediaDuration(duration ?? (askedFor === playlist ? summed : undefined))
  // On the playlist too, not only on scrolling in: it comes once transcoding ends, maybe with the cover in view.
  $: if (visible && duration == null) probe(playlist)

  function probe (asked: Ref<Blob> | undefined): void {
    if (asked == null || askedFor === asked) return
    askedFor = asked
    summed = undefined
    void videoDuration(asked).then((result) => {
      if (asked === playlist) summed = result
    })
  }
</script>

<div class="video-cover" use:lazyObserver={(value) => (visible = value)}>
  <FileCover {badge} {picture} {blurhash} {alt} {cacheKey} />
  <!-- A play sign, not a button: the card opens the video, it does not play in the grid. -->
  {#if picture != null || length != null}
    <span class="mark" aria-hidden="true">
      <svg viewBox="0 0 16 16"><path d="M5 3.5v9l7.5-4.5z" fill="currentColor" /></svg>
      {#if length != null}<span>{length}</span>{/if}
    </span>
  {/if}
</div>

<style lang="scss">
  .video-cover {
    position: relative;
  }

  .mark {
    position: absolute;
    left: 0.5rem;
    bottom: 0.5rem;
    display: inline-flex;
    align-items: center;
    gap: 0.125rem;
    height: 1.25rem;
    padding: 0 0.375rem;
    border-radius: 0.625rem;
    font-size: 0.6875rem;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    color: var(--global-on-media-TextColor);
    background-color: var(--global-media-OverlayColor);
    pointer-events: none;

    svg {
      width: 0.75rem;
      height: 0.75rem;
    }
  }
</style>
