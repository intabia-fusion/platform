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
  import { SortingOrder } from '@hcengineering/core'
  import { createQuery } from '@hcengineering/presentation'
  import { clearSettingsStore, settingsStore } from '@hcengineering/setting-resources'
  import task, { ProjectType, ProjectTypeDescriptor, TaskType } from '@hcengineering/task'
  import { ButtonIcon, Icon, IconAdd, Label } from '@hcengineering/ui'
  import { Workflow } from '@hcengineering/workflow'

  import plugin from '../plugin'
  import { navigateToWorkflow } from '../location'
  import CreateWorkflow from './CreateWorkflow.svelte'
  import IconWorkflow from './icon/Workflow.svelte'

  export let type: ProjectType
  export let descriptor: ProjectTypeDescriptor | undefined = undefined
  export let disabled = true

  const taskTypesQuery = createQuery()
  const workflowsQuery = createQuery()

  let isWorkflowsLoading = true
  let isTaskTypeLoading = true

  let taskTypes: TaskType[] = []
  $: taskTypesQuery.query(task.class.TaskType, { parent: type._id }, (res) => {
    taskTypes = res
    isTaskTypeLoading = false
  })

  let workflows: Workflow[] = []
  $: workflowsQuery.query(
    plugin.class.Workflow,
    { projectType: type._id },
    (res) => {
      workflows = res
      isWorkflowsLoading = false
    },
    { sort: { name: SortingOrder.Ascending } }
  )

  function getTaskTypeName (taskTypeId: string): string | undefined {
    return taskTypes.find((tt) => tt._id === taskTypeId)?.name
  }

  $: isLoading = isWorkflowsLoading || isTaskTypeLoading
  $: addDisabled = disabled || taskTypes.length === 0
</script>

<div class="hulyTableAttr-header font-medium-12">
  <Icon icon={plugin.icon.Workflows} size="small" />
  <span><Label label={plugin.string.Workflows} /></span>
  <ButtonIcon
    kind="primary"
    icon={IconAdd}
    size="small"
    dataId="btnAddWorkflow"
    disabled={addDisabled}
    loading={isLoading}
    tooltip={taskTypes.length === 0 ? { label: plugin.string.TaskTypeRequired } : undefined}
    on:click={() => {
      if (disabled) return
      if ($settingsStore.id !== 'createWorkflow') {
        clearSettingsStore()
      }
      $settingsStore = { id: 'createWorkflow', component: CreateWorkflow, props: { type, taskTypes } }
    }}
  />
</div>

{#if workflows.length > 0 && !isLoading}
  <div class="hulyTableAttr-content workflow">
    {#each workflows as workflow}
      {@const taskTypeName = getTaskTypeName(workflow.taskType)}
      <button
        class="hulyTableAttr-content__row"
        on:click|stopPropagation={() => {
          navigateToWorkflow(workflow._id)
        }}
      >
        <span class="hulyTableAttr-content__row-icon-wrapper">
          <IconWorkflow size="small" />
        </span>
        <span class="hulyTableAttr-content__row-label font-medium-14" title={workflow.name}>
          {workflow.name}
        </span>
        <span class="hulyTableAttr-content__row-label grow dark font-regular-14" style="flex-shrink: 0;">
          {#if taskTypeName}
            {taskTypeName}
          {:else}
            <Label label={plugin.string.UnknownTaskType} />
          {/if}
        </span>
      </button>
    {/each}
  </div>
{/if}
