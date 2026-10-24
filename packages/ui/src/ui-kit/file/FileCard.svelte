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
  import { themeStore } from '@hcengineering/theme'
  import { createEventDispatcher } from 'svelte'

  import { getPlatformColorByName } from '../../colors'
  import Label from '../../components/Label.svelte'
  import ui from '../../plugin'
  import FileCover from './FileCover.svelte'
  import { formatFileSize } from './format'
  import type { FileBadgeData, ImageSource } from './types'

  export let name: string
  export let size: number = 0
  export let badge: FileBadgeData
  export let picture: ImageSource | undefined = undefined
  export let blurhash: string | undefined = undefined
  export let page: ImageSource | undefined = undefined
  /** Empty when the file has no address: then there is nothing to download or drag out. */
  export let url: string
  export let contentType: string = ''
  export let cacheKey: string | undefined = undefined
  /** Keeps the hover look, e.g. while the card's menu is open. */
  export let highlighted: boolean = false
  /** Two lines in a grid, where the end of a long name tells files apart; one in a message. */
  export let nameLines: 1 | 2 = 1

  // Opening and download are on the card; the owner puts the rest in the menu of a right click.
  const dispatch = createEventDispatcher<{ open: undefined, contextmenu: MouseEvent }>()

  $: hue =
    (badge.color != null ? getPlatformColorByName(badge.color, $themeStore.dark)?.color : undefined) ??
    'var(--theme-caption-color)'

  function dragStart (e: DragEvent): void {
    if (url === '') return
    e.dataTransfer?.setData('application/contentType', contentType)
    e.dataTransfer?.setData('text/plain', url)
    // Absolute, and encoded once: the name in the url is already escaped.
    e.dataTransfer?.setData('text/uri-list', new URL(url, location.href).href + '\r\n')
  }
</script>

<div
  class="file-card"
  class:highlighted
  style:--card-hue={hue}
  role="button"
  tabindex="0"
  draggable="true"
  on:click|stopPropagation={() => dispatch('open')}
  on:keydown={(e) => {
    if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
    e.preventDefault()
    dispatch('open')
  }}
  on:dragstart={dragStart}
  on:contextmenu={(e) => dispatch('contextmenu', e)}
>
  <slot name="cover"><FileCover {badge} {picture} {page} {blurhash} alt={name} {cacheKey} /></slot>
  <div class="info">
    <span class="name" class:two={nameLines === 2} lang={$themeStore.language} title={name}>
      <slot name="name">{name}</slot>
    </span>
    <span class="line">
      {#if size > 0}<span class="size">{formatFileSize(size, $themeStore.language)}</span>{/if}
      <span class="meta"><slot name="meta" /></span>
      {#if url !== ''}
        <a class="download" href={url} download={name} on:click|stopPropagation on:keydown|stopPropagation>
          <Label label={ui.string.Download} />
        </a>
      {/if}
    </span>
    <slot />
  </div>
</div>

<style lang="scss">
  @use './surface';

  .file-card {
    @include surface.card;
    position: relative;
    display: flex;
    flex-direction: column;
    // A grid stretches the card to its cell; a message keeps the narrowest card of that grid.
    width: var(--file-card-width, 14rem);
    max-width: 100%;
    padding: var(--card-pad);

    &:hover,
    &.highlighted,
    &:focus-visible {
      border-color: color-mix(in srgb, var(--card-hue) 30%, var(--global-ui-BorderColor));
      box-shadow: 0 0.125rem 0.375rem color-mix(in srgb, var(--global-popover-ShadowColor) 65%, transparent);
    }

    :global(.cover > .badge.tint) {
      background-color: color-mix(in srgb, var(--card-hue) 12%, transparent);
    }
  }

  // Fills a card stretched by its grid row, so what a list adds at the bottom lines up across the row.
  .info {
    display: flex;
    flex-direction: column;
    flex-grow: 1;
    gap: 0.25rem;
    padding: 0.5rem 0.375rem 0.25rem;
    min-width: 0;
  }

  .name {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-weight: 500;
    line-height: 1.25rem;
    color: var(--theme-caption-color);
  }

  .name.two {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    white-space: normal;
    overflow-wrap: anywhere;
    // A long next word would move whole to the clipped third line and leave the second half empty.
    hyphens: auto;
  }

  // One line in a narrow card: the size and the link keep their width, the date gives way with an ellipsis.
  .line {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    white-space: nowrap;
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    color: var(--theme-darker-color);
  }

  // Hidden from the eye only: a screen reader and Tab still reach it, and its focus shows it.
  @media (hover: hover) {
    .file-card:not(:hover, :focus-within, .highlighted) .download {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }
  }

  .size {
    flex-shrink: 0;
  }

  .meta {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;

    &:empty {
      display: none;
    }
  }

  // A meta line usually opens with « · », which sits closer to the size than the gap.
  .size + .meta {
    margin-left: -0.25rem;
  }

  .download {
    flex-shrink: 0;
    margin-left: auto;
    color: var(--theme-link-color);
    text-decoration: none;
    white-space: nowrap;

    &:hover {
      text-decoration: underline;
    }
  }
</style>
