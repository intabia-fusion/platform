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
  import IconClose from '../../components/icons/Close.svelte'
  import ui from '../../plugin'
  import IconButton from '../button/IconButton.svelte'
  import Skeleton from '../skeleton/Skeleton.svelte'
  import { linkLayout, linkTarget, nonEmpty, openLink } from './utils'
  import LinkPicture from './LinkPicture.svelte'
  import SiteIcon from './SiteIcon.svelte'
  import type { LinkDetailsData, LinkPreviewData } from './types'

  export let preview: LinkPreviewData | undefined = undefined
  export let details: LinkDetailsData | undefined = undefined
  export let detailsLoaded: boolean = false
  export let highlighted: boolean = false
  export let removable: boolean = false

  const dispatch = createEventDispatcher<{ contextmenu: MouseEvent, remove: undefined }>()

  // The preview sizes the card; the details only fill fixed slots, so loading or failing never moves the list.
  $: known = nonEmpty(preview?.title) != null || nonEmpty(preview?.description) != null
  $: title = known ? nonEmpty(preview?.title) : nonEmpty(details?.title)
  $: description = known ? nonEmpty(preview?.description) : nonEmpty(details?.description)
  $: image = nonEmpty(preview?.image)
  $: ({ url, site } = linkTarget(preview, details))
  $: shape = linkLayout(image, preview?.imageWidth, preview?.imageHeight)
  $: failed = detailsLoaded && !known && title == null && description == null
</script>

<div
  class="link-card layout-{shape}"
  class:highlighted
  class:removable
  class:linked={url != null}
  role="link"
  tabindex="0"
  title={url}
  on:click|stopPropagation={() => {
    openLink(url)
  }}
  on:keydown={(e) => {
    if (e.target !== e.currentTarget || e.key !== 'Enter') return
    e.preventDefault()
    openLink(url)
  }}
  on:contextmenu={(e) => dispatch('contextmenu', e)}
>
  <div class="body">
    <!-- Across the card, over the thumbnail too: the site is read first. -->
    <span class="site">
      {#if site != null}
        <SiteIcon src={details?.icon} />
        <span class="host">{site}</span>
      {:else if detailsLoaded}
        <SiteIcon />
      {:else}
        <Skeleton width="6rem" height="0.5rem" radius="0.25rem" />
      {/if}
    </span>
    <div class="content">
      <div class="text">
        {#if known}
          {#if title != null}<span class="title">{title}</span>{/if}
          {#if description != null}<span class="description">{description}</span>{/if}
        {:else}
          <!-- The text is not on the attachment: a box of fixed lines, whatever the details bring. -->
          <span class="reserved">
            {#if !detailsLoaded}
              <span class="lines"><Skeleton /><Skeleton width="60%" /></span>
            {:else if failed && url != null}
              <span class="address">{url}</span>
            {:else if failed}
              <span class="unavailable"><Label label={ui.string.LinkPreviewUnavailable} /></span>
            {:else}
              {#if title != null}<span class="title one">{title}</span>{/if}
              {#if description != null}<span class="description two">{description}</span>{/if}
            {/if}
          </span>
        {/if}
      </div>
      {#if shape === 'thumb'}
        <div class="thumb">
          <LinkPicture src={image} fit="contain">
            <span class="blank"><SiteIcon src={details?.icon} size="large" /></span>
          </LinkPicture>
        </div>
      {/if}
    </div>
  </div>
  <!-- Under the text, as the page's own picture: the site and the title are read first. -->
  {#if shape === 'cover'}
    <div class="cover">
      <LinkPicture src={image} tinted>
        <span class="blank"><SiteIcon src={details?.icon} size="large" /></span>
      </LinkPicture>
    </div>
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
  .link-card {
    --card-pad: 0.375rem;
    position: relative;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    width: 26rem;
    max-width: 100%;
    padding: var(--card-pad);
    // A fill, not a frame: a frame melts into the lines of the chat around it.
    border-radius: calc(var(--small-BorderRadius) + var(--card-pad));
    background-color: var(--theme-link-preview-bg-color);
    user-select: none;
    transition: background-color 0.15s ease;

    &.linked {
      cursor: pointer;
    }

    // The hover look alone is too faint to find the card the keys are on.
    &:focus-visible {
      outline: 0.125rem solid var(--global-focus-BorderColor);
      outline-offset: 0.125rem;
    }

    &:hover,
    &.highlighted,
    &:focus-visible {
      background-color: color-mix(in srgb, var(--theme-caption-color) 4%, var(--theme-link-preview-bg-color));

      .remove {
        opacity: 1;
      }
    }

    &.removable .site {
      padding-right: 1.5rem;
    }
  }

  .cover {
    margin-top: 0.375rem;
    aspect-ratio: 1.91;
    overflow: hidden;
    border-radius: var(--small-BorderRadius);
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.375rem 0.375rem 0.25rem;
  }

  .content {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
  }

  .layout-thumb .body {
    gap: 0.5rem;
  }

  .text {
    display: flex;
    flex-direction: column;
    flex-grow: 1;
    gap: 0.25rem;
    min-width: 0;
  }

  .site {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    height: 1.25rem;
    font-size: 0.875rem;
    color: var(--theme-link-preview-text-color);
  }

  .host {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-weight: 500;
  }

  .lines {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    padding: 0.3125rem 0;
  }

  // One title line and two of description, the room the details may take.
  .reserved {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    height: calc(1.25rem + 0.25rem + 2 * 1.125rem);
    overflow: hidden;
  }

  .unavailable {
    font-size: 0.8125rem;
    line-height: 1.25rem;
    color: var(--theme-content-color);
  }

  .address {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    overflow-wrap: anywhere;
    font-size: 0.8125rem;
    line-height: 1.125rem;
    color: var(--theme-caption-color);
  }

  .title,
  .description {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    overflow-wrap: anywhere;
  }

  .title {
    -webkit-line-clamp: 2;
    line-clamp: 2;
    font-weight: 500;
    font-size: 0.875rem;
    line-height: 1.25rem;
    color: var(--theme-link-preview-text-color);
  }

  .description {
    -webkit-line-clamp: 3;
    line-clamp: 3;
    font-size: 0.8125rem;
    line-height: 1.125rem;
    color: var(--theme-link-preview-description-color);
  }

  .title.one {
    -webkit-line-clamp: 1;
    line-clamp: 1;
  }

  .description.two {
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  // Not cropped: a small picture is often a logo.
  .thumb {
    order: -1;
    align-self: flex-end;
    flex-shrink: 0;
    width: 4.5rem;
    height: 4.5rem;
    overflow: hidden;
    // As round as a site's square icon drawn in it: a sharper plate looks foreign next to one.
    border-radius: var(--large-BorderRadius);
  }

  .blank {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    color: var(--theme-darker-color);
    background-color: color-mix(in srgb, var(--theme-caption-color) 6%, transparent);
  }

  .remove {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
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
</style>
