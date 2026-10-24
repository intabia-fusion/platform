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
  import { AttachmentFormat } from '@hcengineering/attachment'
  import { getClient, Image } from '@hcengineering/presentation'
  import { formatName } from '@hcengineering/contact'
  import { Avatar } from '@hcengineering/contact-resources'
  import { Blurhash, Icon, themeStore } from '@hcengineering/ui'
  import { formatMediaDuration as formatDuration } from '@hcengineering/ui/kit'
  import { createEventDispatcher } from 'svelte'

  import type { AttachmentRow } from '../../../../search/attachments'
  import { clampRatio, classIcon, formatDay, mediaRatio, placeClass } from '../../../../search/browser'
  import { showItemMenu } from '../../../../search/menu'
  import MarkedText from './MarkedText.svelte'

  export let row: AttachmentRow
  // A search finds media by the file name, so the hover caption leads with it.
  export let named: boolean = false
  // The picture is requested at this height and its own proportions, whatever the row makes of it.
  const REQUEST_HEIGHT = 240

  const dispatch = createEventDispatcher()
  const hierarchy = getClient().getHierarchy()

  let menuOpen = false

  // The picture that failed, not a flag: a row handed a new one tries it.
  let failedBlob: string | undefined

  $: video = row.format === AttachmentFormat.Video
  $: blob = video ? row.poster : row.attachment.file
  $: failed = blob != null && blob === failedBlob
  $: blurhash = row.attachment.metadata?.thumbnail?.blurhash
  $: ratio = clampRatio(mediaRatio(row))
  $: duration = formatDuration(row.durationSec)
  $: placeIcon = classIcon(hierarchy, placeClass(row.raw))
  $: byline = [
    row.person != null ? formatName(row.person.name) : undefined,
    formatDay(row.createdOn, $themeStore.language)
  ]
    .filter((it) => it != null)
    .join(' · ')
</script>

<!-- No title: a screenshot's name says nothing; on hover the picture says where, who and when. -->
<button
  class="tile"
  class:highlighted={menuOpen}
  type="button"
  aria-label={row.attachment.name}
  on:click={() => dispatch('open')}
  on:contextmenu={(e) => {
    menuOpen = true
    showItemMenu(e, {
      open: () => dispatch('open'),
      download: { file: row.attachment.file, name: row.attachment.name },
      message: () => dispatch('message'),
      onClose: () => (menuOpen = false)
    })
  }}
>
  <span class="picture">
    {#if video && (blob == null || failed)}
      <div class="video-backdrop">
        <span class="play-circle" aria-hidden="true">
          <svg viewBox="0 0 16 16"><path d="M5.5 3.5v9l7-4.5z" fill="currentColor" /></svg>
        </span>
      </div>
    {:else if blob != null && !failed}
      <Image
        {blob}
        alt={row.attachment.name}
        width={Math.round(REQUEST_HEIGHT * ratio)}
        height={REQUEST_HEIGHT}
        fit="cover"
        responsive
        loading="lazy"
        {blurhash}
        on:error={() => (failedBlob = blob)}
      />
    {:else if blurhash != null}
      <Blurhash {blurhash} />
    {:else}
      <div class="placeholder" />
    {/if}
  </span>

  {#if video && (duration != null || (blob != null && !failed))}
    <span class="badge corner" aria-hidden="true">
      <svg viewBox="0 0 16 16"><path d="M5 3.5v9l7.5-4.5z" fill="currentColor" /></svg>
      {#if duration != null}<span>{duration}</span>{/if}
    </span>
  {:else if row.format === AttachmentFormat.Gif}
    <span class="badge" aria-hidden="true">GIF</span>
  {/if}

  <!-- One line each, cut on its own, so a narrow tile still shows both where and who. -->
  <span class="caption" class:named>
    {#if row.person != null}
      <span class="face"><Avatar person={row.person} name={row.person.name} size="x-small" /></span>
    {/if}
    <span class="lines">
      {#if named}
        <span class="name"><MarkedText text={row.nameHighlight ?? row.attachment.name} /></span>
      {/if}
      {#if row.channel !== ''}
        <span class="line place">
          {#if placeIcon != null}<Icon icon={placeIcon} size="x-small" />{/if}
          <span class="text">{row.channel}</span>
        </span>
      {/if}
      <span class="line byline"><span class="text">{byline}</span></span>
    </span>
  </span>
</button>

<style lang="scss">
  .tile {
    position: relative;
    display: block;
    width: 100%;
    height: 100%;
    padding: 0;
    border-radius: inherit;
    overflow: hidden;
    border: none;
    // Transparent: a screenshot's see-through edges show the page, not a tinted plate.
    background-color: transparent;
    cursor: pointer;

    // The picture only: the avatar of the caption keeps its size.
    .picture :global(img) {
      transition: transform 0.2s ease;
    }

    &:hover .picture :global(img),
    &.highlighted .picture :global(img) {
      transform: scale(1.03);
    }

    &:focus-visible {
      outline: 0.125rem solid var(--global-focus-BorderColor);
      outline-offset: -0.125rem;
    }
  }

  .video-backdrop {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    background-color: var(--global-media-BackdropColor);
  }

  .play-circle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 50%;
    color: var(--global-on-media-TextColor);
    background-color: color-mix(in srgb, var(--global-on-media-TextColor) 16%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--global-on-media-TextColor) 22%, transparent);

    svg {
      width: 1rem;
      height: 1rem;
      margin-left: 0.125rem;
    }
  }

  .caption {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    gap: 0.4375rem;
    padding: 1.125rem 0.5rem 0.4375rem;
    color: var(--global-on-media-TextColor);
    text-align: left;
    background: linear-gradient(
      to top,
      var(--global-media-OverlayColor),
      color-mix(in srgb, var(--global-media-OverlayColor) 70%, transparent) 60%,
      transparent
    );
    opacity: 0;
    transition: opacity 0.15s ease;
    pointer-events: none;
  }

  .tile:hover .caption,
  .tile.highlighted .caption,
  .tile:focus-visible .caption,
  .caption.named {
    opacity: 1;
  }

  .caption.named {
    .face,
    .place,
    .byline {
      display: none;
    }
  }

  .tile:hover .caption.named,
  .tile.highlighted .caption.named,
  .tile:focus-visible .caption.named {
    .face {
      display: inline-flex;
    }

    .place,
    .byline {
      display: flex;
    }

    .name {
      display: none;
    }
  }

  .name {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    font-size: 0.75rem;
    font-weight: 500;
    line-height: 1.125rem;
    word-break: break-word;

    // The highlight's yellow, see-through on the dark shade so the text stays white.
    :global(mark) {
      color: var(--global-on-media-TextColor);
      background-color: color-mix(in srgb, var(--tag-accent-SunshineBackground) 45%, transparent);
    }
  }

  // Gives way to the caption, which shows on focus too.
  .tile:hover .corner,
  .tile.highlighted .corner,
  .tile:focus-visible .corner {
    opacity: 0;
  }

  .picture {
    display: block;
    width: 100%;
    height: 100%;
  }

  .corner {
    transition: opacity 0.15s ease;
  }

  .face {
    display: inline-flex;
    flex-shrink: 0;
  }

  .lines {
    display: flex;
    flex-direction: column;
    gap: 0.0625rem;
    min-width: 0;
  }

  .line {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    min-width: 0;
  }

  .text {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .place {
    font-size: 0.75rem;
    font-weight: 600;
    line-height: 1rem;

    :global(svg) {
      flex-shrink: 0;
    }
  }

  .byline {
    font-size: 0.6875rem;
    line-height: 0.875rem;
    opacity: 0.85;
  }

  .placeholder {
    width: 100%;
    height: 100%;
    background-color: color-mix(in srgb, var(--theme-caption-color) 6%, transparent);
  }

  .badge {
    position: absolute;
    left: 0.375rem;
    top: 0.375rem;
    display: inline-flex;
    align-items: center;
    gap: 0.125rem;
    height: 1.25rem;
    padding: 0 0.375rem;
    font-size: 0.6875rem;
    font-weight: 500;
    color: var(--global-on-media-TextColor);
    background-color: var(--global-media-OverlayColor);
    border-radius: 0.625rem;
    pointer-events: none;

    &.corner {
      left: auto;
      top: auto;
      right: 0.375rem;
      bottom: 0.375rem;
      padding: 0 0.375rem 0 0.25rem;
      font-variant-numeric: tabular-nums;
      backdrop-filter: blur(0.25rem);
    }

    svg {
      width: 0.75rem;
      height: 0.75rem;
    }
  }
</style>
