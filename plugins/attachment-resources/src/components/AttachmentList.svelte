<!--
// Copyright © 2022 Hardcore Engineering Inc.
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
  import type { Ref, WithLookup } from '@hcengineering/core'

  import type { AttachmentImageSize } from '../types'
  import { showAttachmentsViewer } from '../utils'
  import AttachmentPreview from './AttachmentPreview.svelte'

  export let attachments: WithLookup<Attachment>[] = []
  export let savedAttachmentsIds: Ref<Attachment>[] = []
  export let imageSize: AttachmentImageSize | undefined = undefined
  export let videoPreload = false
  export let withActions = true
  export let removable: boolean = false
  export let stacked: boolean = false
  /** Given by a message whose files lie in several lists, so the viewer steps through all of them. */
  export let openViewer: ((value: Attachment) => void) | undefined = undefined

  // A link opens the site, not the viewer.
  $: viewable = attachments.filter((it) => getAttachmentCategory(it.type, it.name).kind !== AttachmentKind.Link)
  $: open = openViewer ?? ((value: Attachment) => { showAttachmentsViewer(viewable, value) })
</script>

{#if attachments.length}
  <div class="gallery" class:stacked>
    {#each attachments as attachment (attachment._id)}
      <AttachmentPreview
        value={attachment}
        isSaved={savedAttachmentsIds?.includes(attachment._id) ?? false}
        {imageSize}
        {videoPreload}
        {removable}
        {withActions}
        openViewer={open}
      />
    {/each}
  </div>
{/if}

<style lang="scss">
  .gallery {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;

    &.stacked {
      flex-direction: column;
      flex-wrap: nowrap;
      gap: 0.5rem;
    }
  }
</style>
