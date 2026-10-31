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
  import { getPlatformColorDef, themeStore } from '@hcengineering/ui'
  import Icon from '../Icon.svelte'
  import Avatar from '../People/Avatar.svelte'
  import PriorityIcon from '../Status/PriorityIcon.svelte'
  import StatusIcon from '../Status/StatusIcon.svelte'
  import { paletteIndex } from '../palette'
  import type { CardFocus, Density, Issue } from '../types'

  export let issue: Issue
  export let density: Density = 'detailed'
  export let hover = false
  // The drop place while dragging and the card in hand
  export let dragged = false
  export let lifted = false
  // 'inset': the product ring today, a rule border hides it; 'ring': 2px outside the card, as ui-kit :focus-visible
  export let focus: CardFocus | undefined = undefined
  // The icons of the product card: layers, signpost, orange due date
  export let productIcons = false

  $: labelColors = (issue.labels ?? []).map(
    ([, color]) => getPlatformColorDef(paletteIndex(color), $themeStore.dark).color
  )
  $: icons = productIcons
    ? { sub: 'tracker/sub-issue', due: 'calendar', component: 'kit/Diamond', milestone: 'kit/Signpost' }
    : { sub: 'subissues', due: 'calendar', component: 'component', milestone: 'milestone' }
  $: dueColor =
    issue.overdue === true
      ? 'var(--theme-state-negative-color)'
      : productIcons
        ? 'var(--theme-warning-color)'
        : 'var(--theme-dark-color)'
  $: est = issue.estimation !== undefined ? `${issue.estimation}h` : undefined
</script>

<div
  class="kit-issue-card {density}"
  class:hover={hover && focus === undefined}
  class:dragged
  class:lifted
  class:focus-inset={focus === 'inset' && issue.accent === undefined}
  class:focus-ring={focus === 'ring'}
  data-id="kanban-card-body"
  style:border-color={issue.accent}
  style:border-width={issue.accent !== undefined ? '2px' : undefined}
>
  {#if density === 'dense'}
    <div class="row">
      <StatusIcon status={issue.status} />
      <span class="id">{issue.id}</span>
      <span class="title one-line">{issue.title}</span>
      <Avatar person={issue.assignee} size={20} round />
    </div>
  {:else if density === 'compact'}
    <div class="row title-row">
      <StatusIcon status={issue.status} />
      <span class="title">{issue.title}</span>
      <Avatar person={issue.assignee} size={20} round />
    </div>
    <div class="meta">
      <span class="id">{issue.id}</span>
      <PriorityIcon priority={issue.priority} />
      {#if issue.sub !== undefined}<Icon name={icons.sub} size={14} color="var(--theme-dark-color)" />{/if}
      {#if issue.due !== undefined}<Icon name={icons.due} size={14} color={dueColor} />{/if}
      {#if issue.component !== undefined}<Icon name={icons.component} size={14} color="var(--theme-dark-color)" />{/if}
      {#if issue.milestone !== undefined}<Icon name={icons.milestone} size={14} color="var(--theme-dark-color)" />{/if}
      {#if est !== undefined}<span class="id">{est}</span>{/if}
    </div>
  {:else}
    <div class="top">
      <div class="left">
        <span class="id">{issue.id}</span>
        {#if issue.parent !== undefined}<span class="parent">› {issue.parent}</span>{/if}
      </div>
      <Avatar person={issue.assignee} size={20} round />
    </div>
    <div class="row title-row">
      <StatusIcon status={issue.status} />
      <span class="title">{issue.title}</span>
    </div>
    <div class="chips">
      <span class="chip icon-only"><PriorityIcon priority={issue.priority} /></span>
      {#if issue.sub !== undefined}
        <span class="chip"
          ><Icon name={icons.sub} size={14} color="var(--theme-dark-color)" />{issue.sub[0]}/{issue.sub[1]}</span
        >
      {/if}
      {#if issue.due !== undefined}
        <span class="chip" class:overdue={issue.overdue}>
          <Icon name={icons.due} size={14} color={dueColor} />{issue.due}
        </span>
      {/if}
      {#if issue.component !== undefined}
        <span class="chip"
          ><Icon name={icons.component} size={14} color="var(--theme-dark-color)" />{issue.component}</span
        >
      {/if}
      {#if issue.milestone !== undefined}
        <span class="chip"
          ><Icon name={icons.milestone} size={14} color="var(--theme-dark-color)" />{issue.milestone}</span
        >
      {/if}
      {#if density === 'detailed'}
        {#each issue.labels ?? [] as [title], i}
          <span class="chip"><i style:background-color={labelColors[i]} />{title}</span>
        {/each}
      {:else if est !== undefined}
        <span class="chip">{est}</span>
      {/if}
    </div>
    {#if density === 'detailed' && (issue.attachments !== undefined || issue.comments !== undefined)}
      <div class="foot">
        <span class="footer">{est !== undefined ? `${issue.estimationLabel ?? 'Оценка'} ${est}` : ''}</span>
        <span class="counters">
          {#if issue.attachments !== undefined}
            <span class="counter"
              ><Icon name="clip" size={14} color="var(--theme-darker-color)" />{issue.attachments}</span
            >
          {/if}
          {#if issue.comments !== undefined}
            <span class="counter"
              ><Icon name="comment" size={14} color="var(--theme-darker-color)" />{issue.comments}</span
            >
          {/if}
        </span>
      </div>
    {:else if density === 'detailed' && est !== undefined}
      <span class="footer">{issue.estimationLabel ?? 'Оценка'} {est}</span>
    {/if}
  {/if}
</div>

<style lang="scss">
  .kit-issue-card {
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    gap: 8px;
    padding: 12px 14px;
    color: var(--theme-caption-color);
    background-color: var(--theme-popup-color);
    border: 1px solid var(--theme-divider-color);
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);

    &.normal {
      padding: 10px 12px;
    }
    &.compact {
      gap: 6px;
      padding: 8px 10px;
    }
    &.dense {
      gap: 4px;
      padding: 6px 10px;
    }
    &.hover {
      background-color: var(--highlight-hover);
    }
    &.dragged {
      background-color: var(--accent-bg-color);
    }
    &.lifted {
      box-shadow:
        0 1px 3px rgba(0, 0, 0, 0.06),
        0 8px 24px rgba(0, 0, 0, 0.15);
    }
    &.focus-inset {
      border: 2px solid var(--primary-edit-border-color);
    }
    // As a hovered file card of the drive (ui-kit FileCard)
    &.focus-ring {
      border-color: color-mix(in srgb, var(--button-brand-BackgroundColor) 30%, var(--global-ui-BorderColor));
      box-shadow: 0 0.125rem 0.375rem color-mix(in srgb, var(--global-popover-ShadowColor) 65%, transparent);
    }
  }
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .left {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
  }
  .id {
    font-size: 12px;
    line-height: 1.25;
    color: var(--theme-dark-color);
    white-space: nowrap;
  }
  .compact .id,
  .dense .id {
    color: var(--theme-darker-color);
  }
  .parent {
    font-size: 12px;
    color: var(--theme-darker-color);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .row {
    display: flex;
    gap: 8px;
    width: 100%;
    min-width: 0;
  }
  .title-row {
    align-items: flex-start;
  }
  .title {
    flex: 1;
    min-width: 0;
    font-size: 14px;
    font-weight: 500;
    line-height: 1.3;
  }
  .compact .row {
    gap: 6px;
  }
  .compact .title {
    font-size: 13px;
  }
  .dense .row {
    align-items: center;
    gap: 6px;
  }
  .dense .title {
    font-size: 13px;
    font-weight: 400;
  }
  .one-line {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    box-sizing: border-box;
    padding: 3px 8px;
    font-size: 12px;
    line-height: 1.25;
    color: var(--theme-dark-color);
    white-space: nowrap;
    background-color: var(--theme-popup-color);
    border: 1px solid var(--theme-button-border);
    border-radius: 12px;

    &.overdue {
      color: var(--theme-state-negative-color);
    }
    i {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
  }
  .footer {
    font-size: 12px;
    color: var(--theme-darker-color);
  }
  .foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .counters {
    display: flex;
    gap: 10px;
  }
  .counter {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--theme-darker-color);
  }
</style>
