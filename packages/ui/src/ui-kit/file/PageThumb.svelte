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

  import FileBadge from './FileBadge.svelte'
  import FileImage, { isKnownImage } from './FileImage.svelte'
  import type { FileBadgeData, ImageSource } from './types'

  export let badge: FileBadgeData
  export let page: ImageSource | undefined = undefined
  export let cacheKey: string | undefined = undefined

  const WIDTH = 64
  const HEIGHT = 90

  // A place without room for a sheet-shaped badge can show its own when there is no page.
  const dispatch = createEventDispatcher<{ error: undefined }>()

  // By the file when known: a parent re-rendering hands a new source of the same page, and its img fires no load.
  $: pageKey = cacheKey ?? page

  // The pages that failed and loaded, not flags: a thumb given another page starts over.
  let failed: string | ImageSource | undefined
  let loadedPage: string | ImageSource | undefined
  // Seen before: the badge takes its corner at once and the page skips the fade, but still waits for its pixels.
  $: known = isKnownImage(cacheKey)
  $: loaded = page != null && loadedPage === pageKey
</script>

<span class="thumb">
  <FileBadge {...badge} variant="sheet" />
  {#if page != null && pageKey !== failed}
    <span class="sheet" class:loaded class:instant={known}>
      <FileImage
        source={page}
        width={WIDTH}
        height={HEIGHT}
        {cacheKey}
        on:load={() => (loadedPage = pageKey)}
        on:error={() => {
          failed = pageKey
          dispatch('error')
        }}
      />
    </span>
    {#if loaded || known}
      <span class="corner"><FileBadge {...badge} variant="mini" /></span>
    {/if}
  {/if}
</span>

<style lang="scss">
  @use './surface';

  .thumb {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: var(--page-thumb-width, 3rem);
    height: var(--page-thumb-height, 3.75rem);
  }

  .sheet {
    @include surface.paper;
    position: absolute;
    inset: 0;
    border-radius: var(--extra-small-BorderRadius);
    box-shadow:
      0 0 0 1px var(--global-ui-BorderColor),
      0 0.0625rem 0.1875rem color-mix(in srgb, var(--global-popover-ShadowColor) 85%, transparent);
  }

  .corner {
    position: absolute;
    left: var(--page-thumb-corner-x, -0.25rem);
    bottom: var(--page-thumb-corner-y, -0.125rem);
    border-radius: var(--extra-small-BorderRadius);
    background-color: var(--theme-panel-color);
  }
</style>
