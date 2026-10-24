<!--
// Copyright © 2023, 2025 Hardcore Engineering Inc.
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
  import type { Attachment } from '@hcengineering/attachment'
  import type { Ref } from '@hcengineering/core'
  import { Scroller } from '@hcengineering/ui'
  import { FileTile } from '@hcengineering/ui/kit'

  import AttachmentTile from './file/AttachmentTile.svelte'
  import { uploadTiles, type UploadQueue } from './file/uploads'

  export let attachments: Attachment[] = []
  export let progress = false
  export let readonly: boolean = false
  export let uploads: UploadQueue | undefined = undefined
  /** Not docs yet: removable whatever the space forbids. */
  export let drafts: ReadonlySet<Ref<Attachment>> = new Set()

  $: tiles = uploadTiles(attachments, uploads, (doc) => drafts.has(doc._id))
</script>

<div class="attachment-list-container">
  <Scroller noStretch shrink>
    <div class="attachment-list">
      {#each tiles as tile (tile.doc._id)}
        <AttachmentTile
          value={tile.doc}
          scale="large"
          upload={tile.upload}
          draft={tile.draft}
          local={uploads?.picture(tile.doc._id)}
          removable={!readonly}
          on:remove
          on:retry={() => uploads?.retry(tile.doc._id)}
        />
      {/each}
      {#if progress}
        <FileTile scale="large" loading />
      {/if}
    </div>
  </Scroller>
</div>

<style lang="scss">
  // No box of its own: each tile has its frame, a second one around them all was a plate.
  .attachment-list-container {
    display: flex;
    flex-direction: column;
    margin-top: 0.5rem;
    min-width: 0;
    max-height: none;
    color: var(--theme-caption-color);
  }

  .attachment-list {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding: 0.125rem;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }

    > * {
      flex-shrink: 0;
    }
  }
</style>
