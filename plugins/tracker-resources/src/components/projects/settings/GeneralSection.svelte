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
  import type { Asset } from '@hcengineering/platform'
  import { getClient } from '@hcengineering/presentation'
  import task from '@hcengineering/task'
  import { typeStore } from '@hcengineering/task-resources'
  import type { Project } from '@hcengineering/tracker'
  import { Icon, showPopup } from '@hcengineering/ui'
  import { Button, SettingRow, TextArea, TextInput } from '@hcengineering/ui/kit'
  import { IconPicker } from '@hcengineering/view-resources'
  import { isOwnerOrMaintainer } from '@hcengineering/core'

  import tracker from '../../../plugin'
  import { openProjectType } from '../../../projectSettings'
  import ProjectIconTile from './ProjectIconTile.svelte'
  import ProjectSettingsSection from './ProjectSettingsSection.svelte'

  export let project: Project

  const client = getClient()
  const canOpenType = isOwnerOrMaintainer()

  // Primitive copies: the form is reset only when the stored value really changes, not on every project update
  $: storedName = project.name
  $: storedDescription = project.description
  let name = project.name
  let description = project.description
  $: name = storedName
  $: description = storedDescription

  $: typeName = $typeStore.get(project.type)?.name ?? ''
  $: icon = (project.icon ?? tracker.icon.Home) as Asset
  $: nextIssueId = `${project.identifier}-${project.sequence + 1}`

  async function saveName (): Promise<void> {
    const value = name.trim()
    if (value === '') {
      name = project.name
    } else if (value !== project.name) {
      await client.update(project, { name: value })
    }
  }

  async function saveDescription (): Promise<void> {
    if (description !== project.description) {
      await client.update(project, { description })
    }
  }

  function chooseIcon (): void {
    const update = async (result: any): Promise<void> => {
      if (result !== undefined && result !== null) {
        await client.update(project, { icon: result.icon, color: result.color })
      }
    }
    showPopup(IconPicker, { icon: project.icon, color: project.color }, 'top', update, update)
  }
</script>

<ProjectSettingsSection title={tracker.string.ProjectSettingsGeneral} description={tracker.string.SavedAutomatically}>
  <div class="flex-col flex-gap-4" data-id="project-settings-general">
    <SettingRow kind="column" label={task.string.ProjectType} hint={tracker.string.ProjectTypeHint}>
      <div class="flex-row-center flex-gap-2">
        <span class="type-chip" data-id="project-type">
          <Icon icon={task.icon.ManageTemplates} size="small" />
          {typeName}
        </span>
        {#if canOpenType}
          <Button
            kind="tertiary"
            size="extra-small"
            label={tracker.string.OpenProjectType}
            on:click={() => {
              openProjectType(project.type)
            }}
          />
        {/if}
      </div>
    </SettingRow>

    <SettingRow kind="column" label={tracker.string.ProjectSettingsName} let:labelId>
      <div class="field wide">
        <TextInput
          id="project-title"
          bind:value={name}
          placeholder={tracker.string.ProjectTitlePlaceholder}
          aria-labelledby={labelId}
          fullWidth
          on:change={saveName}
        />
      </div>
    </SettingRow>

    <SettingRow
      kind="column"
      label={tracker.string.Identifier}
      hint={tracker.string.IdentifierHint}
      hintParams={{ example: nextIssueId }}
      let:labelId
    >
      <div class="field narrow">
        <TextInput
          id="project-identifier"
          value={project.identifier}
          readonly
          placeholder={tracker.string.ProjectIdentifierPlaceholder}
          aria-labelledby={labelId}
          fullWidth
        />
      </div>
    </SettingRow>

    <SettingRow kind="column" label={tracker.string.Description} let:labelId>
      <div class="field wide">
        <TextArea
          id="project-description"
          bind:value={description}
          rows={2}
          placeholder={tracker.string.IssueDescriptionPlaceholder}
          aria-labelledby={labelId}
          on:change={saveDescription}
        />
      </div>
    </SettingRow>

    <SettingRow kind="column" label={tracker.string.ProjectSettingsIcon}>
      <ProjectIconTile id="project-icon" {icon} color={project.color} name={project.name} on:click={chooseIcon} />
    </SettingRow>
  </div>
</ProjectSettingsSection>

<style lang="scss">
  .field {
    &.narrow {
      width: 10rem;
    }
    &.wide {
      width: 26.25rem;
    }
  }
  .type-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    box-sizing: border-box;
    height: 1.75rem;
    padding: 0 0.375rem;
    font-size: 0.8125rem;
    color: var(--theme-dark-color);
    background-color: var(--theme-link-button-color);
    border: 1px solid var(--theme-button-border);
    border-radius: 0.375rem;
  }
</style>
