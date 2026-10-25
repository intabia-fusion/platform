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
  import type { Ref, Status } from '@hcengineering/core'
  import type { ProjectType } from '@hcengineering/task'
  import type { Project } from '@hcengineering/tracker'
  import { IconAdd, Label } from '@hcengineering/ui'
  import { Button } from '@hcengineering/ui/kit'
  import view from '@hcengineering/view'
  import { createEventDispatcher } from 'svelte'
  import tracker from '../../plugin'
  import IssueStatusIcon from '../issues/IssueStatusIcon.svelte'

  export let statuses: Array<{
    status: Status
    project: Ref<Project> | undefined
    projectType: Ref<ProjectType> | undefined
    count: number
  }>
  export let canEdit: boolean

  const dispatch = createEventDispatcher<{ close: 'show' | 'add' | undefined }>()
</script>

<div class="popup" data-id="boardUncoveredPopup">
  <span class="title"><Label label={tracker.string.StatusesWithoutColumnTitle} /></span>
  <span class="text"><Label label={tracker.string.StatusesWithoutColumnText} /></span>
  {#each statuses as { status, project, projectType, count } (status._id)}
    <div class="status">
      <IssueStatusIcon value={status} space={project} {projectType} size="x-small" />
      <span class="name">{status.name}</span>
      <span class="count">{count}</span>
    </div>
  {/each}
  <div class="actions">
    <Button
      kind="secondary"
      size="small"
      icon={view.icon.List}
      iconSize="small"
      label={tracker.string.ShowIssues}
      data-id="boardUncoveredShow"
      on:click={() => {
        dispatch('close', 'show')
      }}
    />
    {#if canEdit}
      <Button
        kind="primary"
        size="small"
        icon={IconAdd}
        iconSize="small"
        label={tracker.string.AddToColumn}
        data-id="boardUncoveredAdd"
        on:click={() => {
          dispatch('close', 'add')
        }}
      />
    {/if}
  </div>
</div>

<style lang="scss">
  .popup {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    box-sizing: border-box;
    width: 23.75rem;
    padding: var(--spacing-2);
    background-color: var(--theme-popup-color);
    border: 1px solid var(--theme-popup-divider);
    border-radius: var(--medium-BorderRadius);
    box-shadow: 0 0.5rem 1.5rem rgba(0, 0, 0, 0.15);
  }
  .title {
    font-weight: 600;
    line-height: 1.25;
    color: var(--theme-caption-color);
  }
  .text {
    font-size: 0.8125rem;
    line-height: 1.25;
    color: var(--theme-dark-color);
  }
  .status {
    display: flex;
    align-items: center;
    gap: var(--spacing-0_5);
    height: 2rem;
    padding: 0 0.375rem 0 0.25rem;
    font-size: 0.8125rem;
    border: 1px solid var(--theme-button-border);
    border-radius: var(--extra-small-BorderRadius);
  }
  .name {
    color: var(--theme-content-color);
  }
  .count {
    color: var(--theme-darker-color);
  }
  .actions {
    display: flex;
    gap: var(--spacing-1);
  }
</style>
