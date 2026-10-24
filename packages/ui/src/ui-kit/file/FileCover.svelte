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
  import Blurhash from '../../components/Blurhash.svelte'
  import FileBadge from './FileBadge.svelte'
  import FileImage, { isKnownImage } from './FileImage.svelte'
  import type { FileBadgeData, ImageSource } from './types'

  export let badge: FileBadgeData
  export let picture: ImageSource | undefined = undefined
  export let page: ImageSource | undefined = undefined
  export let alt: string = ''
  export let cacheKey: string | undefined = undefined
  export let blurhash: string | undefined = undefined

  // The cover's own 16:10.
  const PICTURE_WIDTH = 448
  const PICTURE_HEIGHT = 280
  // A whole page at the A4 ratio; the cover shows its top, where the title is.
  const PAGE_WIDTH = 320
  const PAGE_HEIGHT = 452

  // By the file when known: a parent re-rendering hands a new source of the same picture, and its img fires no load.
  $: pictureKey = cacheKey ?? picture
  $: pageKey = cacheKey ?? page

  // The sources that failed and loaded, not flags: a cover given another picture or page starts over.
  let failedPicture: string | ImageSource | undefined
  let failedPage: string | ImageSource | undefined
  let loadedPage: string | ImageSource | undefined
  let loadedPicture: string | ImageSource | undefined
  // Seen before: the badge takes its corner at once and the page skips the fade, but still waits for its pixels.
  $: known = isKnownImage(cacheKey)
  $: pageLoaded = page != null && loadedPage === pageKey
  $: pictureLoaded = picture != null && loadedPicture === pictureKey

  $: showPicture = picture != null && pictureKey !== failedPicture
  $: showPage = !showPicture && page != null && pageKey !== failedPage
</script>

<!-- The box keeps its proportions whatever loads, so a list of covers never moves. -->
<div class="cover">
  <FileBadge {...badge} variant="tint" />
  {#if showPicture && picture != null}
    <!-- Shown whole once loaded, never painted in strips over the tint. -->
    <div class="picture" class:loaded={pictureLoaded} class:instant={known}>
      {#if blurhash != null}<span class="blur"><Blurhash {blurhash} /></span>{/if}
      <span class="image">
        <FileImage
          source={picture}
          width={PICTURE_WIDTH}
          height={PICTURE_HEIGHT}
          {alt}
          {cacheKey}
          on:load={() => (loadedPicture = pictureKey)}
          on:error={() => (failedPicture = pictureKey)}
        />
      </span>
    </div>
  {:else if showPage && page != null}
    <div class="sheet" class:loaded={pageLoaded} class:instant={known}>
      <FileImage
        source={page}
        width={PAGE_WIDTH}
        height={PAGE_HEIGHT}
        {alt}
        {cacheKey}
        on:load={() => (loadedPage = pageKey)}
        on:error={() => (failedPage = pageKey)}
      />
    </div>
  {/if}
  {#if !showPicture}
    {#if showPage && (pageLoaded || known)}
      <div class="corner"><FileBadge {...badge} variant="small" /></div>
    {:else}
      <div class="centered"><FileBadge {...badge} variant="large" /></div>
    {/if}
  {/if}
</div>

<style lang="scss">
  @use './surface';

  .cover {
    position: relative;
    aspect-ratio: 16 / 10;
    overflow: hidden;
    border-radius: var(--small-BorderRadius);

    > :global(.badge.tint) {
      position: absolute;
      inset: 0;
    }
  }

  .sheet {
    @include surface.paper;
    position: absolute;
    top: 0.875rem;
    left: 12%;
    right: 12%;
    bottom: 0;
    border-radius: var(--extra-small-BorderRadius) var(--extra-small-BorderRadius) 0 0;
    box-shadow: 0 0.0625rem 0.25rem var(--global-popover-ShadowColor);
  }

  .picture {
    position: absolute;
    inset: 0;

    :global(img) {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .blur,
    .image {
      position: absolute;
      inset: 0;
    }

    .image {
      opacity: 0;
      transition: opacity 0.2s ease;
    }

    &.instant .image {
      transition: none;
    }

    &.loaded .image {
      opacity: 1;
    }

    // Gone once the picture is in, or it shows through a transparent one; after the fade, not under it.
    &.loaded .blur {
      visibility: hidden;
      transition: visibility 0s linear 0.2s;
    }

    &.loaded.instant .blur {
      transition: none;
    }
  }

  // Solid under the translucent badge, which would fade out over the white page.
  .corner {
    position: absolute;
    left: 0.5rem;
    bottom: 0.5rem;
    border-radius: var(--small-BorderRadius);
    background-color: var(--theme-panel-color);
    box-shadow: 0 0.0625rem 0.1875rem var(--global-popover-ShadowColor);
  }

  .centered {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
</style>
