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
  import type { IntlString } from '@hcengineering/platform'
  import { themeStore } from '@hcengineering/theme'
  import { createEventDispatcher } from 'svelte'

  import Label from '../../components/Label.svelte'
  import IconClose from '../../components/icons/Close.svelte'
  import ui from '../../plugin'
  import IconPauseFill from '../_icons/IconPauseFill.svelte'
  import IconPlayFill from '../_icons/IconPlayFill.svelte'
  import { idlePlayer, playbackOf, sharedPlayback } from '../audio/playback'
  import IconButton from '../button/IconButton.svelte'
  import { describeLink, openLink } from '../link/link'
  import LinkPicture from '../link/LinkPicture.svelte'
  import SiteIcon from '../link/SiteIcon.svelte'
  import type { LinkDetailsData, LinkPreviewData } from '../link/types'
  import Skeleton from '../skeleton/Skeleton.svelte'
  import FileImage from './FileImage.svelte'
  import { formatFileSize, formatMediaDuration } from './format'
  import PageThumb from './PageThumb.svelte'
  import type { FileBadgeData, ImageSource } from './types'

  export let kind: 'picture' | 'video' | 'audio' | 'file' | 'link' = 'file'
  export let scale: 'medium' | 'large' = 'medium'
  export let loading: boolean = false
  export let progress: number | undefined = undefined
  export let failed: IntlString | undefined = undefined
  export let retryable: boolean = false
  export let name: string = ''
  /** Shown instead of the name, e.g. for a voice message. */
  export let nameLabel: IntlString | undefined = undefined
  export let size: number = 0
  export let badge: FileBadgeData = { label: '' }
  export let picture: ImageSource | undefined = undefined
  export let page: ImageSource | undefined = undefined
  export let cacheKey: string | undefined = undefined
  /** The recording in the player. */
  export let playbackId: string = ''
  export let url: string = ''
  export let duration: number | undefined = undefined
  export let removable: boolean = false
  export let preview: LinkPreviewData | undefined = undefined
  export let details: LinkDetailsData | undefined = undefined
  export let detailsLoaded: boolean = false

  const dispatch = createEventDispatcher<{
    open: undefined
    remove: undefined
    retry: undefined
  }>()

  // The source that failed, not a flag: a tile given another picture tries it.
  let broken: ImageSource | undefined
  let linkBroken: string | undefined

  $: visual = broken !== picture && (kind === 'picture' || kind === 'video') && picture != null
  $: uploading = progress != null && failed == null
  // Nothing to open or play until the file is stored.
  $: idle = loading || uploading || failed != null
  $: audio = kind === 'audio' && !idle
  // Only a recording listens to the player; a picture or a file never re-renders on its ticks.
  $: player = audio ? playbackOf(sharedPlayback(), playbackId) : idlePlayer
  $: playing = audio && $player.active && $player.playing
  $: durationText = formatMediaDuration($player.time > 0 ? $player.time : duration)
  $: shownSize = size > 0 ? formatFileSize(size, $themeStore.language) : undefined
  $: sent = uploading && size > 0 ? formatFileSize(Math.round((progress ?? 0) * size), $themeStore.language) : undefined
  $: percent = Math.round((progress ?? 0) * 100)
  $: thumbSize = scale === 'large' ? 80 : 64

  $: link = kind === 'link' && !loading ? describeLink(preview, details, detailsLoaded) : undefined
  $: linkPicture = link?.image != null && link.image !== linkBroken

  function toggle (): void {
    sharedPlayback().toggle(playbackId, url, duration)
  }

  function open (): void {
    if (idle) return
    if (link != null) openLink(link.url)
    else dispatch('open')
  }
</script>

<div
  class="tile {scale}"
  class:removable
  class:loading
  class:uploading
  role="button"
  tabindex={idle ? -1 : 0}
  aria-busy={loading || uploading}
  title={loading ? undefined : link != null ? link.url : name}
  on:click|stopPropagation={open}
  on:keydown={(e) => {
    if (idle || e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
    e.preventDefault()
    open()
  }}
>
  {#if loading}
    <Skeleton
      width="var(--page-thumb-width)"
      height="var(--page-thumb-height)"
      radius="var(--extra-small-BorderRadius)"
    />
    <span class="info">
      <Skeleton width="80%" />
      <Skeleton width="45%" />
    </span>
  {:else if link != null}
    <span class="thumb site" class:picture={linkPicture}>
      <LinkPicture src={link.image} bind:broken={linkBroken}>
        <SiteIcon src={details?.icon} size="large" />
      </LinkPicture>
    </span>
  {:else if visual && picture != null}
    <span class="thumb">
      <FileImage
        source={picture}
        width={thumbSize}
        height={thumbSize}
        alt={name}
        loading="eager"
        {cacheKey}
        on:error={() => (broken = picture)}
      />
      {#if kind === 'video'}
        <span class="video"><IconPlayFill size="x-small" /></span>
      {/if}
    </span>
  {:else if audio}
    <IconButton
      icon={playing ? IconPauseFill : IconPlayFill}
      kind="secondary"
      size="medium"
      shape="round"
      tooltip={{ label: playing ? ui.string.Pause : ui.string.Play }}
      on:click={toggle}
    />
  {:else}
    <PageThumb {badge} {page} {cacheKey} />
  {/if}
  {#if link != null}
    <span class="info">
      <span class="name">
        {#if link.title != null}{link.title}{:else if link.failed}<Label
            label={ui.string.LinkPreviewUnavailable}
          />{:else}<Skeleton width="9rem" />{/if}
      </span>
      <span class="meta site-row">
        {#if link.site != null}
          {#if linkPicture}<SiteIcon src={details?.icon} />{/if}
          <span class="host">{link.address ?? link.site}</span>
        {:else if !detailsLoaded}
          <Skeleton width="5rem" />
        {/if}
      </span>
    </span>
  {:else if !loading}
    <span class="info">
      <span class="name">
        {#if nameLabel != null}<Label label={nameLabel} />{:else}{name}{/if}
      </span>
      {#if failed != null}
        <span class="meta">
          <span class="failed"><Label label={failed} /></span>{#if retryable}<span class="dot">·</span><button
              type="button"
              class="retry"
              on:click|stopPropagation={() => dispatch('retry')}
              on:keydown|stopPropagation><Label label={ui.string.Retry} /></button
            >{/if}
        </span>
      {:else if uploading}
        <span class="meta">
          {#if sent != null && shownSize != null}<Label
              label={ui.string.UploadProgress}
              params={{ sent, size: shownSize }}
            />{:else}{badge.label}{/if}
        </span>
        <span
          class="bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <span class="fill" style:width="{percent}%" />
        </span>
      {:else}
        <span class="meta">
          {#if audio && durationText != null}{durationText}{:else}{badge.label}{/if}{#if shownSize != null}<span class="dot">·</span
            >{shownSize}{/if}{#if url !== ''}<span class="download"
              ><span class="dot">·</span><a
                href={url}
                download={name}
                on:click|stopPropagation
                on:keydown|stopPropagation><Label label={ui.string.Download} /></a
              ></span
            >{/if}
        </span>
      {/if}
    </span>
  {/if}
  {#if removable}
    <span class="remove">
      <IconButton
        icon={IconClose}
        kind="ghost"
        size="extra-small"
        iconSize="x-small"
        tooltip={{ label: ui.string.Remove }}
        on:click={() => dispatch('remove')}
      />
    </span>
  {/if}
</div>

<style lang="scss">
  @use './surface';

  .tile {
    @include surface.card;
    --tile-size: 4rem;
    position: relative;
    display: flex;
    align-items: center;
    flex-shrink: 0;
    gap: 0.5rem;
    width: 18rem;
    height: var(--tile-size);
    padding: var(--card-pad) 0.625rem var(--card-pad) var(--card-pad);

    --page-thumb-height: calc(var(--tile-size) - 2 * var(--card-pad) - 2px);
    --page-thumb-width: calc(var(--page-thumb-height) * 0.8);
    // The badge nearly met the tile's edge at the page's default overhang.
    --page-thumb-corner-x: -0.125rem;
    --page-thumb-corner-y: 0;

    &:hover,
    &:focus-visible {
      border-color: color-mix(in srgb, var(--theme-caption-color) 6%, var(--global-ui-BorderColor));
      box-shadow:
        0 0.0625rem 0.125rem color-mix(in srgb, var(--global-popover-ShadowColor) 40%, transparent),
        0 0.125rem 0.375rem color-mix(in srgb, var(--global-popover-ShadowColor) 30%, transparent);

      .remove {
        opacity: 1;
      }
    }

    &.removable {
      padding-right: 1.75rem;
    }

    &.loading {
      cursor: default;
    }
  }

  .tile.large {
    --tile-size: calc(3.75rem + 2 * var(--card-pad) + 2px);
    width: 20rem;
    max-width: 100%;
    gap: 0.75rem;

    .name {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      white-space: normal;
      overflow-wrap: anywhere;
    }
  }

  .thumb {
    position: relative;
    flex-shrink: 0;
    width: var(--page-thumb-height);
    height: var(--page-thumb-height);
    overflow: hidden;
    border-radius: var(--small-BorderRadius);
    background-color: color-mix(in srgb, var(--theme-caption-color) 6%, transparent);

    :global(img) {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }

  .video {
    position: absolute;
    top: 50%;
    left: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    margin: -0.75rem 0 0 -0.75rem;
    border-radius: 50%;
    color: var(--global-on-media-TextColor);
    background-color: var(--global-media-OverlayColor);
    pointer-events: none;
  }

  .info {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
  }

  .name {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-weight: 500;
    font-size: 0.8125rem;
    line-height: 1.125rem;
    color: var(--theme-caption-color);
  }

  .meta {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    color: var(--theme-dark-color);
  }

  .dot {
    margin: 0 0.25rem;
  }

  .failed {
    color: var(--global-error-TextColor);
  }

  .retry {
    display: inline;
    padding: 0;
    border: none;
    font: inherit;
    font-weight: 500;
    color: var(--theme-link-color);
    background: none;
    cursor: pointer;

    &:hover {
      text-decoration: underline;
    }
  }

  .bar {
    display: block;
    height: 0.25rem;
    margin-top: 0.125rem;
    overflow: hidden;
    border-radius: 0.125rem;
    background-color: color-mix(in srgb, var(--theme-caption-color) 8%, transparent);
  }

  .fill {
    display: block;
    height: 100%;
    border-radius: inherit;
    background-color: var(--button-brand-BackgroundColor);
    transition: width 0.2s ease;
  }

  .download a {
    color: var(--theme-link-color);
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }

  @media (hover: hover) {
    .tile:not(:hover, :focus-within) .download {
      opacity: 0;
    }
  }

  .site {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--theme-darker-color);

    :global(.site-icon.large),
    :global(svg) {
      width: 1.5rem;
      height: 1.5rem;
    }

    // A picture shows as it is, a transparent logo too; the tint is the site icon's.
    &.picture {
      background-color: transparent;
    }
  }

  .site-row {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    height: 1rem;

    :global(.site-icon.small),
    :global(svg) {
      width: 0.75rem;
      height: 0.75rem;
    }
  }

  .host {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  // In the corner, not past it: a strip of tiles scrolls and would cut a button that hangs outside.
  .remove {
    position: absolute;
    top: 0.25rem;
    right: 0.25rem;
    display: flex;
    opacity: 0;
    transition: opacity 0.15s ease;

    &:focus-within {
      opacity: 1;
    }
  }

  @media (hover: none) {
    .remove {
      opacity: 1;
    }
  }

  .uploading .info {
    flex-grow: 1;
  }

  .loading .info {
    flex-grow: 1;
    gap: 0.5rem;
  }
</style>
