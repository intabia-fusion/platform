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
  import IssueGroup from './IssueGroup.svelte'
  import { fixedColumns } from './fixedColumns'
  import type { Issue, Status } from '../types'

  export let groups: Array<{ name: string, status: Status, estimation?: string, issues: Issue[] }>
  // px, the parent width when absent
  export let width: number | undefined = undefined

  fixedColumns()
</script>

<div class="kit-issue-list list-container" style:width={width !== undefined ? `${width}px` : undefined}>
  {#each groups as group (group.name)}
    <IssueGroup {...group} />
  {/each}
</div>

<style>
  .kit-issue-list {
    display: flex;
    flex-direction: column;
  }
</style>
