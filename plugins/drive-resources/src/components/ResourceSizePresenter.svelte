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
  import type { WithLookup } from '@hcengineering/core'
  import type { Resource } from '@hcengineering/drive'
  import { humanReadableFileSize } from '@hcengineering/ui'

  import { isFolder } from '../utils'
  import FolderContents from './FolderContents.svelte'

  export let value: WithLookup<Resource>

  $: folder = isFolder(value) ? value : undefined
  $: size = value.$lookup?.file?.size
</script>

{#if folder !== undefined}
  <FolderContents value={folder} />
{:else if size != null}
  <span class="overflow-label select-text">{humanReadableFileSize(size)}</span>
{/if}
