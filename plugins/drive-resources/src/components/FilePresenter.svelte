<!--
//
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
//
-->
<script lang="ts">
  import type { WithLookup } from '@hcengineering/core'
  import type { File } from '@hcengineering/drive'
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import { tooltip } from '@hcengineering/ui'
  import type { ObjectPresenterType } from '@hcengineering/view'
  import { DocNavLink, ObjectMention } from '@hcengineering/view-resources'

  import { formatFileVersion } from '../utils'
  import FileIcon from './FileIcon.svelte'

  export let value: WithLookup<File>
  export let inline: boolean = false
  export let disabled: boolean = false
  export let accent: boolean = false
  export let noUnderline: boolean = false
  export let shouldShowAvatar = true
  export let type: ObjectPresenterType = 'link'

  export let shouldShowVersion = false
</script>

{#if value}
  {#if inline}
    <ObjectMention object={value} {disabled} />
  {:else if type === 'link'}
    <DocNavLink object={value} {disabled} {accent} {noUnderline}>
      <div class="flex-presenter" use:tooltip={{ label: getEmbeddedLabel(value.title) }}>
        {#if shouldShowAvatar}
          <span class="preview"><FileIcon name={value.title} version={value.$lookup?.file} /></span>
        {/if}
        <div class="label nowrap flex flex-gap-2" class:no-underline={noUnderline || disabled} class:fs-bold={accent}>
          <span>{value.title}</span>
          {#if shouldShowVersion}
            <span>•</span>
            <span>{formatFileVersion(value.version)}</span>
          {/if}
        </div>
      </div>
    </DocNavLink>
  {:else if type === 'text'}
    <span class="overflow-label" use:tooltip={{ label: getEmbeddedLabel(value.title) }}>
      {value.title}
    </span>
  {/if}
{/if}

<style lang="scss">
  // A block, not a flex box: the inline icon inside stays out of the link's hover underline.
  .preview {
    display: block;
    flex-shrink: 0;
    margin-right: 0.5rem;

    > :global(*) {
      vertical-align: top;
    }
  }
</style>
