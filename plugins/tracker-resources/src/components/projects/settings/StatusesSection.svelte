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
  import { isOwnerOrMaintainer } from '@hcengineering/core'
  import { getClient } from '@hcengineering/presentation'
  import task from '@hcengineering/task'
  import { ProjectTypeStatusesSectionEditor, typeStore } from '@hcengineering/task-resources'
  import { Button } from '@hcengineering/ui/kit'
  import view from '@hcengineering/view'
  import workflow from '@hcengineering/workflow'
  import type { Project } from '@hcengineering/tracker'

  import tracker from '../../../plugin'
  import { openProjectSection, openProjectType } from '../../../projectSettings'
  import ProjectSettingsSection from './ProjectSettingsSection.svelte'

  export let project: Project

  const client = getClient()
  const canOpenType = isOwnerOrMaintainer()

  $: type = $typeStore.get(project.type)
  $: descriptor =
    type !== undefined
      ? client.getModel().findAllSync(task.class.ProjectTypeDescriptor, { _id: type.descriptor })[0]
      : undefined
</script>

<ProjectSettingsSection
  title={tracker.string.ProjectSettingsStatuses}
  description={tracker.string.ProjectSettingsStatusesDescription}
  descriptionParams={{ type: type?.name ?? '' }}
  wide
>
  <!-- The read-only statuses table of the project type settings: statuses are edited there -->
  <div class="hulyTableAttr-container w-full" data-id="project-settings-statuses">
    <ProjectTypeStatusesSectionEditor {type} {descriptor} disabled />
  </div>
  <div class="flex-row-center flex-gap-2">
    {#if canOpenType}
      <Button
        kind="secondary"
        size="small"
        icon={view.icon.Setting}
        iconSize="small"
        label={tracker.string.EditStatusesInProjectType}
        on:click={() => {
          openProjectType(project.type)
        }}
      />
    {/if}
    <Button
      kind="ghost"
      size="small"
      icon={workflow.icon.Workflow}
      iconSize="small"
      label={tracker.string.ProjectSettingsWorkflow}
      on:click={() => {
        openProjectSection('workflow')
      }}
    />
  </div>
</ProjectSettingsSection>
