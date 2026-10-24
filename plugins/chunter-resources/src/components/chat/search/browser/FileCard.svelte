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
  import { formatBadge } from '@hcengineering/attachment'
  import { pageImage, pictureImage } from '@hcengineering/attachment-resources'
  import { getFileUrl } from '@hcengineering/presentation'
  import { Label } from '@hcengineering/ui'
  import { FileCard } from '@hcengineering/ui/kit'
  import { createEventDispatcher } from 'svelte'

  import type { AttachmentRow } from '../../../../search/attachments'
  import { showItemMenu } from '../../../../search/menu'
  import chunterResources from '../../../../plugin'
  import DayLabel from './DayLabel.svelte'
  import MarkedText from './MarkedText.svelte'
  import RowAuthor from './RowAuthor.svelte'
  import RowPlace from './RowPlace.svelte'

  export let row: AttachmentRow
  export let inContent: boolean = false

  const dispatch = createEventDispatcher()

  let menuOpen = false

  $: file = row.attachment
  $: url = getFileUrl(file.file, file.name)
</script>

<FileCard
  --file-card-width="100%"
  name={file.name}
  size={file.size}
  badge={formatBadge(row.format, file.name)}
  picture={pictureImage(row.format, file.file, file.name)}
  blurhash={file.metadata?.thumbnail?.blurhash}
  page={pageImage(row.format, file.file, file.name)}
  {url}
  contentType={file.type}
  cacheKey={file.file}
  nameLines={2}
  highlighted={menuOpen}
  on:open={() => dispatch('open')}
  on:contextmenu={(e) => {
    menuOpen = true
    showItemMenu(e.detail, {
      open: () => dispatch('open'),
      download: { file: file.file, name: file.name },
      message: () => dispatch('message'),
      onClose: () => (menuOpen = false)
    })
  }}
>
  <MarkedText slot="name" text={row.nameHighlight ?? file.name} />
  <!-- The dot parts it from the size, which the card leaves out when unknown. -->
  <span slot="meta"
    >{#if file.size > 0}·
    {/if}<DayLabel value={row.createdOn} /></span
  >
  {#if inContent}
    <span class="hint"><Label label={chunterResources.string.FoundInFileContent} /></span>
  {/if}
  <!-- Author and place on lines of their own: side by side they squeezed each other to an ellipsis. -->
  <span class="footer">
    <RowAuthor {row} />
    <RowPlace {row} reserve />
  </span>
</FileCard>

<style lang="scss">
  .hint {
    font-size: 0.75rem;
    font-style: italic;
    color: var(--theme-darker-color);
  }

  // At the bottom, so author and chat line up across a row.
  .footer {
    display: flex;
    flex-direction: column;
    margin-top: auto;
    align-items: flex-start;
    gap: 0.375rem;
    min-width: 0;
    // The bottom matches the skeleton of the list, so nothing moves when the cards arrive.
    padding: 0.375rem 0 0.125rem;
    font-size: 0.75rem;
    color: var(--theme-dark-color);
  }
</style>
