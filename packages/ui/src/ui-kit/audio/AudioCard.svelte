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

  import Label from '../../components/Label.svelte'
  import ui from '../../plugin'
  import FileBadge from '../file/FileBadge.svelte'
  import { formatFileSize } from '../file/format'
  import type { FileBadgeData } from '../file/types'
  import AudioBar from './AudioBar.svelte'
  import type { Playback } from './types'

  /** The recording in the player, the same for every card of one file. */
  export let id: string
  export let name: string
  export let size: number = 0
  export let badge: FileBadgeData
  export let url: string
  export let playback: Playback | undefined = undefined
  export let highlighted: boolean = false

  const dispatch = createEventDispatcher<{ contextmenu: MouseEvent }>()

  $: shownSize = size > 0 ? formatFileSize(size, $themeStore.language) : undefined
</script>

<div
  class="audio-card"
  role="group"
  aria-label={name}
  class:highlighted
  on:contextmenu={(e) => dispatch('contextmenu', e)}
>
  <AudioBar {id} src={url} {size} {playback} />
  <div class="file" title={name}>
    <FileBadge {...badge} variant="mini" />
    <span class="name">{name}</span>
    {#if shownSize != null}<span class="size">{shownSize}</span>{/if}
    <a class="download" href={url} download={name} on:click|stopPropagation on:keydown|stopPropagation>
      <Label label={ui.string.Download} />
    </a>
  </div>
</div>

<style lang="scss">
  .audio-card {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    box-sizing: border-box;
    width: var(--audio-card-width, 20rem);
    max-width: 100%;
    padding: 0.625rem 0.625rem 0.5rem 0.75rem;
    border: 1px solid color-mix(in srgb, var(--global-ui-BorderColor) 50%, transparent);
    border-radius: calc(var(--small-BorderRadius) + 0.375rem);
    transition: border-color 0.15s ease;

    &:hover,
    &.highlighted,
    &:focus-within {
      border-color: color-mix(in srgb, var(--theme-caption-color) 7%, var(--global-ui-BorderColor));
    }
  }

  .file {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    height: 1.5rem;
    min-width: 0;
    font-size: 0.75rem;
    color: var(--theme-dark-color);
  }

  .name {
    flex-shrink: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: var(--theme-caption-color);
  }

  .size {
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;

    &::before {
      content: '·';
      margin-right: 0.375rem;
    }
  }

  @media (hover: hover) {
    .audio-card:not(:hover, :focus-within, .highlighted) .download {
      opacity: 0;
    }
  }

  .download {
    flex-shrink: 0;
    margin-left: auto;
    padding-left: 0.5rem;
    color: var(--theme-link-color);
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }
</style>
