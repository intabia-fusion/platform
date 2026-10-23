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
  import type { BlobMetadata, Blob, Ref } from '@hcengineering/core'
  import { closePopup, closeTooltip } from '@hcengineering/ui'
  import { IconButton } from '@hcengineering/ui/kit'
  import view from '@hcengineering/view'
  import workbench from '@hcengineering/workbench'

  import { openFilePreviewInSidebar } from '../utils'

  export let file: Ref<Blob> | undefined
  export let name: string
  export let contentType: string
  export let metadata: BlobMetadata | undefined
  export let size: number | undefined = undefined
</script>

{#if file}
  <IconButton
    icon={view.icon.Sidebar}
    kind="ghost"
    size="small"
    iconSize="medium"
    tooltip={{ label: workbench.string.OpenInSidebar }}
    on:click={() => {
      if (file === undefined) return
      closeTooltip()
      closePopup()
      void openFilePreviewInSidebar(file, name, contentType, metadata, size)
    }}
  />
{/if}
