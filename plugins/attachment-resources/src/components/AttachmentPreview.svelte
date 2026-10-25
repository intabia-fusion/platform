<!--
// Copyright © 2020, 2021 Anticrm Platform Contributors.
// Copyright © 2021, 2024 Hardcore Engineering Inc.
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
  import { AttachmentKind, getAttachmentCategory, type Attachment } from '@hcengineering/attachment'
  import type { BlobType, WithLookup } from '@hcengineering/core'
  import presentation, { downloadFile, getClient } from '@hcengineering/presentation'
  import ui, { Component, Label } from '@hcengineering/ui'
  import { IconButton, MediaToolbar } from '@hcengineering/ui/kit'
  import view from '@hcengineering/view'

  import type { AttachmentImageSize } from '../types'
  import { getCustomPresenter, getType, isAttachment, showAttachmentPreviewPopup } from '../utils'
  import { showAttachmentMenu } from './file/menu'
  import AttachmentImagePreview from './AttachmentImagePreview.svelte'
  import AttachmentVideoPreview from './AttachmentVideoPreview.svelte'
  import AudioAttachment from './file/AudioAttachment.svelte'
  import FileCard from './file/FileCard.svelte'
  import LinkCard from './file/LinkCard.svelte'

  export let value: WithLookup<Attachment> | BlobType
  export let isSaved: boolean = false
  export let imageSize: AttachmentImageSize = 'auto'
  export let removable: boolean = false
  export let videoPreload = false
  export let withActions = true

  const hierarchy = getClient().getHierarchy()

  let hovered = false

  $: type = shownAs(value)

  // An image type no browser draws (a design source) is shown as a file card.
  function shownAs (value: Attachment | BlobType): ReturnType<typeof getType> {
    const type = getType(value.type)
    if (type !== 'image') return type
    return getAttachmentCategory(value.type, value.name).kind === AttachmentKind.Media ? type : 'other'
  }
  // A subclass of Attachment (e.g. AudioTranscribe) may register its own ObjectPresenter mixin;
  // render that instead of the generic audio player so voice-notes show their transcript.
  $: customPresenter = isAttachment(value) ? getCustomPresenter(hierarchy, value._class) : undefined

  /** Opens the viewer within the list, so it steps to the neighbours. */
  export let openViewer: ((value: Attachment) => void) | undefined = undefined

  function open (): void {
    if (openViewer != null && isAttachment(value)) openViewer(value)
    else showAttachmentPreviewPopup(value)
  }

  // Only the most used actions on media; the rest is in the right-click menu.
  function menu (e: MouseEvent): void {
    if (!withActions) return
    hovered = true
    showAttachmentMenu(e, value, { isSaved, removable, onClose: () => (hovered = false) })
  }
</script>

{#if customPresenter !== undefined}
  <Component is={customPresenter} props={{ value, isSaved, removable, withActions }} />
{:else if type === 'video'}
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="content buttonContainer flex-center" on:contextmenu={menu}>
    <AttachmentVideoPreview {value} preload={videoPreload} />
    <!-- On a touch screen a tap opens the viewer, as for a picture, instead of the small inline player. -->
    <button type="button" class="tap-open" on:click|stopPropagation={open}>
      <span class="hidden-label"><Label label={view.string.Open} /></span>
    </button>
    {#if withActions}
      <MediaToolbar visible={hovered}>
        <IconButton
          icon={view.icon.Open}
          kind="ghost"
          size="small"
          iconSize="small"
          tooltip={{ label: view.string.Open }}
          on:click={open}
        />
        <IconButton
          icon={ui.icon.Download}
          kind="ghost"
          size="small"
          iconSize="small"
          tooltip={{ label: presentation.string.Download }}
          on:click={() => {
            downloadFile(value.file, value.name)
          }}
        />
      </MediaToolbar>
    {/if}
  </div>
{:else if type === 'image'}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    class="content flex-center buttonContainer cursor-pointer"
    on:contextmenu={menu}
    on:click={(e) => {
      e.preventDefault()
      e.stopPropagation()
      open()
    }}
  >
    <AttachmentImagePreview {value} size={imageSize} />
    {#if withActions}
      <!-- A tap opens the viewer, whose header has the download. -->
      <MediaToolbar visible={hovered}>
        <IconButton
          icon={ui.icon.Download}
          kind="ghost"
          size="small"
          iconSize="small"
          tooltip={{ label: presentation.string.Download }}
          on:click={() => {
            downloadFile(value.file, value.name)
          }}
        />
      </MediaToolbar>
    {/if}
  </div>
{:else if type === 'audio'}
  <AudioAttachment {value} {isSaved} {removable} {withActions} />
{:else if type === 'link-preview'}
  <LinkCard {value} {removable} />
{:else}
  <FileCard {value} {isSaved} {removable} {withActions} {openViewer} />
{/if}

<style lang="scss">
  .buttonContainer {
    position: relative;
    width: fit-content;
    height: fit-content;
  }

  .content {
    max-width: 25rem;
    max-height: 25rem;
    scroll-snap-align: start;
  }

  .tap-open {
    display: none;
  }

  @media (hover: none) {
    .tap-open {
      position: absolute;
      inset: 0;
      display: block;
      padding: 0;
      border: none;
      background: none;
      cursor: pointer;
    }
  }

  .hidden-label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
</style>
