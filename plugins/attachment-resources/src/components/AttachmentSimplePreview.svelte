<!--
// Copyright © 2026 Intabia Fusion.
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
  import { Attachment } from '@hcengineering/attachment'
  import { BlobType, WithLookup } from '@hcengineering/core'
  import { Image } from '@hcengineering/presentation'
  import { getType } from '../utils'

  export let value: WithLookup<Attachment> | BlobType
  export let width = 200
  export let height = 200

  $: type = getType(value.type)
  $: isImage = type === 'image'
  $: hasThumbnail = value.metadata?.thumbnail != null

  function getExtensionLabel (name: string): string {
    return name.split('.').pop()?.slice(0, 4).toUpperCase() ?? 'FILE'
  }
</script>

{#if isImage || hasThumbnail}
  <Image
    blob={value.file}
    loading="lazy"
    alt={value.name}
    fit="cover"
    responsive
    {width}
    {height}
    blurhash={value.metadata?.thumbnail?.blurhash}
    showLoading
  />
{:else}
  <div class="preview">
    {getExtensionLabel(value.name)}
  </div>
{/if}

<style lang="scss">
  .preview {
    display: flex;
    align-items: center;
    justify-content: center;

    flex-shrink: 0;

    font-weight: 500;
    color: var(--primary-button-color);
    background-color: var(--primary-button-default);
  }
</style>
