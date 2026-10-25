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
  import contact from '@hcengineering/contact'
  import type { Ref } from '@hcengineering/core'
  import type { IntlString } from '@hcengineering/platform'
  import type { Project } from '@hcengineering/tracker'
  import {
    getCurrentLocation,
    Header,
    IconBack,
    IconClose,
    Label,
    NavItem,
    navigate,
    resolvedLocationStore,
    Scroller
  } from '@hcengineering/ui'
  import { Button, IconButton } from '@hcengineering/ui/kit'
  import view from '@hcengineering/view'
  import workflow from '@hcengineering/workflow'

  import tracker from '../../../plugin'
  import { closeProjectSettings, openProjectSection } from '../../../projectSettings'
  import { activeProjects } from '../../../utils'
  import { canEditSpace } from '@hcengineering/view-resources'
  import ArchiveSection from './ArchiveSection.svelte'
  import GeneralSection from './GeneralSection.svelte'
  import IssuesSection from './IssuesSection.svelte'
  import MembersSection from './MembersSection.svelte'
  import StatusesSection from './StatusesSection.svelte'
  import WorkflowSection from './WorkflowSection.svelte'

  export let currentSpace: Ref<Project> | undefined = undefined

  const sections = [
    { id: 'general', label: tracker.string.ProjectSettingsGeneral, icon: view.icon.Setting },
    { id: 'members', label: tracker.string.ProjectSettingsAccess, icon: contact.icon.Contacts },
    { id: 'issues', label: tracker.string.ProjectSettingsIssues, icon: tracker.icon.Issues },
    { id: 'statuses', label: tracker.string.ProjectSettingsStatuses, icon: tracker.icon.MyIssues },
    { id: 'workflow', label: tracker.string.ProjectSettingsWorkflow, icon: workflow.icon.Workflow },
    { id: 'archive', label: tracker.string.ProjectSettingsArchive, icon: view.icon.Delete }
  ] satisfies Array<{ id: string, label: IntlString, icon: any }>

  $: project = currentSpace !== undefined ? $activeProjects.get(currentSpace) : undefined
  $: section = sections.find((it) => it.id === $resolvedLocationStore.query?.section)?.id ?? sections[0].id

  // An archived project drops out of the store: leave the page for the project list
  let hadProject = false
  $: if (project !== undefined && !project.archived) {
    hadProject = true
  } else if (hadProject) {
    navigate({ path: [...getCurrentLocation().path.slice(0, 3), 'all-projects'] })
  }

  // The page opens by its address too: without the right to edit the project it leads back to the issues
  $: void checkAccess(project)
  async function checkAccess (project: Project | undefined): Promise<void> {
    if (project !== undefined && !(await canEditSpace(project))) closeProjectSettings(project._id)
  }

  function close (): void {
    if (currentSpace !== undefined) closeProjectSettings(currentSpace)
  }
</script>

<div class="hulyComponent" data-id="project-settings">
    <Header adaptive="disabled">
      <Button
        data-id="btnBackToProject"
        kind="ghost"
        size="small"
        icon={IconBack}
        label={tracker.string.BackToProject}
        on:click={close}
      />
      <div class="hulyHeader-divider" />
      <span class="title"><Label label={tracker.string.ProjectSettings} /></span>
      <svelte:fragment slot="actions">
        <IconButton
          data-id="btnCloseProjectSettings"
          kind="tertiary"
          size="small"
          icon={IconClose}
          tooltip={{ label: tracker.string.BackToProject }}
          on:click={close}
        />
      </svelte:fragment>
    </Header>
    {#if project !== undefined}
      <div class="hulyComponent-content__container columns">
        <div class="hulyComponent-content__column nav">
          {#each sections as item (item.id)}
            <div class="navItem" data-id="project-settings-nav-{item.id}">
              <NavItem
                label={item.label}
                icon={item.icon}
                selected={section === item.id}
                on:click={() => {
                  openProjectSection(item.id)
                }}
              />
            </div>
          {/each}
        </div>
        <div class="hulyComponent-content__column content">
          <Scroller padding="1.5rem 2rem">
            {#key section}
              {#if section === 'general'}
                <GeneralSection {project} />
              {:else if section === 'members'}
                <MembersSection {project} />
              {:else if section === 'issues'}
                <IssuesSection {project} />
              {:else if section === 'statuses'}
                <StatusesSection {project} />
              {:else if section === 'workflow'}
                <WorkflowSection {project} />
              {:else}
                <ArchiveSection {project} />
              {/if}
            {/key}
          </Scroller>
        </div>
      </div>
    {/if}
  </div>

<style lang="scss">
  .title {
    font-size: 1rem;
    font-weight: 600;
    color: var(--theme-caption-color);
  }
  // NavItem has side margins and no width: a column flex wrapper stretches it over the whole column
  .navItem {
    display: flex;
    flex-direction: column;
  }
  .nav {
    flex-shrink: 0;
    width: 15rem;
    padding-top: var(--spacing-1);
    border-right: 1px solid var(--theme-divider-color);
  }
</style>
