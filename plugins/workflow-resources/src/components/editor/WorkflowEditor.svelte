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
  import core, { notEmpty, Ref, type Status, WithLookup } from '@hcengineering/core'
  import { Asset } from '@hcengineering/platform'
  import { createQuery, getClient, IconDownload, MessageBox } from '@hcengineering/presentation'
  import task, { type ProjectType, type TaskType } from '@hcengineering/task'
  import { ButtonIcon, EditBox, IconDelete, IconSettings, Loading, Scroller, showPopup } from '@hcengineering/ui'
  import view from '@hcengineering/view'
  import { removeWorkflow, type Workflow, type WorkflowTransition } from '@hcengineering/workflow'

  import plugin from '../../plugin'
  import { navigateToWorkflow } from '../../location'
  import TaskTypeEditor from './TaskTypeEditor.svelte'
  import TransitionsEditor from './TransitionsEditor.svelte'

  export let spaceType: ProjectType
  export let objectId: Ref<Workflow>
  export let name: string | undefined = undefined
  export let icon: Asset | undefined = undefined
  export let readonly = true

  const client = getClient()

  const workflowQuery = createQuery()
  const taskTypesQuery = createQuery()
  const statusesQuery = createQuery()

  // Load selected workflow with transitions lookup
  let workflow: WithLookup<Workflow> | undefined
  let taskType: TaskType | undefined

  let isWorkflowLoading = true
  let isStatusesLoading = true

  $: workflowQuery.query(
    plugin.class.Workflow,
    { _id: objectId },
    (res) => {
      workflow = res.shift()
      taskType = workflow?.$lookup?.taskType
      isWorkflowLoading = false
    },
    {
      lookup: {
        _id: { transitions: plugin.class.WorkflowTransition },
        taskType: task.class.TaskType
      }
    }
  )

  $: name = workflow?.name
  $: icon = plugin.icon.Workflow

  // Load TaskTypes for spaceType
  let taskTypes: TaskType[] = []
  $: taskTypesQuery.query(task.class.TaskType, { _id: { $in: spaceType.tasks } }, (res) => {
    taskTypes = res
  })

  // Load Statuses for the selected workflow's task type
  let statuses: Status[] = []
  $: if (taskType !== undefined) {
    statusesQuery.query(core.class.Status, { _id: { $in: taskType.statuses } }, (res) => {
      statuses = res
      isStatusesLoading = false
    })
  }

  let transitions: WorkflowTransition[] = []
  $: transitions = (workflow?.$lookup?.transitions ?? []) as WorkflowTransition[]

  async function saveName (): Promise<void> {
    if (workflow !== undefined) {
      await client.update(workflow, { name: workflow.name.trim() })
    }
  }

  async function handleRemove (): Promise<void> {
    showPopup(MessageBox, {
      label: plugin.string.DeleteWorkflow,
      message: plugin.string.DeleteWorkflowConfirm,
      action: async () => {
        await removeWorkflow(client, objectId)
        navigateToWorkflow(undefined)
      }
    })
  }

  async function handleTaskTypeChange (evt: CustomEvent<Ref<TaskType>>): Promise<void> {
    if (workflow === undefined) return

    // TODO: implement
    console.log('TODO: change task type', evt.detail)
  }

  async function handleSettings (): Promise<void> {
    // TODO: implement
    console.log('TODO: change workflow settings')
  }

  async function handleExport (): Promise<void> {
    // TODO: implement
    console.log('TODO: export workflow')
  }

  $: loading = isWorkflowLoading || isStatusesLoading
</script>

<div class="hulyComponent-content__container columns">
  <div class="hulyComponent-content__column content">
    {#if loading}
      <Loading />
    {:else if workflow && taskType}
      <Scroller align="center" padding="var(--spacing-3)" bottomPadding="var(--spacing-3)">
        <div class="hulyComponent-content gap">
          <div class="header flex-between flex-wrap">
            <div class="flex-grow min-w-0">
              <EditBox
                bind:value={workflow.name}
                kind="modern-ghost-large"
                on:change={saveName}
                required
                fullSize
                placeholder={plugin.string.Untitled}
              />
            </div>
            <div class="flex-row-center flex-gap-2">
              <TaskTypeEditor
                selected={taskType?._id}
                types={taskTypes.length > 0 ? taskTypes : [taskType].filter(notEmpty)}
                {readonly}
                on:change={handleTaskTypeChange}
              />
              <ButtonIcon icon={IconSettings} size="small" kind="secondary" on:click={handleSettings} />
              <ButtonIcon
                icon={IconDownload}
                tooltip={{ label: plugin.string.Export, direction: 'bottom' }}
                size="small"
                kind="secondary"
                on:click={handleExport}
              />
              <ButtonIcon
                icon={IconDelete}
                tooltip={{ label: view.string.Delete, direction: 'bottom' }}
                size="small"
                kind="secondary"
                on:click={handleRemove}
              />
            </div>
          </div>
          <div class="hulyComponent-content flex-col-center flex-gap-4">
            <TransitionsEditor {readonly} {workflow} {transitions} {statuses} {taskType} />
          </div>
        </div>
      </Scroller>
    {/if}
  </div>
</div>

<style lang="scss">
  .header {
    :global(.antiEditBox) {
      margin-left: -1rem;
    }
  }
</style>
