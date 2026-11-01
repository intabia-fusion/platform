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
  import { AttachmentsPresenter } from '@hcengineering/attachment-resources'
  import { ChatMessagesPresenter } from '@hcengineering/chunter-resources'
  import { getObjectValue, type Ref, type WithLookup } from '@hcengineering/core'
  import { translateCB } from '@hcengineering/platform'
  import notification from '@hcengineering/notification'
  import { getClient } from '@hcengineering/presentation'
  import tags, { type TagReference } from '@hcengineering/tags'
  import { TagReferencePresenter } from '@hcengineering/tags-resources'
  import {
    IssuePriority,
    reduceChildInfoTree,
    type CardDensity,
    type CardField,
    type Issue,
    type Project
  } from '@hcengineering/tracker'
  import { Button, Component, Label, PaletteColorIndexes, themeStore } from '@hcengineering/ui'
  import type { AttributeModel } from '@hcengineering/view'
  import { ListPresenter, openDoc } from '@hcengineering/view-resources'
  import tracker from '../../plugin'
  import ComponentEditor from '../components/ComponentEditor.svelte'
  import MilestoneEditor from '../milestones/MilestoneEditor.svelte'
  import AssigneeEditor from './AssigneeEditor.svelte'
  import DueDatePresenter from './DueDatePresenter.svelte'
  import SubIssuesSelector from './edit/SubIssuesSelector.svelte'
  import IssuePresenter from './IssuePresenter.svelte'
  import ParentNamesPresenter from './ParentNamesPresenter.svelte'
  import PriorityEditor from './PriorityEditor.svelte'
  import StatusEditor from './StatusEditor.svelte'
  import EstimationEditor from './timereport/EstimationEditor.svelte'

  export let issue: WithLookup<Issue>
  export let density: CardDensity
  export let shown: (field: CardField) => boolean
  // Custom attributes of the kanban view config
  export let customAttrModels: AttributeModel[] = []
  // Border color of a board color rule
  export let accent: string | undefined = undefined
  export let space: Ref<Project> | undefined = undefined
  export let currentProject: Project | undefined = undefined
  // Shared by the cards of a view: labels that already fit their chip
  export let fullFilled: Record<string, boolean> = {}
  // A sample in the board settings: an empty field shows a sample value, so every checked field is seen
  export let preview: boolean = false

  const client = getClient()

  let parentSample = ''
  let labelSample = ''
  $: if (preview) {
    translateCB(tracker.string.Parent, {}, $themeStore.language, (r) => (parentSample = r))
    translateCB(tracker.string.CardSampleLabel, {}, $themeStore.language, (r) => (labelSample = r))
  }

  function withSamples (issue: WithLookup<Issue>, parentTitle: string): WithLookup<Issue> {
    const total = reduceChildInfoTree(issue.childInfo ?? [], issue.estimation, issue.reportedTime).totalEstimation
    const subIssues: Issue[] = [0, 1].map((i) => ({ ...issue, _id: `${issue._id}-sample-${i}` as Ref<Issue> }))
    return {
      ...issue,
      priority: issue.priority === IssuePriority.NoPriority ? IssuePriority.High : issue.priority,
      subIssues: issue.subIssues > 0 ? issue.subIssues : subIssues.length,
      $lookup: { ...issue.$lookup, subIssues: issue.subIssues > 0 ? issue.$lookup?.subIssues : subIssues },
      dueDate: issue.dueDate ?? Date.now() + 14 * 24 * 60 * 60 * 1000,
      estimation: total > 0 ? issue.estimation : 8,
      attachments: (issue.attachments ?? 0) > 0 ? issue.attachments : 2,
      comments: (issue.comments ?? 0) > 0 ? issue.comments : 3,
      parents:
        issue.parents.length > 0
          ? issue.parents
          : [
              {
                parentId: `${issue._id}-sample-parent` as Ref<Issue>,
                identifier: issue.identifier,
                parentTitle,
                space: issue.space
              }
            ]
    }
  }

  $: card = preview ? withSamples(issue, parentSample) : issue
  $: sampleTag = { title: labelSample, color: PaletteColorIndexes.Pink } as unknown as TagReference
  $: estimations = reduceChildInfoTree(card.childInfo ?? [], card.estimation, card.reportedTime).totalEstimation
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
  class="tracker-card {density}"
  class:accent={accent !== undefined}
  style:--card-accent={accent}
  data-density={density}
  on:click={() => {
    void openDoc(client.getHierarchy(), issue)
  }}
>
  {#if density === 'dense'}
    <div class="card-row dense-row">
      <StatusEditor value={card} kind="list" isEditable={false} />
      <span class="card-id"><IssuePresenter value={card} /></span>
      <span class="card-title one-line caption-color">{issue.title}</span>
      <AssigneeEditor object={card} avatarSize="card" shouldShowName={false} showStatus={false} />
    </div>
  {:else if density === 'compact'}
    <div class="card-row title-row">
      <StatusEditor value={card} kind="list" isEditable={false} />
      <span class="card-title caption-color">{issue.title}</span>
      <Component is={notification.component.NotificationPresenter} props={{ value: card }} />
      <AssigneeEditor object={card} avatarSize="card" shouldShowName={false} showStatus={false} />
    </div>
    <div class="card-meta icons">
      <span class="card-id"><IssuePresenter value={card} /></span>
      {#if shown('priority')}
        <div class="card-priority">
          <PriorityEditor value={card} isEditable={true} kind="link-bordered" size="small" justify="center" />
        </div>
      {/if}
      {#if shown('subIssues') && card.subIssues > 0}
        <div class="icon-only">
          <SubIssuesSelector value={card} {currentProject} size="small" icon={tracker.icon.Subissue} />
        </div>
      {/if}
      {#if shown('dueDate') && card.dueDate != null}
        <div class="icon-only"><DueDatePresenter value={card} size="small" kind="link-bordered" /></div>
      {/if}
      {#if shown('component') && card.component != null}
        <div class="icon-only">
          <ComponentEditor value={card} {space} isEditable={true} kind="link-bordered" size="small" />
        </div>
      {:else if shown('component') && preview}
        <div class="icon-only"><Button icon={tracker.icon.Component} kind="link-bordered" size="small" /></div>
      {/if}
      {#if shown('milestone') && (card.milestone != null || preview)}
        <div class="icon-only">
          <MilestoneEditor value={card} {space} isEditable={true} kind="link-bordered" size="small" />
        </div>
      {/if}
      {#if shown('estimation') && estimations > 0}
        <div class="card-estimation">
          <EstimationEditor kind="link-bordered" size="small" value={card} />
        </div>
      {/if}
    </div>
  {:else}
    <div class="card-row card-top">
      <div class="card-id flex-row-center min-w-0">
        <div class="flex-no-shrink"><IssuePresenter value={card} /></div>
        {#if shown('parent')}<ParentNamesPresenter value={card} />{/if}
      </div>
      <div class="flex-row-center gap-2 reverse flex-no-shrink">
        <Component is={notification.component.NotificationPresenter} props={{ value: card }} />
        <AssigneeEditor object={card} avatarSize="card" shouldShowName={false} showStatus={false} />
      </div>
    </div>
    <div class="card-row title-row">
      <StatusEditor value={card} kind="list" isEditable={false} />
      <span class="card-title caption-color lines-limit-2">{issue.title}</span>
    </div>
    <div class="card-chips">
      {#if shown('priority')}
        <div class="card-priority">
          <PriorityEditor value={card} isEditable={true} kind="link-bordered" size="small" justify="center" />
        </div>
      {/if}
      {#if shown('subIssues') && card.subIssues > 0}
        <SubIssuesSelector value={card} {currentProject} size="small" icon={tracker.icon.Subissue} />
      {/if}
      {#each customAttrModels as attrModel (attrModel.key)}
        <ListPresenter
          docObject={card}
          attributeModel={attrModel}
          value={getObjectValue(attrModel.key, card)}
          onChange={undefined}
          props={{}}
          hideDivider={true}
          compactMode={true}
          customStyle="square"
        />
      {/each}
      {#if shown('dueDate') && card.dueDate != null}
        <DueDatePresenter value={card} size="small" kind="link-bordered" />
      {/if}
      {#if shown('component') && card.component != null}
        <ComponentEditor value={card} {space} isEditable={true} kind="link-bordered" size="small" justify="center" />
      {:else if shown('component') && preview}
        <!-- An empty component editor says "No component": the sample names the field instead -->
        <Button icon={tracker.icon.Component} kind="link-bordered" size="small" justify="center">
          <span slot="content" class="label text-md overflow-label"><Label label={tracker.string.Component} /></span>
        </Button>
      {/if}
      {#if shown('milestone') && (card.milestone != null || preview)}
        <MilestoneEditor
          value={card}
          {space}
          isEditable={true}
          kind="link-bordered"
          size="small"
          maxWidth="7rem"
          justify="center"
        />
      {/if}
      {#if density === 'normal' && shown('estimation') && estimations > 0}
        <div class="card-estimation">
          <EstimationEditor kind="link-bordered" size="small" value={card} />
        </div>
      {/if}
      {#if density === 'detailed' && shown('labels') && preview && (issue.labels ?? 0) === 0}
        <div class="label-box"><TagReferencePresenter attr={undefined} value={sampleTag} kind="link" /></div>
      {:else if density === 'detailed' && shown('labels')}
        <Component
          is={tags.component.LabelsPresenter}
          props={{
            value: issue.labels,
            object: issue,
            checkFilled: fullFilled[issue._id],
            kind: 'link',
            compression: true
          }}
          on:change={(res) => {
            if (res.detail.full) fullFilled[issue._id] = true
          }}
        />
      {/if}
    </div>
    {#if density === 'detailed'}
      {@const withEstimation = shown('estimation') && estimations > 0}
      {@const attachments = shown('attachments') ? (card.attachments ?? 0) : 0}
      {@const comments = shown('comments') ? (card.comments ?? 0) : 0}
      {#if withEstimation || attachments > 0 || comments > 0}
        <div class="card-footer">
          {#if withEstimation}
            <div class="card-estimation">
              <Label label={tracker.string.Estimation} />
              <EstimationEditor kind="list" size="small" value={card} />
            </div>
          {/if}
          {#if attachments > 0 || comments > 0}
            <div class="card-counters">
              {#if attachments > 0}
                <AttachmentsPresenter value={attachments} object={card} />
              {/if}
              {#if comments > 0}
                <ChatMessagesPresenter value={comments} object={card} />
              {/if}
            </div>
          {/if}
        </div>
      {/if}
    {/if}
  {/if}
</div>

<style lang="scss">
  .tracker-card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem 0.875rem;
    min-width: 0;
    border-radius: 0.5rem;

    // The border of a board color rule stays on the card
    &.accent {
      box-shadow: inset 0 0 0 2px var(--card-accent);
    }
    &.normal {
      padding: 0.625rem 0.75rem;
    }
    &.compact {
      gap: 0.375rem;
      padding: 0.5rem 0.625rem;
    }
    &.dense {
      gap: 0.25rem;
      padding: 0.375rem 0.625rem;
    }

    .card-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      min-width: 0;

      &.card-top {
        justify-content: space-between;
      }
      &.title-row {
        align-items: flex-start;
      }
    }
    &.compact .card-row,
    &.dense .card-row {
      gap: 0.375rem;
    }
    .card-title {
      flex: 1;
      min-width: 0;
      font-size: 0.875rem;
      font-weight: 500;
      line-height: 1.3;
      word-break: break-word;
    }
    &.compact .card-title {
      font-size: 0.8125rem;
    }
    &.dense .card-title {
      font-size: 0.8125rem;
      font-weight: 400;
    }
    .one-line {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    // Avatars of the card are round and without the online marker, as in the design kit
    :global(.hulyAvatar-container.hulyAvatarSize-card),
    :global(.hulyAvatar-container.hulyAvatarSize-card img.ava-image) {
      border-radius: 50%;
    }
    .card-id {
      flex-shrink: 0;
      font-size: 0.75rem;
      line-height: 1.25;
      color: var(--theme-darker-color);

      :global(a),
      :global(.issuePresenterRoot) {
        color: inherit;
      }
      :global(.parent-label:not(:hover)) {
        color: var(--theme-darker-color);
      }
    }
    .card-top .card-id {
      flex-shrink: 1;
      color: var(--theme-dark-color);
    }
    .card-meta {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.5rem;

      // Editors stay clickable but look like bare icons
      :global(.antiButton),
      :global(.datetime-button) {
        gap: 0;
        width: auto !important;
        min-width: 0;
        height: 1rem;
        padding: 0 !important;
        font-size: 0;
        color: var(--theme-dark-color);
        background-color: transparent;
        border: none;
      }
      :global(.btn-icon),
      :global(.mr-1-5) {
        margin: 0 !important;
      }
      :global(.btn-icon:not(.warning, .critical, .overdue)),
      :global(.mr-1-5) {
        color: var(--theme-dark-color);
      }
      :global(.btn-icon.overdue) {
        color: var(--theme-state-negative-color);
      }
      :global(.btn-icon),
      :global(.btn-icon svg),
      :global(.mr-1-5 svg) {
        width: 0.875rem;
        height: 0.875rem;
      }
      .icon-only :global(*) {
        font-size: 0;
      }
      .card-priority :global(.btn-icon) {
        color: var(--theme-caption-color);
      }
      .card-priority :global(.btn-icon),
      .card-priority :global(.btn-icon svg) {
        width: 1rem;
        height: 1rem;
      }
      .card-estimation :global(.antiButton) {
        font-size: 0.75rem;
        line-height: 1.25;
        color: var(--theme-darker-color);
      }
      .card-estimation :global(.btn-icon) {
        display: none;
      }
    }
    // Pills of the design kit: 24px, white, hairline border, 14px icon and 12px text
    .card-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 0.375rem;
      min-width: 0;

      :global(.antiButton),
      :global(.datetime-button),
      :global(.link-container) {
        height: 1.5rem;
        padding: 0 0.5rem !important;
        font-size: 0.75rem;
        line-height: 1.25;
        color: var(--theme-dark-color);
        background-color: var(--theme-popup-color);
        border: 1px solid var(--theme-button-border);
        border-radius: 0.75rem;

        &:hover {
          color: var(--theme-caption-color);
          background-color: var(--theme-link-button-hover);
        }
      }
      :global(.antiButton .label),
      :global(.antiButton .label *),
      :global(.antiButton .content-color),
      :global(.link-container .label) {
        font-size: inherit;
        line-height: inherit;
        color: inherit;
      }
      :global(.link-container .label) {
        margin-left: 0.375rem;
      }
      :global(.btn-icon),
      :global(.mr-1-5) {
        margin-right: 0.375rem !important;
      }
      :global(.btn-icon:not(.warning, .critical, .overdue)) {
        color: var(--theme-dark-color);
      }
      :global(.btn-icon),
      :global(.btn-icon svg),
      :global(.mr-1-5 svg) {
        width: 0.875rem;
        height: 0.875rem;
      }
      :global(.datetime-button:has(.btn-icon.overdue)),
      :global(.datetime-button .btn-icon.overdue) {
        color: var(--theme-state-negative-color);
      }
      .card-priority :global(.btn-icon) {
        margin-right: 0 !important;
      }
      .card-priority :global(.btn-icon),
      .card-priority :global(.btn-icon svg) {
        width: 1rem;
        height: 1rem;
      }
      .card-estimation :global(.btn-icon) {
        display: none;
      }
    }
    // The sample label of a preview, laid out as LabelsPresenter lays out its labels
    .label-box {
      display: flex;
      align-items: center;
      min-width: 0;
    }
    // Plain row without a grey bar: estimation on the left, counters of the issue on the right
    .card-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      font-size: 0.75rem;
      color: var(--theme-darker-color);

      .card-estimation {
        display: flex;
        align-items: center;
        gap: 0.25rem;

        :global(.estimation-container .icon) {
          display: none;
        }
        :global(.estimation-container .label) {
          margin-left: 0;
          font-size: inherit;
          color: inherit;
        }
      }
      .card-counters {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        margin-left: auto;

        :global(.antiButton),
        :global(.sm-tool-icon) {
          height: auto;
          padding: 0 !important;
          font-size: inherit;
          color: inherit;
          border: none;
        }
        :global(a),
        :global(.sm-tool-icon .icon) {
          color: inherit;
        }
        :global(svg) {
          width: 0.875rem;
          height: 0.875rem;
        }
      }
    }
  }
</style>
