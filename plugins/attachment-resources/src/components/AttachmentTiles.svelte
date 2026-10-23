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
  import type { Attachment } from '@hcengineering/attachment'
  import { createEventDispatcher } from 'svelte'

  import AttachmentTile from './file/AttachmentTile.svelte'
  import { uploadTiles, type UploadQueue } from './file/uploads'

  /** Files of a create form: nothing is saved yet, so the author removes any of them. */
  export let attachments: Attachment[] = []
  export let uploads: UploadQueue | undefined = undefined
  export let removable: boolean = true

  const dispatch = createEventDispatcher<{ remove: Attachment }>()

  $: tiles = uploadTiles(attachments, uploads, () => true)
</script>

{#each tiles as tile (tile.doc._id)}
  <AttachmentTile
    value={tile.doc}
    upload={tile.upload}
    draft={tile.draft}
    local={uploads?.picture(tile.doc._id)}
    {removable}
    on:remove={() => dispatch('remove', tile.doc)}
    on:retry={() => uploads?.retry(tile.doc._id)}
  />
{/each}
