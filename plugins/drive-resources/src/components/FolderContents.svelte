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
  import type { Folder } from '@hcengineering/drive'
  import { Label } from '@hcengineering/ui'

  import drive from '../plugin'

  export let value: Folder

  // A folder no trigger has counted into yet holds nothing.
  $: folders = value.folders ?? 0
  $: files = value.files ?? 0
</script>

<span class="folder-contents">
  {#if folders === 0 && files === 0}
    <Label label={drive.string.FolderEmpty} />
  {:else}
    {#if folders > 0}<Label label={drive.string.FoldersCount} params={{ count: folders }} />{/if}
    {#if folders > 0 && files > 0}<span>·</span>{/if}
    {#if files > 0}<Label label={drive.string.FilesCount} params={{ count: files }} />{/if}
  {/if}
</span>

<style lang="scss">
  .folder-contents {
    display: inline-flex;
    gap: 0.25rem;
    white-space: nowrap;
  }
</style>
