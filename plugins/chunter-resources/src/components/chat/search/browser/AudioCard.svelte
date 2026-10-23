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
  import attachment, { AttachmentFormat, formatBadge } from '@hcengineering/attachment'
  import { formatName } from '@hcengineering/contact'
  import { Avatar } from '@hcengineering/contact-resources'
  import { getFileUrl } from '@hcengineering/presentation'
  import { Label, themeStore } from '@hcengineering/ui'
  import { AudioBar, FileBadge, formatFileSize, type Playback } from '@hcengineering/ui/kit'
  import { createEventDispatcher } from 'svelte'

  import type { AttachmentRow } from '../../../../search/attachments'
  import { showItemMenu } from '../../../../search/menu'
  import DayLabel from './DayLabel.svelte'
  import DownloadLink from './DownloadLink.svelte'
  import MarkedText from './MarkedText.svelte'
  import RowPlace from './RowPlace.svelte'

  export let row: AttachmentRow
  export let playback: Playback

  const dispatch = createEventDispatcher()

  let menuOpen = false

  $: voice = row.format === AttachmentFormat.Voice
  $: src = getFileUrl(row.attachment.file, row.attachment.name)
  $: snippet = row.contentHighlights[0] ?? row.transcript
  $: size = row.attachment.size > 0 ? formatFileSize(row.attachment.size, $themeStore.language) : undefined

  // The player and the links are the card's own controls; the rest leads to the message.
  function openMessage (e: MouseEvent): void {
    if ((e.target as HTMLElement).closest('button, a, [role="slider"]') != null) return
    // A click that ends selecting the transcript keeps the selection.
    if (window.getSelection()?.isCollapsed === false) return
    dispatch('message')
  }
</script>

<div
  class="card"
  class:highlighted={menuOpen}
  role="button"
  tabindex="0"
  on:click={openMessage}
  on:keydown={(e) => {
    if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
    e.preventDefault()
    dispatch('message')
  }}
  on:contextmenu={(e) => {
    menuOpen = true
    showItemMenu(e, {
      download: { file: row.attachment.file, name: row.attachment.name },
      message: () => dispatch('message'),
      onClose: () => (menuOpen = false)
    })
  }}
>
  <div class="head">
    {#if row.person != null}
      <span class="avatar"><Avatar person={row.person} name={row.person.name} size="x-small" /></span>
    {/if}
    <span class="who">
      <span class="top">
        <span class="name overflow-label">
          {#if row.person != null}
            {formatName(row.person.name)}
          {:else if voice}
            <Label label={attachment.string.VoiceMessage} />
          {/if}
        </span>
        <RowPlace {row} />
      </span>
      <span class="sub overflow-label"><DayLabel value={row.createdOn} /></span>
    </span>
  </div>

  <div class="player">
    <AudioBar id={row.attachment.file} {src} size={row.attachment.size} duration={row.durationSec} {playback} />
  </div>

  <span class="file" title={row.attachment.name}>
    <FileBadge {...formatBadge(row.format, row.attachment.name)} variant="mini" />
    <!-- A voice message's file name is generated and says nothing. -->
    {#if !voice}
      <span class="file-name overflow-label"><MarkedText text={row.nameHighlight ?? row.attachment.name} /></span>
    {/if}
    {#if size != null}<span class="size" class:after-name={!voice}>{size}</span>{/if}
    <span class="download"><DownloadLink href={src} name={row.attachment.name} /></span>
  </span>
  {#if snippet != null && snippet !== ''}
    <span class="transcript"><MarkedText text={snippet} /></span>
  {/if}
</div>

<style lang="scss">
  .card {
    display: flex;
    flex-direction: column;
    flex-grow: 1;
    gap: 0.75rem;
    min-width: 0;
    padding: 0.875rem;
    border: 1px solid color-mix(in srgb, var(--global-ui-BorderColor) 50%, transparent);
    border-radius: calc(var(--small-BorderRadius) + 0.375rem);
    cursor: pointer;
    transition:
      box-shadow 0.15s ease,
      border-color 0.15s ease;

    // The hover look alone is too faint to find the card the keys are on.
    &:focus-visible {
      outline: 0.125rem solid var(--global-focus-BorderColor);
      outline-offset: 0.125rem;
    }

    &:hover,
    &.highlighted,
    &:focus-visible {
      // Neutral: the card has no format colour for the edge to echo.
      border-color: color-mix(in srgb, var(--theme-caption-color) 7%, var(--global-ui-BorderColor));
      box-shadow: 0 0.375rem 1.25rem -0.75rem var(--global-popover-ShadowColor);
    }
  }

  .head {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    min-width: 0;
  }

  .avatar {
    display: inline-flex;
    flex-shrink: 0;
  }

  .who {
    display: flex;
    flex-direction: column;
    flex-grow: 1;
    min-width: 0;
  }

  .top {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }

  .name {
    flex-shrink: 0;
    max-width: 60%;
    font-weight: 500;
    line-height: 1.25rem;
    color: var(--theme-caption-color);
  }

  .sub {
    font-size: 0.75rem;
    line-height: 1rem;
    color: var(--theme-darker-color);
  }

  // The card is wider than a message: the waveform takes all of it.
  .player :global(.waveform) {
    max-width: none;
  }

  .file {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    min-width: 0;
    font-size: 0.75rem;
    line-height: 1.5rem;
    color: var(--theme-dark-color);
  }

  .file-name {
    flex-shrink: 1;
    min-width: 0;
    color: var(--theme-caption-color);
  }

  .size {
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;

    &.after-name::before {
      content: '·';
      margin-right: 0.375rem;
    }
  }

  .download {
    display: flex;
    flex-shrink: 0;
    margin-left: auto;
    padding-left: 0.5rem;
  }

  // Shown with the card's hover, as on a message.
  @media (hover: hover) {
    .card:not(:hover, :focus-within, .highlighted) .download {
      opacity: 0;
    }
  }

  .transcript {
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    font-size: 0.8125rem;
    line-height: 1.25rem;
    color: var(--theme-content-color);
    word-break: break-word;
  }
</style>
