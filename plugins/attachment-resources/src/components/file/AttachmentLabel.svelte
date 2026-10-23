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
  import { formatBadge, getAttachmentCategory, type Attachment } from '@hcengineering/attachment'
  import type { BlobType, WithLookup } from '@hcengineering/core'
  import { getClient, getFileUrl } from '@hcengineering/presentation'
  import { Label } from '@hcengineering/ui'
  import { FileBadge } from '@hcengineering/ui/kit'

  import attachmentRes from '../../plugin'
  import { isVoiceAttachment, showAttachmentPreviewPopup } from '../../utils'
  import AttachmentTile from './AttachmentTile.svelte'
  import { showAttachmentMenu } from './menu'

  export let value: WithLookup<Attachment> | BlobType | undefined
  export let disabled: boolean = false
  export let removable: boolean = false
  export let showPreview: boolean = false
  /** The compact line of a notification, where a tile would not fit. */
  export let preview: boolean = false

  const hierarchy = getClient().getHierarchy()

  $: voice = value != null && isVoiceAttachment(hierarchy, value)
  $: category = value != null ? getAttachmentCategory(value.type, value.name, voice) : undefined

  $: url = value != null && !disabled ? getFileUrl(value.file, value.name) : undefined

  // A plain click opens the viewer; with a modifier the browser opens the file itself, as on any link.
  function open (e: MouseEvent): void {
    if (value == null || disabled || e.ctrlKey || e.metaKey || e.shiftKey) return
    e.preventDefault()
    showAttachmentPreviewPopup(value)
  }

  function dragStart (e: DragEvent): void {
    if (value == null || url == null) return
    e.dataTransfer?.setData('application/contentType', value.type)
    e.dataTransfer?.setData('text/plain', url)
    e.dataTransfer?.setData('text/uri-list', new URL(url, location.href).href + '\r\n')
  }
</script>

{#if value != null && showPreview && !preview && !disabled}
  <AttachmentTile {value} scale="large" />
{:else if value != null && category != null}
  <a
    class="attachment-label"
    class:disabled
    href={url}
    target="_blank"
    rel="noopener noreferrer"
    title={value.name}
    on:click|stopPropagation={open}
    on:dragstart={dragStart}
    on:contextmenu={(e) => {
      if (value == null || disabled) return
      showAttachmentMenu(e, value, { removable })
    }}
  >
    <FileBadge {...formatBadge(category.format, value.name)} variant="mini" />
    <span class="name">
      {#if voice}<Label label={attachmentRes.string.VoiceMessage} />{:else}{value.name}{/if}
    </span>
  </a>
{/if}

<style lang="scss">
  .attachment-label {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    max-width: 100%;
    min-width: 0;
    font: inherit;
    color: var(--theme-caption-color);
    text-decoration: none;
    cursor: pointer;
    vertical-align: middle;

    &:hover .name {
      text-decoration: underline;
    }

    &.disabled {
      cursor: default;

      &:hover .name {
        text-decoration: none;
      }
    }
  }

  .name {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
</style>
