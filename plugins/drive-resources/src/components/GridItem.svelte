<!--
// Copyright © 2024 Hardcore Engineering Inc.
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
  import type { WithLookup } from '@hcengineering/core'
  import type { Resource } from '@hcengineering/drive'
  import { getClient, getFileUrl } from '@hcengineering/presentation'
  import { AudioCover, FileCard, FileCover } from '@hcengineering/ui/kit'
  import { TimestampPresenter, openDoc, showMenu } from '@hcengineering/view-resources'
  import { createEventDispatcher } from 'svelte'

  import { filePreview } from '../preview'
  import { isFolder } from '../utils'
  import FolderTile from './FolderTile.svelte'
  import ResourceAuthor from './ResourceAuthor.svelte'
  import VideoCover from './VideoCover.svelte'

  export let object: WithLookup<Resource>
  export let selected: boolean = false

  const hierarchy = getClient().getHierarchy()
  const dispatch = createEventDispatcher()

  $: version = object.$lookup?.file
  $: folder = isFolder(object) ? object : undefined
  $: preview = filePreview(object.title, version)
  $: modified = version?.lastModified ?? object.createdOn ?? object.modifiedOn
  $: url = version != null ? getFileUrl(version.file, object.title) : ''

  let menu = false

  function open (): void {
    void openDoc(hierarchy, object)
  }

  function showActions (e: MouseEvent): void {
    menu = true
    showMenu(e, { object }, () => {
      menu = false
    })
  }
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="grid-item" on:mouseenter={() => dispatch('obj-focus', object)}>
  {#if folder !== undefined}
    <FolderTile
      value={folder}
      active={selected || menu}
      on:open={open}
      on:contextmenu={(e) => {
        showActions(e.detail)
      }}
    />
  {:else}
    <FileCard
      --file-card-width="100%"
      name={object.title}
      size={version?.size ?? 0}
      badge={preview.badge}
      {url}
      contentType={version?.type ?? ''}
      nameLines={2}
      highlighted={selected || menu}
      on:open={open}
      on:contextmenu={(e) => {
        showActions(e.detail)
      }}
    >
      <!-- A slot given is always used, so the usual cover is drawn here too. -->
      <svelte:fragment slot="cover">
        {#if preview.audio && version != null}
          <AudioCover id={version.file} src={url} badge={preview.badge} />
        {:else if preview.video}
          <VideoCover
            badge={preview.badge}
            picture={preview.picture}
            blurhash={preview.blurhash}
            playlist={preview.playlist}
            duration={preview.duration}
            alt={object.title}
            cacheKey={version?.file}
          />
        {:else}
          <FileCover
            badge={preview.badge}
            picture={preview.picture}
            blurhash={preview.blurhash}
            page={preview.page}
            alt={object.title}
            cacheKey={version?.file}
          />
        {/if}
      </svelte:fragment>
      <!-- The dot parts it from the size, which the card leaves out when unknown. -->
      <span slot="meta"
        >{#if (version?.size ?? 0) > 0}·
        {/if}<TimestampPresenter value={modified} /></span
      >
      <span class="author">
        <ResourceAuthor value={object.createdBy} />
      </span>
    </FileCard>
  {/if}
</div>

<style lang="scss">
  // The cards of a row share its height, so the authors line up at the bottom.
  .grid-item {
    display: flex;
    height: 100%;

    > :global(*) {
      flex-grow: 1;
    }
  }

  .author {
    display: flex;
    margin-top: auto;
    padding: 0.375rem 0 0.125rem;
    min-width: 0;
    font-size: 0.75rem;
    color: var(--theme-dark-color);
  }
</style>
