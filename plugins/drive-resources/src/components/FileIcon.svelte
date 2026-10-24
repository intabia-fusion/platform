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
  import type { FileVersion } from '@hcengineering/drive'
  import { FileBadge, FileImage, type ImageSource } from '@hcengineering/ui/kit'

  import { filePreview } from '../preview'

  export let name: string
  export let version: FileVersion | undefined = undefined

  const SIZE = 24

  // A page would make the preview service render every document of a long list: the dense badge says enough.
  $: ({ badge, picture } = filePreview(name, version))

  // The source that failed, not a flag: a reused line given another file tries it.
  let failed: ImageSource | undefined
</script>

<span class="file-icon">
  {#if picture != null && picture !== failed}
    <span class="picture">
      <FileImage
        source={picture}
        width={SIZE}
        height={SIZE}
        cacheKey={version?.file}
        on:error={() => (failed = picture)}
      />
    </span>
  {:else}
    <FileBadge {...badge} variant="row" />
  {/if}
</span>

<style lang="scss">
  .file-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 1.5rem;
    height: 1.5rem;
  }

  .picture {
    width: 1.5rem;
    height: 1.5rem;
    overflow: hidden;
    border-radius: var(--extra-small-BorderRadius);
    background-color: color-mix(in srgb, var(--theme-caption-color) 8%, transparent);

    :global(img) {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }
</style>
