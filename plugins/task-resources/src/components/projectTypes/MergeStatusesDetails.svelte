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
  import core from '@hcengineering/core'
  import type { Status } from '@hcengineering/core'
  import { translate } from '@hcengineering/platform'
  import { getClient } from '@hcengineering/presentation'
  import taskPlugin from '@hcengineering/task'
  import type { MergeStatusesResult, ProjectType, TaskType } from '@hcengineering/task'
  import { Label, themeStore } from '@hcengineering/ui'
  import task from '../../plugin'
  import { loadStatusTaskCount } from '../../statusMergeApi'
  import { loadWorkflowUsage } from '../../statusUsage'
  import StatePresenter from '../state/StatePresenter.svelte'
  import MergeConflicts from './MergeConflicts.svelte'

  export let type: ProjectType
  export let sources: Status[]
  export let target: Status
  export let taskTypes: TaskType[]
  // Why the merge was refused, set by the confirmation dialog
  export let conflicts: MergeStatusesResult['conflicts'] = []

  const client = getClient()

  let targetCategory = ''
  $: categoryLabel = client.getModel().findAllSync(core.class.StatusCategory, { _id: target.category })[0]?.label
  $: if (categoryLabel !== undefined) {
    void translate(categoryLabel, {}, $themeStore.language).then((res) => {
      targetCategory = res
    })
  }

  let tasks: number | undefined
  let workflowNames: string[] = []

  async function load (): Promise<void> {
    let total = 0
    for (const source of sources) {
      // The confirmation merges without taskTypes: every task type of the project type moves
      total += await loadStatusTaskCount({ projectType: type._id, status: source._id }, undefined, async () => {
        const found = await client.findAll(taskPlugin.class.Task, { status: source._id }, { limit: 1, total: true })
        return found.total
      })
    }
    tasks = total
    const usage = await loadWorkflowUsage(client, type._id, taskTypes)
    const used = new Map(sources.flatMap((it) => usage.get(it._id) ?? []).map((wf) => [wf.id, wf.name] as const))
    workflowNames = [...used.values()]
  }
  void load()

  $: affectedTaskTypes = taskTypes
    .filter((tt) => sources.some((it) => tt.statuses.includes(it._id)))
    .map((tt) => tt.name)
</script>

<div class="flex-col flex-gap-2">
  <div class="flex-row-center flex-gap-2">
    <span class="fs-bold">
      <Label label={task.string.MergeConfirmKept} />
    </span>
    <StatePresenter value={target} projectType={type._id} />
  </div>
  <div class="flex-row-center flex-gap-2">
    <span class="fs-bold">
      <Label label={task.string.MergeConfirmRemoved} params={{ count: sources.length }} />
    </span>
    {#each sources as source (source._id)}
      <StatePresenter value={source} projectType={type._id} />
    {/each}
  </div>
  {#if tasks !== undefined}
    <div class="mt-1"><Label label={task.string.MergeConfirmTasks} params={{ count: tasks }} /></div>
  {/if}
  {#if sources.some((it) => it.category !== target.category)}
    <div><Label label={task.string.MergeConfirmCategoryChange} params={{ target: targetCategory }} /></div>
  {/if}
  {#if workflowNames.length > 0}
    <div>
      <Label
        label={task.string.MergeConfirmWorkflows}
        params={{ count: workflowNames.length, names: workflowNames.join(', ') }}
      />
    </div>
  {/if}
  {#if affectedTaskTypes.length > 0}
    <div>
      <Label label={task.string.MergeConfirmTaskTypes} params={{ names: affectedTaskTypes.join(', ') }} />
    </div>
  {/if}
  {#if conflicts.length > 0}
    <div class="flex-col flex-gap-1" style="color: var(--global-error-TextColor)">
      <Label label={task.string.MergeStatusesFailed} />
      <MergeConflicts {conflicts} />
      {#if conflicts.some((it) => it.kind === 'self' || it.kind === 'conflict')}
        <Label label={task.string.MergeStatusesSameTaskType} />
      {/if}
    </div>
  {/if}
</div>
