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
  import ui, {
    Button,
    CheckBox,
    getPlatformColorDef,
    Icon as UiIcon,
    ProgressCircle,
    themeStore
  } from '@hcengineering/ui'

  import Icon from '../Icon.svelte'
  import FixedColumn from './FixedColumn.svelte'
  import { fixedColumns } from './fixedColumns'
  import Avatar from '../People/Avatar.svelte'
  import PriorityIcon from '../Status/PriorityIcon.svelte'
  import StatusIcon from '../Status/StatusIcon.svelte'
  import { paletteIndex } from '../palette'
  import type { Issue } from '../types'

  export let issue: Issue
  export let last: boolean = false
  export let lastCat: boolean = false
  export let selected: boolean = false

  fixedColumns()
  const icon = (name: string): Asset => `tracker:icon:${name}` as Asset
  $: labelColors = (issue.labels ?? []).map(
    ([, color]) => getPlatformColorDef(paletteIndex(color), $themeStore.dark).color
  )
</script>

<div class="list-container">
  <div class="category-container">
    <div
      class="listGrid antiList__row row flex-gap-1 flex-grow"
      class:last
      class:lastCat
      class:mListGridSelected={selected}
    >
      <div class="draggable-container">
        <div class="draggable-mark">
          <UiIcon icon={ui.icon.GripVertical} size="small" fill="var(--theme-caption-color)" />
        </div>
      </div>
      <div class="flex-center relative mr-1">
        <div class="antiList-cells__notifyCell">
          <div class="antiList-cells__checkCell"><CheckBox checked={selected} size="medium" /></div>
        </div>
      </div>
      <div class="priority"><PriorityIcon priority={issue.priority} /></div>
      <FixedColumn key="issue" justify="left"><span class="issue-id">{issue.id}</span></FixedColumn>
      <div class="fix-margin flex-center flex-no-shrink"><StatusIcon status={issue.status} /></div>
      <span class="title overflow-label">{issue.title}</span>
      {#if issue.sub !== undefined}
        <Button kind="link-bordered" size="small">
          <svelte:fragment slot="content">
            <div class="flex-row-center content-color text-sm pointer-events-none">
              <div class="mr-1-5"><ProgressCircle value={issue.sub[0]} max={issue.sub[1]} size="small" primary /></div>
              {issue.sub[0]}/{issue.sub[1]}
            </div>
          </svelte:fragment>
        </Button>
      {/if}
      {#if issue.comments !== undefined}
        <span class="counter"><Icon name="comment" size={14} />{issue.comments}</span>
      {/if}
      {#if issue.attachments !== undefined}
        <span class="counter"><Icon name="clip" size={14} />{issue.attachments}</span>
      {/if}
      <div class="grow" />
      <div class="compression-bar">
        {#each issue.labels ?? [] as [name], i}
          <div class="label-box flex-no-shrink" title={name}>
            <div class="listitems-container">
              <div class="color" style:background-color={labelColors[i]} />
              <span class="label overflow-label ml-1-5">{name}</span>
            </div>
          </div>
        {/each}
        {#if issue.milestone !== undefined}
          <Button kind="list" size="small" icon={icon('Milestone')}>
            <svelte:fragment slot="content"><span class="label">{issue.milestone}</span></svelte:fragment>
          </Button>
        {/if}
        {#if issue.component !== undefined}
          <Button kind="list" size="small" icon={icon('Component')}>
            <svelte:fragment slot="content"><span class="label">{issue.component}</span></svelte:fragment>
          </Button>
        {/if}
        {#if issue.due !== undefined}
          <Button kind="list" size="small">
            <svelte:fragment slot="content">
              <!-- Live DatePresenter: calendar icon (red when overdue), the date keeps the chip color -->
              <div class="due-icon" class:overdue={issue.overdue}>
                <UiIcon icon={issue.overdue === true ? ui.icon.CalendarX : ui.icon.Calendar} size="full" />
              </div>
              <span class="label">{issue.due}</span>
            </svelte:fragment>
          </Button>
        {/if}
      </div>
      <span class="divider" />
      <FixedColumn key="reportedTime" justify="left"><span class="reported">{issue.reported ?? 0}h</span></FixedColumn>
      <span class="divider" />
      <FixedColumn key="estimation" justify="left">
        <div class="estimation">
          <div class="icon">
            {#if (issue.estimation ?? 0) > 0}
              <ProgressCircle value={issue.reported ?? 0} max={issue.estimation ?? 0} size="small" primary />
            {/if}
          </div>
          <span class="label">{issue.estimation ?? 0}h</span>
        </div>
      </FixedColumn>
      <span class="divider" />
      <FixedColumn key="created" justify="left"><span class="date">{issue.created ?? ''}</span></FixedColumn>
      <span class="divider" />
      <FixedColumn key="modified" justify="left"><span class="date">{issue.modified ?? ''}</span></FixedColumn>
      <div class="flex-no-shrink"><Avatar person={issue.assignee} size={24} /></div>
    </div>
  </div>
</div>

<style lang="scss">
  .list-container {
    width: 100%;
  }
  .priority {
    display: flex;
    flex-shrink: 0;
    width: 1rem;
    height: 1rem;
  }
  .issue-id {
    color: var(--theme-halfcontent-color);
  }
  .title {
    min-width: 0;
    color: var(--theme-caption-color);
  }
  .counter {
    display: inline-flex;
    align-items: center;
    gap: 0.1875rem;
    margin-left: 0.5rem;
    font-size: 0.8125rem;
    color: var(--theme-dark-color);
  }
  .grow {
    flex-grow: 1;
  }
  .due-icon {
    flex-shrink: 0;
    width: 1rem;
    height: 1rem;
    margin-right: 0.375rem;
    color: var(--theme-halfcontent-color);

    &.overdue {
      color: var(--theme-error-color);
    }
  }
  .divider {
    flex-shrink: 0;
    width: 1px;
    height: 1.5rem;
    margin: 0 0.375rem 0 0.875rem;
    background-color: var(--theme-list-divider-color);
  }
  .reported {
    flex-shrink: 0;
    font-size: 0.8125rem;
    color: var(--theme-halfcontent-color);
  }
  .estimation {
    display: flex;
    align-items: center;
    flex-shrink: 0;

    .icon {
      display: flex;
      width: 1rem;
      height: 1rem;
      color: var(--theme-dark-color);
    }
    .label {
      margin-left: 0.5rem;
      font-size: 0.8125rem;
      color: var(--theme-halfcontent-color);
    }
  }
  .date {
    flex-shrink: 0;
    font-size: 0.75rem;
    color: var(--theme-dark-color);
  }
  .listitems-container {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    height: 1.75rem;
    background-color: var(--theme-button-default);
    border: 1px solid var(--theme-button-border);
    border-radius: 1.5rem;
  }
  .color {
    flex-shrink: 0;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
  }
</style>
