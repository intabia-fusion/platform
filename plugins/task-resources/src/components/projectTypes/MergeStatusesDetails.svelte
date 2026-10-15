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
  import type { Ref, Status } from '@hcengineering/core'
  import { translate } from '@hcengineering/platform'
  import { getClient } from '@hcengineering/presentation'
  import taskPlugin from '@hcengineering/task'
  import type { ProjectType, TaskType } from '@hcengineering/task'
  import { Button, Label, closePopup, themeStore } from '@hcengineering/ui'
  import workflow from '@hcengineering/workflow'
  import { statusStore } from '@hcengineering/view-resources'
  import task from '../../plugin'
  import { openWorkflowSettings } from '../../utils'
  import StatePresenter from '../state/StatePresenter.svelte'

  export let type: ProjectType
  export let sources: Status[]
  export let target: Status
  export let taskTypes: TaskType[]
  // Why the merge was refused, set by the confirmation dialog
  export let conflicts: Array<{
    kind?: string
    message: string
    workflow?: any
    names?: string[]
    statuses?: string[]
  }> = []

  function statusName (id: string | undefined): string {
    return $statusStore.byId.get(id as Ref<Status>)?.name ?? id ?? ''
  }

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
      total += (await client.findAll(taskPlugin.class.Task, { status: source._id }, { limit: 1, total: true })).total
    }
    tasks = total
    const removed = new Set<Ref<Status>>(sources.map((it) => it._id))
    const workflows = await client.findAll(workflow.class.Workflow, { projectType: type._id })
    const transitions =
      workflows.length > 0
        ? await client.findAll(
          workflow.class.WorkflowTransition,
          { attachedTo: { $in: workflows.map((it) => it._id) } },
          { projection: { attachedTo: 1, from: 1, to: 1 } }
        )
        : []
    const used = new Set<string>()
    for (const wf of workflows) {
      if ((wf.initialStatuses ?? []).some((it) => removed.has(it))) used.add(wf._id)
    }
    for (const t of transitions) {
      if (removed.has(t.to) || (t.from ?? []).some((it) => removed.has(it))) used.add(t.attachedTo)
    }
    workflowNames = workflows
      .filter((wf) => used.has(wf._id))
      .map((wf) => taskTypes.find((tt) => tt._id === wf.taskType)?.name ?? wf.name)
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
      {#each conflicts as conflict}
        <div class="flex-row-center flex-gap-2">
          {#if conflict.kind === 'self' && conflict.names !== undefined}
            <Label label={task.string.MergeConflictSelf} params={{ name: conflict.names[0] }} />
          {:else if conflict.kind === 'conflict' && conflict.names?.length === 2}
            <Label
              label={task.string.MergeConflictClash}
              params={{ name: conflict.names[0], other: conflict.names[1] }}
            />
          {:else if conflict.kind === 'forbiddenTask' && conflict.statuses?.length === 2}
            <Label
              label={task.string.MergeConflictTask}
              params={{ from: statusName(conflict.statuses[0]), to: statusName(conflict.statuses[1]) }}
            />
          {:else}
            <span>{conflict.message}</span>
          {/if}
          {#if conflict.workflow !== undefined}
            <Button
              kind="link"
              size="small"
              label={task.string.MergeStatusesOpenWorkflow}
              on:click={() => {
                openWorkflowSettings(conflict.workflow)
                closePopup()
              }}
            />
          {/if}
        </div>
      {/each}
      {#if conflicts.some((it) => it.kind === 'self' || it.kind === 'conflict')}
        <Label label={task.string.MergeStatusesSameTaskType} />
      {/if}
    </div>
  {/if}
</div>
