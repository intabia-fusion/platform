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
  import type { Employee } from '@hcengineering/contact'
  import { notEmpty, type Ref } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { taskTypeStore } from '@hcengineering/task-resources'
  import type { Project as TaskProject } from '@hcengineering/task'
  import type { IssueStatus, Project } from '@hcengineering/tracker'
  import { Button, SettingRow } from '@hcengineering/ui/kit'
  import { statusStore } from '@hcengineering/view-resources'
  import workflow from '@hcengineering/workflow'
  import type { ProjectWorkflow, Workflow } from '@hcengineering/workflow'

  import tracker from '../../../plugin'
  import { openProjectTemplates } from '../../../projectSettings'
  import ProjectAssigneeSelect from './ProjectAssigneeSelect.svelte'
  import ProjectSettingsSection from './ProjectSettingsSection.svelte'
  import ProjectStatusSelect from './ProjectStatusSelect.svelte'

  export let project: Project

  const client = getClient()
  const hierarchy = client.getHierarchy()

  $: taskType = Array.from($taskTypeStore.values()).find(
    (it) => it.parent === project.type && it.ofClass === tracker.class.Issue
  )
  $: workflowId =
    taskType !== undefined && hierarchy.hasMixin(project, workflow.mixin.ProjectWorkflow)
      ? hierarchy.as<TaskProject, ProjectWorkflow>(project, workflow.mixin.ProjectWorkflow).workflows?.[taskType._id]
      : undefined

  let projectWorkflow: Workflow | undefined
  const workflowQuery = createQuery()
  $: if (workflowId != null) {
    workflowQuery.query(workflow.class.Workflow, { _id: workflowId }, (res) => {
      projectWorkflow = res[0]
    })
  } else {
    workflowQuery.unsubscribe()
    projectWorkflow = undefined
  }

  // The statuses StatusSelector offers: the task type's, narrowed to the workflow's initial ones
  $: initialStatuses = projectWorkflow?.initialStatuses ?? []
  $: statuses = (taskType?.statuses ?? [])
    .map((id) => $statusStore.byId.get(id) as IssueStatus | undefined)
    .filter(notEmpty)
    .filter((it) => initialStatuses.length === 0 || initialStatuses.includes(it._id))
  // The project stores '' when it was created without a status
  $: stored = project.defaultIssueStatus
  $: defaultStatus = statuses.find((it) => it._id === stored) ?? statuses[0]

  $: assignee = project.defaultAssignee ?? undefined

  let templatesCount = 0
  const templatesQuery = createQuery()
  $: templatesQuery.query(tracker.class.IssueTemplate, { space: project._id }, (res) => {
    templatesCount = res.total
  }, { limit: 1, total: true })

  async function setAssignee (value: Ref<Employee> | undefined): Promise<void> {
    if (value === undefined) {
      await client.update(project, { $unset: { defaultAssignee: true } })
    } else {
      await client.update(project, { defaultAssignee: value })
    }
  }

  async function setStatus (value: Ref<IssueStatus>): Promise<void> {
    if (value !== project.defaultIssueStatus) {
      await client.update(project, { defaultIssueStatus: value })
    }
  }
</script>

<ProjectSettingsSection
  title={tracker.string.ProjectSettingsIssues}
  description={tracker.string.ProjectSettingsIssuesDescription}
>
  <div class="flex-col flex-gap-4" data-id="project-settings-issues">
    <SettingRow kind="column" label={tracker.string.ProjectSettingsDefaultAssignee}>
      <div class="field">
        <ProjectAssigneeSelect value={assignee} onChange={setAssignee} />
      </div>
    </SettingRow>

    <SettingRow kind="column" label={tracker.string.DefaultIssueStatus}>
      <div class="field">
        <ProjectStatusSelect
          {statuses}
          value={defaultStatus}
          taskType={taskType?._id}
          projectType={project.type}
          onChange={setStatus}
        />
      </div>
    </SettingRow>

    <SettingRow kind="column" label={tracker.string.ProjectSettingsTemplates}>
      <Button
        data-id="btnOpenIssueTemplates"
        kind="secondary"
        size="small"
        icon={tracker.icon.IssueTemplates}
        iconSize="small"
        label={tracker.string.OpenIssueTemplates}
        labelParams={{ count: templatesCount }}
        on:click={() => {
          openProjectTemplates(project._id)
        }}
      />
    </SettingRow>
  </div>
</ProjectSettingsSection>

<style lang="scss">
  .field {
    width: 15rem;
  }
</style>
