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
  import type { ContentTab } from '../../../../search/attachments'

  /** Mirrors the card layout, so the page does not jump when results arrive. */
  export let kind: `${ContentTab}`

  const counts = { media: 0, files: 8, links: 6, audio: 6 }
  const mediaRows = [
    [1.6, 1, 1.3, 0.8],
    [1, 1.8, 1.2],
    [0.8, 1.3, 1, 1.6]
  ]
  $: items = Array.from({ length: counts[kind] }, (_, i) => i)
</script>

<div class="skeleton {kind}" aria-hidden="true">
  <div class="count"><span class="shimmer" /></div>
  <div class="month shimmer" />
  {#if kind === 'media'}
    <div class="media-grid">
      {#each mediaRows as ratios}
        <div class="media-row">
          {#each ratios as r}<span class="shimmer" style:flex-grow={r} />{/each}
        </div>
      {/each}
    </div>
  {/if}
  <div class="items">
    {#each items as i (i)}
      {#if kind === 'files'}
        <div class="card">
          <div class="cover shimmer" />
          <div class="info">
            <span class="row name"><span class="bar shimmer" style:width={`${75 - (i % 3) * 15}%`} /></span>
            <span class="row meta"><span class="bar shimmer" style:width="40%" /><span class="bar shimmer end" /></span>
            <span class="footer">
              <span class="row meta"><span class="dot shimmer" /><span class="bar shimmer" style:width="45%" /></span>
              <span class="chip shimmer" />
            </span>
          </div>
        </div>
      {:else if kind === 'links'}
        <div class="card">
          <div class="cover wide shimmer" />
          <div class="info">
            <span class="row sub"><span class="dot shimmer" /><span class="bar shimmer" style:width="40%" /></span>
            <span class="row name"><span class="bar shimmer" style:width={`${85 - (i % 3) * 15}%`} /></span>
            <span class="lines">
              <span class="row text"><span class="bar shimmer" style:width="90%" /></span>
              <span class="row text"><span class="bar shimmer" style:width={`${60 - (i % 2) * 20}%`} /></span>
            </span>
            <span class="footer">
              <span class="row meta"><span class="dot shimmer" /><span class="bar shimmer" style:width="55%" /></span>
              <span class="chip shimmer" />
            </span>
          </div>
        </div>
      {:else}
        <div class="card voice">
          <span class="head">
            <span class="face shimmer" />
            <span class="who">
              <span class="row name"><span class="bar shimmer" style:width="45%" /><span class="chip shimmer" /></span>
              <span class="row sub"><span class="bar shimmer" style:width="35%" /></span>
            </span>
          </span>
          <span class="player"><span class="play shimmer" /><span class="wave shimmer" /></span>
          <!-- The file line of the card, not a transcript: most recordings have none, and the rows would jump up. -->
          <span class="row file"><span class="badge shimmer" /><span class="bar shimmer" style:width="18%" /></span>
        </div>
      {/if}
    {/each}
  </div>
</div>

<style lang="scss">
  .skeleton {
    --skeleton-base: color-mix(in srgb, var(--theme-caption-color) 7%, transparent);
    --skeleton-shine: color-mix(in srgb, var(--theme-caption-color) 13%, transparent);
    --card-edge: color-mix(in srgb, var(--global-ui-BorderColor) 50%, transparent);
    --card-radius: calc(var(--small-BorderRadius) + 0.375rem);
    padding: 0 1rem 1rem;
  }

  .shimmer {
    border-radius: var(--small-BorderRadius);
    background: linear-gradient(90deg, var(--skeleton-base) 0%, var(--skeleton-shine) 40%, var(--skeleton-base) 80%);
    background-size: 200% 100%;
    animation: shimmer 1.4s ease-in-out infinite;
  }

  @keyframes shimmer {
    from {
      background-position: 100% 0;
    }
    to {
      background-position: -100% 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .shimmer {
      animation: none;
    }
  }

  .count {
    display: flex;
    align-items: center;
    // Padding, not margin: a margin here would fold into the month's and lift the list.
    height: 1.5rem;
    padding-bottom: 0.5rem;

    span {
      width: 4.5rem;
      height: 0.625rem;
    }
  }

  .month {
    width: 6rem;
    height: 1rem;
    margin: 1.375rem 0 0.875rem;
  }

  .items {
    display: grid;
    gap: 0.875rem;
  }

  // Not .media: that is the root's class on the media tab, and the gap would push the month and rows down.
  .media-grid {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  // The middle of the real rows, whose height follows the pictures' proportions.
  .media-row {
    display: flex;
    gap: 0.25rem;
    height: 9.375rem;

    span {
      flex-basis: 0;
    }
  }

  .files .items {
    grid-template-columns: repeat(auto-fill, minmax(13.5rem, 1fr));
  }

  .links .items {
    grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
  }

  .audio .items {
    grid-template-columns: repeat(auto-fill, minmax(19rem, 1fr));
  }

  .card {
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
    padding: 0.375rem;
    border: 1px solid var(--card-edge);
    border-radius: var(--card-radius);
  }

  .cover {
    aspect-ratio: 16 / 10;

    &.wide {
      aspect-ratio: 1.91;
    }
  }

  .info {
    display: flex;
    flex-direction: column;
    flex-grow: 1;
    gap: 0.25rem;
    padding: 0.5rem 0.375rem 0.375rem;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    min-width: 0;

    &.name,
    &.text {
      height: 1.25rem;
    }

    &.meta {
      height: 0.9375rem;
    }

    &.sub {
      height: 1rem;
    }

    &.file {
      height: 1.5rem;
    }
  }

  .bar {
    height: 0.625rem;

    &.end {
      width: 22%;
      margin-left: auto;
    }
  }

  .name .bar {
    height: 0.75rem;
  }

  .dot {
    flex-shrink: 0;
    width: 1rem;
    height: 1rem;
  }

  .footer {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    padding-top: 0.375rem;
  }

  .badge {
    flex-shrink: 0;
    width: 1.75rem;
    height: 1rem;
  }

  .chip {
    flex-shrink: 0;
    width: 5.5rem;
    height: 1.25rem;
  }

  .voice {
    gap: 0.75rem;
    padding: 0.875rem;
  }

  .head {
    display: flex;
    align-items: center;
    gap: 0.625rem;
  }

  .face {
    flex-shrink: 0;
    width: 1.5rem;
    height: 1.5rem;
  }

  .who {
    display: flex;
    flex-direction: column;
    flex-grow: 1;
    min-width: 0;
  }

  .lines {
    display: flex;
    flex-direction: column;
  }

  .player {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .play {
    flex-shrink: 0;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 50%;
  }

  .wave {
    flex-grow: 1;
    height: 1.5rem;
  }

  @media (max-width: 480px) {
    .skeleton {
      padding: 0 0.5rem 1rem;
    }

    .media-row {
      height: 6.875rem;
    }

    .files .items {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.5rem;
    }

    .links .items,
    .audio .items {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
