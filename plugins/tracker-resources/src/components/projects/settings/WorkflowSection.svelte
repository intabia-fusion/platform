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
  import core, { isOwnerOrMaintainer, SortingOrder, type Ref } from '@hcengineering/core'
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import type { Project as TaskProject, TaskType } from '@hcengineering/task'
  import { taskTypeStore } from '@hcengineering/task-resources'
  import type { Project } from '@hcengineering/tracker'
  import ui from '@hcengineering/ui'
  import { Button, IconButton, SettingRow } from '@hcengineering/ui/kit'
  import view from '@hcengineering/view'
  import type { ProjectWorkflow, Workflow } from '@hcengineering/workflow'
  import workflow from '@hcengineering/workflow'

  import tracker from '../../../plugin'
  import { openProjectType, openProjectTypeWorkflow } from '../../../projectSettings'
  import ProjectSettingsSection from './ProjectSettingsSection.svelte'
  import ProjectWorkflowSelect from './ProjectWorkflowSelect.svelte'

  export let project: Project

  const client = getClient()
  const hierarchy = client.getHierarchy()
  const workflowsQuery = createQuery()
  const canOpenType = isOwnerOrMaintainer()

  let workflows: Workflow[] = []
  $: workflowsQuery.query(
    workflow.class.Workflow,
    { projectType: project.type },
    (res) => {
      workflows = res
    },
    { sort: { name: SortingOrder.Ascending } }
  )

  $: taskTypes = Array.from($taskTypeStore.values()).filter(
    (it) => it.parent === project.type && it.ofClass === tracker.class.Issue
  )
  $: mapping = hierarchy.hasMixin(project, workflow.mixin.ProjectWorkflow)
    ? (hierarchy.as<TaskProject, ProjectWorkflow>(project, workflow.mixin.ProjectWorkflow).workflows ?? {})
    : {}

  async function select (taskType: Ref<TaskType>, id: Ref<Workflow> | undefined): Promise<void> {
    const next: Record<Ref<TaskType>, Ref<Workflow>> = { ...mapping }
    if (id !== undefined) next[taskType] = id
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    else delete next[taskType]

    if (hierarchy.hasMixin(project, workflow.mixin.ProjectWorkflow)) {
      await client.updateMixin<TaskProject, ProjectWorkflow>(
        project._id,
        tracker.class.Project,
        core.space.Space,
        workflow.mixin.ProjectWorkflow,
        { workflows: next }
      )
    } else if (Object.keys(next).length > 0) {
      await client.createMixin<TaskProject, ProjectWorkflow>(
        project._id,
        tracker.class.Project,
        core.space.Space,
        workflow.mixin.ProjectWorkflow,
        { workflows: next }
      )
    }
  }
</script>

<ProjectSettingsSection
  title={tracker.string.ProjectSettingsWorkflow}
  description={tracker.string.ProjectSettingsWorkflowDescription}
>
  <div class="flex-col flex-gap-4 w-full" data-id="project-settings-workflow">
    {#each taskTypes as taskType (taskType._id)}
      {@const selected = workflows.find((it) => it._id === mapping[taskType._id] && it.taskType === taskType._id)}
      <SettingRow kind="column" label={getEmbeddedLabel(taskType.name)}>
        <div class="flex-row-center flex-gap-1">
          <div class="field">
            <ProjectWorkflowSelect
              {taskType}
              {workflows}
              value={mapping[taskType._id]}
              onChange={(id) => select(taskType._id, id)}
            />
          </div>
          {#if canOpenType && selected !== undefined}
            <IconButton
              data-id={`open-workflow-for-${taskType.name}`}
              icon={ui.icon.ChevronRightSmall}
              kind="ghost"
              size="small"
              tooltip={{ label: tracker.string.OpenWorkflow }}
              on:click={() => {
                openProjectTypeWorkflow(project.type, selected._id)
              }}
            />
          {/if}
        </div>
      </SettingRow>
    {/each}
  </div>
  {#if canOpenType}
    <Button
      data-id="btnConfigureWorkflows"
      kind="secondary"
      size="small"
      icon={view.icon.Setting}
      iconSize="small"
      label={tracker.string.ConfigureWorkflows}
      on:click={() => {
        openProjectType(project.type, 'workflows')
      }}
    />
  {/if}
</ProjectSettingsSection>

<style lang="scss">
  .field {
    width: 15rem;
  }
</style>
