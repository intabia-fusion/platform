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
  import type { PlatformIcon } from './icons'

  export let icon: PlatformIcon
  /** Icon box in px. */
  export let size: number = 20

  $: src = icon.isolated ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(icon.svg)}` : ''
  $: light = isLight(icon.svg)

  // Painted only in near-white: drawn for a coloured backing, so it gets a dark one here.
  function isLight (svg: string): boolean {
    const paints = [...svg.matchAll(/(?:fill|stroke|stop-color)="([^"]+)"/g)]
      .map((m) => m[1].toLowerCase())
      .filter((v) => v !== 'none' && v !== 'transparent')
    return paints.length > 0 && paints.every(isNearWhite)
  }

  function isNearWhite (color: string): boolean {
    if (color === 'white') return true
    const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(color)?.[1]
    if (hex == null) return false
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex
    return [0, 2, 4].every((i) => parseInt(full.slice(i, i + 2), 16) >= 0xe0)
  }
</script>

<figure class="tile" title="{icon.file}:{icon.line}">
  <span class="glyph" class:light style:width="{size / 16}rem" style:height="{size / 16}rem">
    {#if icon.isolated}
      <img {src} alt="" />
    {:else}
      <!-- Markup of the repository's own sources, cleaned by scripts/platform-icons.mjs. -->
      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
      {@html icon.svg}
    {/if}
  </span>
  <figcaption>
    <span class="name">{icon.name}</span>
  </figcaption>
</figure>

<style lang="scss">
  .tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    width: 4.75rem;
    margin: 0;
  }

  .glyph {
    display: flex;
    box-sizing: content-box;
    padding: 0.5rem;
    border-radius: var(--small-BorderRadius);
    color: var(--theme-caption-color);
    background-color: color-mix(in srgb, var(--theme-caption-color) 4%, transparent);

    :global(svg),
    img {
      display: block;
      width: 100%;
      height: 100%;
    }
  }
  // Only the light theme needs it: the dark tile already backs a white drawing.
  :global(.theme-light) .glyph.light {
    background-color: var(--theme-caption-color);
  }

  figcaption {
    display: flex;
    flex-direction: column;
    align-items: center;
    max-width: 100%;
    font-size: 0.6875rem;
    line-height: 1rem;
    text-align: center;
    overflow-wrap: anywhere;
    color: var(--theme-content-color);
  }
</style>
