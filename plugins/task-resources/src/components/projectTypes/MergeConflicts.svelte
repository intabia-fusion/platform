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
  import type { Ref, Status } from '@hcengineering/core'
  import type { MergeStatusesResult } from '@hcengineering/task'
  import { Button, Label, closePopup } from '@hcengineering/ui'
  import { statusStore } from '@hcengineering/view-resources'
  import task from '../../plugin'
  import { openWorkflowSettings } from '../../utils'

  // Why the server refused a merge
  export let conflicts: MergeStatusesResult['conflicts'] = []

  function statusName (id: string | undefined): string {
    return $statusStore.byId.get(id as Ref<Status>)?.name ?? id ?? ''
  }
</script>

{#each conflicts as conflict}
  <div class="flex-row-center flex-gap-2">
    {#if conflict.kind === 'self' && conflict.names !== undefined}
      <Label label={task.string.MergeConflictSelf} params={{ name: conflict.names[0] }} />
    {:else if conflict.kind === 'conflict' && conflict.names?.length === 2}
      <Label label={task.string.MergeConflictClash} params={{ name: conflict.names[0], other: conflict.names[1] }} />
    {:else if conflict.kind === 'forbiddenTask' && conflict.statuses?.length === 2}
      <Label
        label={task.string.MergeConflictTask}
        params={{ from: statusName(conflict.statuses[0]), to: statusName(conflict.statuses[1]) }}
      />
    {:else}
      <span>{conflict.message}</span>
    {/if}
    {#if conflict.workflow !== undefined}
      {@const workflowId = conflict.workflow}
      <Button
        kind="link"
        size="small"
        label={task.string.MergeStatusesOpenWorkflow}
        on:click={() => {
          openWorkflowSettings(workflowId)
          closePopup()
        }}
      />
    {/if}
  </div>
{/each}
