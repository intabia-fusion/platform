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
  import { Button, getPlatformColorDef, ProgressCircle, themeStore } from '@hcengineering/ui'
  import Icon from '../Icon.svelte'
  import Avatar from '../People/Avatar.svelte'
  import PriorityIcon from '../Status/PriorityIcon.svelte'
  import StatusIcon from '../Status/StatusIcon.svelte'
  import { paletteIndex } from '../palette'
  import type { Issue } from '../types'

  export let issue: Issue

  const icon = (name: string): Asset => `tracker:icon:${name}` as Asset
  $: labelColors = (issue.labels ?? []).map(
    ([, color]) => getPlatformColorDef(paletteIndex(color), $themeStore.dark).color
  )
  $: footer = issue.estimation !== undefined || issue.attachments !== undefined || issue.comments !== undefined
</script>

<div class="kanban-container">
  <div class="card-container" style:border-color={issue.accent}>
    <div class="tracker-card">
      <div class="card-header flex-between">
        <div class="flex-row-center text-sm min-w-0">
          <div class="mr-1 flex flex-no-shrink">
            <StatusIcon status={issue.status} />
          </div>
          <div class="flex-no-shrink">
            <span class="issuePresenterRoot">
              <span class="overflow-label select-text">{issue.id}</span>
            </span>
          </div>
          {#if issue.parent !== undefined}
            <div class="parent-root">
              <span class="parent-names">
                <span class="parent-label overflow-label" title={issue.parent}>{issue.parent}</span>
              </span>
            </div>
          {/if}
        </div>
        <div class="flex-row-center gap-2 reverse flex-no-shrink">
          <Avatar person={issue.assignee} size={20} />
        </div>
      </div>
      <div class="card-content caption-color text-md lines-limit-2">
        {issue.title}
      </div>
      <div class="card-labels meta">
        <Button kind="link-bordered" size="small" justify="center">
          <svelte:fragment slot="content"><PriorityIcon priority={issue.priority} /></svelte:fragment>
        </Button>
        {#if issue.sub !== undefined}
          <div class="flex-center flex-no-shrink">
            <Button kind="link-bordered" size="small">
              <svelte:fragment slot="content">
                <div class="flex-row-center content-color text-sm pointer-events-none">
                  <div class="mr-1-5">
                    <ProgressCircle value={issue.sub[0]} max={issue.sub[1]} size="small" primary />
                  </div>
                  {issue.sub[0]}/{issue.sub[1]}
                </div>
              </svelte:fragment>
            </Button>
          </div>
        {/if}
        {#if issue.due !== undefined}
          <Button kind="link-bordered" size="small" justify="center">
            <svelte:fragment slot="content">
              <span class="due text-md pointer-events-none" class:overdue={issue.overdue}>
                <Icon name="calendar" size={14} />{issue.due}
              </span>
            </svelte:fragment>
          </Button>
        {/if}
        <div class:icon-only={issue.component === undefined}>
          <Button
            kind="link-bordered"
            size="small"
            justify="center"
            icon={icon('Component')}
            notSelected={issue.component === undefined}
          >
            <svelte:fragment slot="content">
              {#if issue.component !== undefined}
                <span class="label text-md overflow-label pointer-events-none">{issue.component}</span>
              {/if}
            </svelte:fragment>
          </Button>
        </div>
        <div class:icon-only={issue.milestone === undefined}>
          <Button
            kind="link-bordered"
            size="small"
            justify="center"
            icon={icon('Milestone')}
            notSelected={issue.milestone === undefined}
          >
            <svelte:fragment slot="content">
              {#if issue.milestone !== undefined}
                <span class="label text-md overflow-label pointer-events-none" style:max-width="7rem"
                  >{issue.milestone}</span
                >
              {/if}
            </svelte:fragment>
          </Button>
        </div>
      </div>
      {#if issue.labels !== undefined && issue.labels.length > 0}
        <div class="card-labels labels">
          {#each issue.labels as [title], i}
            <div class="label-box no-shrink" {title}>
              <button class="link-container">
                <div class="color" style:background-color={labelColors[i]} />
                <span class="label overflow-label ml-1 text-sm leading-4 caption-color max-w-40">{title}</span>
              </button>
            </div>
          {/each}
        </div>
      {/if}
      {#if footer}
        <div class="card-footer flex-between">
          <div class="estimation-container">
            <div class="icon">
              <ProgressCircle value={issue.reported ?? 0} max={issue.estimation ?? 0} size="small" primary />
            </div>
            <span class="overflow-label estimation-label">{issue.estimation ?? 0}h</span>
          </div>
          <div class="counters">
            {#if issue.attachments !== undefined}
              <span class="counter"><Icon name="clip" size={14} />{issue.attachments}</span>
            {/if}
            {#if issue.comments !== undefined}
              <span class="counter"><Icon name="comment" size={14} />{issue.comments}</span>
            {/if}
          </div>
        </div>
      {:else}
        <div class="min-h-4 max-h-4 h-4" />
      {/if}
    </div>
  </div>
</div>

<style lang="scss">
  .card-container {
    box-sizing: border-box;
    width: 100%;
    background-color: var(--theme-kanban-card-bg-color);
    border: 1px solid var(--theme-kanban-card-border);
    border-radius: 0.25rem;
  }
  .tracker-card {
    position: relative;
    display: flex;
    flex-direction: column;
    min-height: 6.5rem;
    box-sizing: border-box;
    width: 100%;

    .overdue {
      color: var(--theme-state-negative-color);
    }
    .due {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
    }
    .counters {
      display: flex;
      gap: 0.625rem;
      font-size: 0.8125rem;
      color: var(--theme-dark-color);
    }
    .counter {
      display: inline-flex;
      align-items: center;
      gap: 0.1875rem;
    }

    .card-header {
      padding: 0.75rem 1rem 0;
    }
    .card-content {
      margin: 0.5rem 1rem;
    }
    .card-labels {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem;
      margin: 0 0.75rem 0 1rem;
      min-width: 0;

      &.meta {
        flex-wrap: wrap;
        gap: 0.375rem;
      }

      :global(.icon-only span.label.nowrap),
      :global(.icon-only button.iconL > span.label) {
        display: none;
      }
      :global(.icon-only button) {
        padding: 0 0.375rem !important;
        width: auto !important;
      }
      :global(.icon-only .flex-presenter) {
        margin: 0;
      }
      :global(.icon-only .icon),
      :global(.icon-only .btn-icon) {
        margin: 0 !important;
      }

      &.labels {
        overflow: hidden;
        flex-shrink: 1;
        margin: 0 1rem;
        width: calc(100% - 2rem);
        border-radius: 0 0.24rem 0.24rem 0;
      }
    }
    .card-footer {
      margin-top: 1rem;
      padding: 0.75rem 1rem;
      background-color: var(--theme-kanban-card-footer);
      border-radius: 0 0 0.25rem 0.25rem;
    }
  }

  // IssuePresenter
  .issuePresenterRoot {
    display: flex;
    align-items: center;
    flex-shrink: 0;

    color: var(--theme-content-color);
  }

  // StatePresenter
  .state-container {
    flex-shrink: 0;
  }

  // ParentNamesPresenter
  .parent-root {
    display: inline-flex;
    margin-left: 0;
    min-width: 0;

    .parent-names {
      display: inline-flex;
      min-width: 0;
      color: var(--theme-dark-color);
    }
    .parent-label {
      flex-shrink: 5;
      color: var(--theme-dark-color);

      &::before {
        content: '›';
        padding: 0 0.25rem;
      }
    }
  }

  // LabelsPresenter and TagReferencePresenter
  .label-box {
    display: flex;
    align-items: center;
    width: auto;
    min-width: 0;
    border-radius: 0.25rem;
  }
  .link-container {
    display: flex;
    justify-content: center;
    align-items: center;
    flex-shrink: 0;
    padding: 0 0.375rem;
    height: 1.5rem;
    min-width: 1.5rem;
    font-size: 0.75rem;
    line-height: 0.75rem;
    white-space: nowrap;
    color: var(--theme-content-color);
    background-color: var(--theme-link-button-color);
    border: 1px solid var(--theme-button-border);
    border-radius: 0.25rem;
  }
  .color {
    flex-shrink: 0;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
  }

  // EstimationStatsPresenter
  .estimation-container {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    min-width: 0;

    .icon {
      display: flex;
      justify-content: center;
      align-items: center;
      flex-shrink: 0;
      width: 1rem;
      height: 1rem;
      color: var(--theme-dark-color);
    }
    .estimation-label {
      margin-left: 0.5rem;
      font-size: 0.8125rem;
      color: var(--theme-halfcontent-color);
    }
  }
</style>
