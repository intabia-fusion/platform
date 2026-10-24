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
  import { AttachmentFormat, formatBadge, getAttachmentCategory } from '@hcengineering/attachment'
  import type { Attachment } from '@hcengineering/attachment'
  import type { BlobType } from '@hcengineering/core'
  import { getClient } from '@hcengineering/presentation'
  import { FileBadge, FileImage, PageThumb } from '@hcengineering/ui/kit'

  import { isVoiceAttachment } from '../../utils'
  import { blobImage, pageImage } from './blob'

  export let value: Attachment | BlobType

  const SIZE = 40

  const hierarchy = getClient().getHierarchy()

  $: format = getAttachmentCategory(value.type, value.name, isVoiceAttachment(hierarchy, value)).format
  $: badge = formatBadge(format, value.name)
  $: picture =
    format === AttachmentFormat.Image ||
    format === AttachmentFormat.Gif ||
    (format === AttachmentFormat.Video && value.metadata?.thumbnail != null)
      ? blobImage(value.file, value.name)
      : undefined
  $: page = pageImage(format, value.file, value.name)

  let failed = false
  let noPage = false
  $: reset(value.file)

  function reset (_: string): void {
    failed = false
    noPage = false
  }
</script>

<span class="mini">
  {#if picture != null && !failed}
    <span class="picture">
      <FileImage
        source={picture}
        width={SIZE}
        height={SIZE}
        alt={value.name}
        cacheKey={value.file}
        on:error={() => (failed = true)}
      />
    </span>
  {:else if page != null && !noPage}
    <!-- Narrow as a sheet; without a page the square badge takes over. -->
    <span class="page"><PageThumb {badge} {page} cacheKey={value.file} on:error={() => (noPage = true)} /></span>
  {:else}
    <FileBadge {...badge} variant="medium" />
  {/if}
</span>

<style lang="scss">
  .mini {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 2.5rem;
    height: 2.5rem;
  }

  .picture {
    width: 100%;
    height: 100%;
    overflow: hidden;
    border-radius: var(--medium-BorderRadius);
    background-color: color-mix(in srgb, var(--theme-caption-color) 8%, transparent);

    :global(img) {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }

  .page {
    --page-thumb-width: 1.875rem;
    --page-thumb-height: 2.5rem;
    --page-thumb-corner-x: -0.375rem;
    display: flex;
  }
</style>
