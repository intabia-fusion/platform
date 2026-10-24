<!-- //
// Copyright © 2025 Hardcore Engineering Inc.
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
// -->

<script lang="ts">
  import { AttachmentKind, type Attachment } from '@hcengineering/attachment'
  import type { Ref, WithLookup } from '@hcengineering/core'

  import type { AttachmentImageSize } from '../types'
  import { attachmentCategory, compareAsInMessage, showAttachmentsViewer } from '../utils'
  import AttachmentList from './AttachmentList.svelte'
  import LinkCard from './file/LinkCard.svelte'

  export let attachments: WithLookup<Attachment>[]
  export let savedAttachmentsIds: Ref<Attachment>[] = []
  export let imageSize: AttachmentImageSize = 'auto'
  export let videoPreload = false
  export let isOwn = false

  let media: WithLookup<Attachment>[] = []
  let files: WithLookup<Attachment>[] = []
  let audio: WithLookup<Attachment>[] = []
  let links: WithLookup<Attachment>[] = []

  $: split(attachments)
  function split (value: WithLookup<Attachment>[]): void {
    const sorted = value.filter((it) => it != null).sort(compareAsInMessage)
    const of = (kind: AttachmentKind): Array<WithLookup<Attachment>> =>
      sorted.filter((it) => attachmentCategory(it).kind === kind)
    media = of(AttachmentKind.Media)
    files = of(AttachmentKind.File)
    audio = of(AttachmentKind.Audio)
    links = of(AttachmentKind.Link)
  }

  // In the order the groups are laid out, so the viewer steps from the pictures on to the files.
  function openViewer (value: Attachment): void {
    showAttachmentsViewer([...media, ...files, ...audio], value)
  }
</script>

<div class="groups">
  {#each [media, files] as group}
    {#if group.length > 0}
      <AttachmentList
        attachments={group}
        {savedAttachmentsIds}
        {imageSize}
        {videoPreload}
        removable={isOwn}
        {openViewer}
      />
    {/if}
  {/each}
  {#if audio.length > 0}
    <AttachmentList
      attachments={audio}
      {savedAttachmentsIds}
      {imageSize}
      {videoPreload}
      removable={isOwn}
      stacked
      {openViewer}
    />
  {/if}
  {#if links.length > 0}
    <div class="links">
      {#each links as value (value._id)}
        <LinkCard {value} removable={isOwn} />
      {/each}
    </div>
  {/if}
</div>

<style lang="scss">
  .groups {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .links {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
</style>
