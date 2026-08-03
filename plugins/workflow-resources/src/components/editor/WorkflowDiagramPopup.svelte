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
// See the License for the specific language governing permissions and
// limitations under the License.
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import { Doc, Ref, Status } from '@hcengineering/core'
  import { getClient } from '@hcengineering/presentation'
  import { TaskType } from '@hcengineering/task'
  import { taskTypeStore, typeStore } from '@hcengineering/task-resources'
  import {
    ButtonIcon,
    DropdownTextItem,
    IconClose,
    IconMaximize,
    IconMinimize,
    Modal,
    ModernDropdownLabels
  } from '@hcengineering/ui'
  import { statusStore } from '@hcengineering/view-resources'
  import tracker, { type Project } from '@hcengineering/tracker'
  import workflowPlugin, { ProjectWorkflow, Workflow, WorkflowTransition } from '@hcengineering/workflow'

  import WorkflowDiagram from './WorkflowDiagram.svelte'

  export let space: Ref<Project> | undefined = undefined
  export let workflow: Workflow | undefined = undefined
  export let statuses: Status[] = []
  export let transitions: WorkflowTransition[] = []
  export let workflowsMap: Record<Ref<TaskType>, Ref<Workflow>> | undefined = undefined
  export let selectedTaskType: Ref<TaskType> | undefined = undefined
  export let fullSize = true

  const client = getClient()
  const hierarchy = client.getHierarchy()

  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  const dispatch = createEventDispatcher<{ close: void, fullsize: boolean }>()

  let currentTaskTypeId: Ref<TaskType> | undefined = selectedTaskType
  let currentWorkflow: Workflow | undefined = workflow
  let currentTransitions: WorkflowTransition[] = transitions
  let currentStatuses: Status[] = statuses

  let availableTaskTypeIds: Ref<TaskType>[] = []
  let taskTypeWorkflowMap: Record<Ref<TaskType>, Ref<Workflow>> = {}

  let initSequence = 0
  let loadSequence = 0

  function handleClose (): void {
    dispatch('close')
  }

  function handleToggleFullSize (): void {
    fullSize = !fullSize
    dispatch('fullsize', fullSize)
  }

  function handleTaskTypeChange (newId: string | undefined): void {
    if (newId != null) {
      currentTaskTypeId = newId as Ref<TaskType>
    }
  }

  async function initializeProjectWorkflows (): Promise<void> {
    const seq = ++initSequence
    let initialMap: Record<Ref<TaskType>, Ref<Workflow>> = { ...(workflowsMap ?? {}) }
    let taskTypes: Ref<TaskType>[] = Object.keys(initialMap) as Ref<TaskType>[]
    let defaultWorkflowId: Ref<Workflow> | undefined

    if (space != null) {
      const projectDoc = await client.findOne(tracker.class.Project, { _id: space })
      if (seq !== initSequence) return

      if (projectDoc != null) {
        if (hierarchy.hasMixin(projectDoc, workflowPlugin.mixin.ProjectWorkflow)) {
          const projectWf = hierarchy.as<Doc, ProjectWorkflow>(projectDoc, workflowPlugin.mixin.ProjectWorkflow)
          if (projectWf?.workflows) {
            initialMap = { ...projectWf.workflows, ...initialMap }
          }
        }

        const projectTypeRef = projectDoc.type
        if (projectTypeRef) {
          const projectType = $typeStore.get(projectTypeRef)
          if (projectType?.tasks && projectType.tasks.length > 0) {
            taskTypes = projectType.tasks
          }

          const allWorkflows = await client.findAll<Workflow>(workflowPlugin.class.Workflow, {
            projectType: projectTypeRef
          })
          if (seq !== initSequence) return

          if (allWorkflows.length > 0) {
            defaultWorkflowId = allWorkflows[0]._id
          }
        }
      }
    }

    if (taskTypes.length === 0 && Object.keys(initialMap).length > 0) {
      taskTypes = Object.keys(initialMap) as Ref<TaskType>[]
    }

    const resolvedMap: Record<Ref<TaskType>, Ref<Workflow>> = {}
    for (const ttId of taskTypes) {
      resolvedMap[ttId] = initialMap[ttId] ?? defaultWorkflowId ?? Object.values(initialMap)[0]
    }

    if (seq !== initSequence) return

    taskTypeWorkflowMap = resolvedMap
    availableTaskTypeIds = taskTypes.filter((id) => resolvedMap[id] != null)

    const isCurrentValid = currentTaskTypeId != null && availableTaskTypeIds.includes(currentTaskTypeId)
    if (availableTaskTypeIds.length > 0 && !isCurrentValid) {
      currentTaskTypeId = selectedTaskType && resolvedMap[selectedTaskType] ? selectedTaskType : availableTaskTypeIds[0]
    }
  }

  async function loadWorkflow (wfId: Ref<Workflow>): Promise<void> {
    const seq = ++loadSequence
    const wfDoc = await client.findOne<Workflow>(
      workflowPlugin.class.Workflow,
      { _id: wfId },
      {
        lookup: {
          _id: { transitions: workflowPlugin.class.WorkflowTransition }
        }
      }
    )

    if (seq !== loadSequence || wfDoc == null) return

    currentWorkflow = wfDoc
    currentTransitions = (wfDoc.$lookup?.transitions ?? []) as WorkflowTransition[]

    const projectType = $typeStore.get(wfDoc.projectType)
    currentStatuses =
      projectType?.statuses?.map((s) => $statusStore.byId.get(s._id)).filter((s): s is Status => s != null) ?? []
  }

  $: if (space != null || workflowsMap != null) {
    void initializeProjectWorkflows()
  }

  $: dropdownItems = availableTaskTypeIds.map<DropdownTextItem>((id) => {
    const taskType = $taskTypeStore.get(id)
    return {
      id,
      label: taskType?.name ?? id
    }
  })

  $: if (currentTaskTypeId != null) {
    const wfId = taskTypeWorkflowMap[currentTaskTypeId] ?? (workflowsMap ? workflowsMap[currentTaskTypeId] : undefined)
    if (wfId != null) {
      void loadWorkflow(wfId)
    }
  }
</script>

<Modal type="type-component" scrollableContent={false} on:fullsize on:close>
  <svelte:fragment slot="beforeTitle">
    <ButtonIcon icon={IconClose} kind="tertiary" size="small" noPrint on:click={handleClose} />
    <div class="hulyHeader-divider short no-line no-print" />
    <ButtonIcon
      icon={!fullSize ? IconMaximize : IconMinimize}
      kind="tertiary"
      size="small"
      noPrint
      on:click={handleToggleFullSize}
    />
    <div class="hulyHeader-divider short no-print" />
    {#if dropdownItems.length > 0}
      <div class="task-type-selector-wrapper ml-2">
        <ModernDropdownLabels
          items={dropdownItems}
          selected={currentTaskTypeId ?? ''}
          kind="secondary"
          size="medium"
          showDropdownIcon={true}
          on:selected={(evt) => {
            handleTaskTypeChange(evt.detail)
          }}
        />
      </div>
    {/if}
  </svelte:fragment>

  {#if currentWorkflow != null}
    <WorkflowDiagram workflow={currentWorkflow} statuses={currentStatuses} transitions={currentTransitions} />
  {/if}
</Modal>

<style lang="scss">
  .task-type-selector-wrapper {
    display: flex;
    align-items: center;

    :global(.modern-dropdown-labels-container) {
      min-width: 8rem;
    }
  }
</style>
