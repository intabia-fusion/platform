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
  // Issue page of the tracker (EditIssue in a popup Panel): header, title, description, sub-issues, activity and the properties aside
  import {
    Button,
    Icon as UiIcon,
    IconAdd,
    IconDropdown,
    IconMaxWidth,
    IconMoreH,
    Panel,
    Scroller
  } from '@hcengineering/ui'
  import { IconButton } from '@hcengineering/ui/kit'
  import { setMetadata, type Asset, type Metadata } from '@hcengineering/platform'
  import recordSprite from '../../../../../../plugins/recorder-assets/assets/icon.svg?url'
  import { spriteAssets } from '../../setup'
  import Icon from '../Icon.svelte'
  import Avatar from '../People/Avatar.svelte'
  import { productIcon } from '../productIcon'
  import PriorityIcon from '../Status/PriorityIcon.svelte'
  import StatusIcon from '../Status/StatusIcon.svelte'
  import { fixedColumns } from './fixedColumns'
  import IssueRow from './IssueRow.svelte'
  import type { Issue, Person } from '../types'

  export let issue: Issue
  export let project: string = 'Default'
  export let creator: Person
  export let description: string | undefined = undefined
  export let subIssues: Issue[] = []
  // Time and text of the activity entries, newest last
  export let activity: Array<{ time: string, text: string, strong?: string }> = []
  export let created: string = ''

  // Sub-issue rows share their column widths
  fixedColumns()
  // The recorder assets ship one icon.svg instead of the icons.svg sprite that setup.ts reads
  setMetadata('recorder:icon:Record' as unknown as Metadata<string>, `${recordSprite}#record`)
  spriteAssets.set('recorder/record', 'recorder:icon:Record' as Asset)
  const sprite = (name: string): Asset => spriteAssets.get(name) as Asset
  const ic = (name: string): any => productIcon(name)
  const priorityLabel: Record<string, string> = {
    none: 'No priority',
    urgent: 'Urgent',
    high: 'High',
    medium: 'Medium',
    low: 'Low'
  }
</script>

<div class="kit-issue-page">
  <Panel isAside allowClose>
    <!-- The product fills it with extensions, the empty slot keeps the divider after the close button -->
    <svelte:fragment slot="beforeTitle" />
    <svelte:fragment slot="title">
      <div class="issue-title">
        <div class="issue-title__content">
          <div class="flex-presenter cursor-default project">
            <Icon name="tracker/home" /><span class="project-name">{project}</span>
          </div>
          <span class="breadcrumb-separator">›</span>
          <div class="title overflow-label">{issue.id}</div>
        </div>
      </div>
    </svelte:fragment>
    <svelte:fragment slot="pre-utils">
      <IconButton size="small" icon={sprite('view/ai-star')} iconSize="medium" kind="ghost" aria-label="AI" />
      <button class="reactions-summary" type="button">
        <svg class="star-mark" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2.8l2.75 5.8 6.35.78-4.68 4.38 1.2 6.29L12 16.97l-5.62 3.08 1.2-6.29L2.9 9.38l6.35-.78z" />
        </svg>
      </button>
    </svelte:fragment>
    <svelte:fragment slot="utils">
      <IconButton size="small" icon={ic('ui/Link')} iconSize="medium" kind="ghost" aria-label="Copy link" />
      <IconButton
        size="small"
        icon={sprite('view/sidebar')}
        iconSize="medium"
        kind="ghost"
        aria-label="Open in sidebar"
      />
      <IconButton size="small" icon={IconMoreH} iconSize="medium" kind="ghost" aria-label="More actions" />
    </svelte:fragment>

    <div class="main">
      <Scroller>
        <div class="max-width-toggle">
          <IconButton icon={IconMaxWidth} kind="ghost" size="small" iconSize="medium" aria-label="Full width" />
        </div>
        <div class="popupPanel-body__main-content py-8 max">
          <div class="antiEditBox">
            <div class="large-style flex-row-center clear-mins"><span class="issue-name">{issue.title}</span></div>
          </div>
          <div class="w-full mt-6">
            <div class="description" class:empty={description === undefined}>{description ?? 'Add description...'}</div>
            <div class="toolbar">
              <div class="buttons-group">
                <Button kind="ghost" size="medium" icon={ic('text-editor/Attach')} iconProps={{ size: 'medium' }} />
                <Button kind="ghost" size="medium" icon={sprite('recorder/record')} iconProps={{ size: 'medium' }} />
                <span class="buttons-divider" />
                <Button kind="ghost" size="medium" icon={ic('text-editor/Table')} iconProps={{ size: 'medium' }} />
                <span class="buttons-divider" />
                <Button kind="ghost" size="medium" icon={ic('text-editor/RIMention')} iconProps={{ size: 'medium' }} />
                <Button kind="ghost" size="medium" icon={sprite('emoji/emoji')} iconProps={{ size: 'medium' }} />
                <span class="buttons-divider" />
                <Button kind="ghost" size="medium" icon={sprite('templates/template')} iconProps={{ size: 'medium' }} />
              </div>
            </div>
          </div>
          {#if subIssues.length > 0}
            <div class="mt-6">
              {#each subIssues as sub, i (sub.id)}
                <IssueRow issue={sub} last={i === subIssues.length - 1} />
              {/each}
            </div>
          {/if}
          <div class="mt-6">
            <div class="flex-between mb-1">
              <div class="flex-row-center">
                <Button kind="ghost" size="medium" icon={IconAdd} shape="rectangle-right" borderStyle="none">
                  <svelte:fragment slot="content">
                    <div class="flex-row-center w-full flex-between relative">
                      <span class="overflow-label">Add sub-issue</span>
                      <div class="ghost vertical-divider max-h-5 h-5" />
                    </div>
                  </svelte:fragment>
                </Button>
                <Button
                  kind="ghost"
                  size="medium"
                  icon={IconDropdown}
                  shape="rectangle-left"
                  borderStyle="none"
                  width="1.75rem"
                />
              </div>
            </div>
          </div>
          <div class="antiSection mt-6">
            <div class="antiSection-header">
              <div class="antiSection-header__icon"><Icon name="activity/activity" /></div>
              <span class="antiSection-header__title flex-row-center">Activity</span>
              <div class="buttons-group small-gap pr-2 relative">
                <Button kind="ghost" size="small" icon={sprite('view/configure')} />
              </div>
            </div>
            <div class="p-activity select-text forward">
              <div class="grid">
                <div class="activityMessage clear-mins">
                  <div class="avatar mt-1 flex-no-shrink"><Avatar person={creator} size={40} /></div>
                  <div class="flex-col w-full clear-mins message-content">
                    <div class="header clear-mins">
                      <div class="username">{creator.name}</div>
                      <span class="text-sm timestamp">{created}</span>
                    </div>
                    <div class="clear-mins new-issue">
                      <Icon name="tracker/issue" /><span>New issue: <span class="link">{issue.title}</span></span>
                    </div>
                  </div>
                </div>
                {#each activity as item}
                  <div class="activityMessage clear-mins">
                    <span class="text-sm lower time"><span>{item.time}</span></span>
                    <div class="flex-col w-full clear-mins message-content">
                      <div class="content overflow-label">
                        <span class="mr-1"><Icon name="ui/Edit" /></span>
                        <span>{item.text}</span>
                        {#if item.strong !== undefined}<span class="strong">{item.strong}</span>{/if}
                      </div>
                    </div>
                  </div>
                {/each}
              </div>
            </div>
            <div class="ref-input forward">
              <div class="ref-container">
                <div class="text-input"><div class="select-text placeholder">Start typing...</div></div>
                <div class="buttons-panel flex-between clear-mins">
                  <div class="buttons-group xsmall-gap">
                    <Button kind="ghost" size="medium" icon={ic('text-editor/Attach')} iconProps={{ size: 'medium' }} />
                    <Button
                      kind="ghost"
                      size="medium"
                      icon={sprite('recorder/record')}
                      iconProps={{ size: 'medium' }}
                    />
                    <span class="buttons-divider" />
                    <Button kind="ghost" size="medium" icon={ic('chunter/IconMic')} iconProps={{ size: 'medium' }} />
                    <span class="buttons-divider" />
                    <Button
                      kind="ghost"
                      size="medium"
                      icon={ic('text-editor/RIMention')}
                      iconProps={{ size: 'medium' }}
                    />
                    <Button kind="ghost" size="medium" icon={sprite('emoji/emoji')} iconProps={{ size: 'medium' }} />
                    <span class="buttons-divider" />
                    <Button
                      kind="ghost"
                      size="medium"
                      icon={sprite('templates/template')}
                      iconProps={{ size: 'medium' }}
                    />
                  </div>
                  <Button kind="ghost" size="medium" icon={ic('text-editor/Send')} iconProps={{ size: 'medium' }} />
                </div>
              </div>
              <div class="typing-row" />
            </div>
          </div>
        </div>
      </Scroller>
    </div>

    <svelte:fragment slot="aside">
      <Scroller>
        <div class="space-divider" />
        <div class="popupPanel-body__aside-grid">
          <span class="labelOnPanel">Status</span>
          <Button kind="link" size="medium" justify="left" width="100%">
            <svelte:fragment slot="content">
              <StatusIcon status={issue.status} /><span class="overflow-label ml-2">{issue.status.name}</span>
            </svelte:fragment>
          </Button>
          <span class="labelOnPanel">Priority</span>
          <Button kind="link" size="medium" justify="left" width="100%">
            <svelte:fragment slot="content">
              <PriorityIcon priority={issue.priority} /><span class="overflow-label ml-2"
                >{priorityLabel[issue.priority]}</span
              >
            </svelte:fragment>
          </Button>
          <span class="labelOnPanel">Created by</span>
          <Button kind="link" size="medium" justify="center" width="100%">
            <svelte:fragment slot="content">
              <div class="person"><Avatar person={creator} size={20} /><span class="ml-2">{creator.name}</span></div>
            </svelte:fragment>
          </Button>
          <span class="labelOnPanel">Assignee</span>
          <Button kind="link" size="medium" justify="left" width="100%">
            <svelte:fragment slot="content">
              {#if issue.assignee !== undefined}
                <div class="person">
                  <Avatar person={issue.assignee} size={20} /><span class="ml-2">{issue.assignee.name}</span>
                </div>
              {:else}
                <div class="person not-selected">
                  <UiIcon icon={ic('contact/Person')} size="small" /><span class="ml-2">Assignee</span>
                </div>
              {/if}
            </svelte:fragment>
          </Button>
          <span class="labelTop">Labels</span>
          <button class="tag-button" type="button"
            ><Icon name="tags/tags" /><span class="overflow-label label ml-1">Add label</span></button
          >
          <div class="divider" />
          <span class="labelOnPanel">Task type</span>
          <Button kind="link" size="medium" justify="left" width="100%">
            <svelte:fragment slot="content"
              ><Icon name="tracker/issue" /><span class="ml-1-5">Issue</span></svelte:fragment
            >
          </Button>
          <span class="labelOnPanel">Component</span>
          <Button
            kind="link"
            size="medium"
            justify="left"
            width="100%"
            icon={sprite('tracker/component')}
            notSelected={issue.component === undefined}
          >
            <svelte:fragment slot="content"><span class="label">{issue.component ?? 'Component'}</span></svelte:fragment
            >
          </Button>
          <span class="labelOnPanel">Milestone</span>
          <Button
            kind="link"
            size="medium"
            justify="left"
            width="100%"
            icon={sprite('tracker/milestone')}
            notSelected={issue.milestone === undefined}
          >
            <svelte:fragment slot="content"><span class="label">{issue.milestone ?? 'Milestone'}</span></svelte:fragment
            >
          </Button>
          <div class="divider" />
          <span class="labelOnPanel">Estimation</span>
          <div class="time-value"><span>{issue.estimation ?? 0}h</span></div>
          <span class="labelOnPanel">Spent time</span>
          <div class="time-value large"><span>{issue.reported ?? 0}h</span><Icon name="ui/Add" size={16} /></div>
          <div class="divider" />
          <span class="labelOnPanel">Remaining time</span>
          <div class="remaining"><span>{(issue.estimation ?? 0) - (issue.reported ?? 0)}h</span></div>
          <div class="divider" />
          <span class="labelOnPanel">Collaborators</span>
          <Button kind="link" size="large" justify="left" width="100%">
            <svelte:fragment slot="content">
              <div class="person"><Avatar person={creator} size={20} /><span class="ml-2">{creator.name}</span></div>
            </svelte:fragment>
          </Button>
          <div class="divider" />
          <span class="labelOnPanel">Repository</span>
          <div class="flex">
            <Button kind="link" size="medium" justify="left" iconRight={IconDropdown}>
              <svelte:fragment slot="content"><span class="overflow-label label">Repository</span></svelte:fragment>
            </Button>
          </div>
        </div>
        <div class="popupPanel-body__aside-grid">
          <div class="divider" />
          <div class="row"><span class="label">State History:</span></div>
          <div class="flex-presenter">
            <StatusIcon status={issue.status} /><span class="overflow-label ml-2">{issue.status.name}</span>
          </div>
          <span class="textPadding">{created}</span>
        </div>
        <div class="space-divider bottom" />
      </Scroller>
    </svelte:fragment>
  </Panel>
</div>

<style lang="scss">
  .kit-issue-page {
    width: 100%;
    height: 100%;
  }
  // The Separator sizes the aside from the window, which a story canvas does not have
  .kit-issue-page :global(.popupPanel-body__aside) {
    flex: 0 0 400px !important;
    width: 400px !important;
    min-width: 400px !important;
    max-width: 400px !important;
  }
  .kit-issue-page :global(.popupPanel) {
    box-sizing: border-box;
    border: 1px solid var(--theme-divider-color);
    border-radius: 0.5rem;
  }
  .main {
    position: relative;
    display: flex;
    flex-direction: column;
    flex-grow: 1;
    min-height: 0;
  }
  .issue-title {
    display: flex;
    align-items: center;
    gap: var(--spacing-0_5);
    min-width: 0;
    overflow: hidden;

    &__content {
      display: flex;
      flex-shrink: 0;
      align-items: center;
      gap: var(--spacing-0_5);
    }
  }
  .project {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .breadcrumb-separator {
    margin: 0 0.5rem;
    color: var(--theme-caption-color);
  }
  .reactions-summary {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0 0.5rem;
    height: 2rem;
    color: var(--global-secondary-TextColor);
    background: transparent;
    border: none;
    border-radius: 0.375rem;
  }
  .star-mark {
    width: 1.25rem;
    height: 1.25rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linejoin: round;
  }
  .max-width-toggle {
    position: absolute;
    top: 2rem;
    right: calc((3.75rem - var(--global-small-Size)) / 2);
    z-index: 1;
  }
  .issue-name {
    font-size: 1.25rem;
    color: var(--theme-caption-color);
  }
  .description {
    margin: 0.5rem 0;
    padding: 0.5rem 0;
    color: var(--theme-content-color);

    &.empty {
      color: var(--theme-dark-color);
    }
  }
  .toolbar {
    display: flex;
    margin-top: 0.75rem;
  }
  .buttons-group {
    display: flex;
    align-items: center;
    gap: 0.375rem;

    &.small-gap {
      gap: 0.5rem;
    }
  }
  .buttons-divider {
    width: 1px;
    height: 1.5rem;
    background-color: var(--theme-list-divider-color);
  }
  .antiSection-header__title {
    flex-grow: 1;
  }
  .activityMessage {
    display: flex;
    gap: 1rem;
    padding: 0.5rem 1.25rem;
    border: 1px solid transparent;
    border-radius: 0.25rem;

    .username {
      font-weight: 500;
      color: var(--global-secondary-TextColor);
    }
    .header {
      display: flex;
      align-items: center;
    }
    .timestamp {
      margin-left: 0.25rem;
      color: var(--global-secondary-TextColor);
    }
    .new-issue {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-top: 0.25rem;
    }
    .link {
      color: var(--primary-button-default);
    }
    .time {
      width: 2.5rem;
      margin-top: 0.125rem;
      text-align: right;
    }
    .content {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      height: 1.15625rem;
      color: var(--global-primary-TextColor);
    }
    .strong {
      font-weight: 500;
    }
  }
  .ref-container {
    border: 1px solid var(--theme-button-border);
    border-radius: 0.375rem;
  }
  .text-input {
    padding: 0.125rem 0.75rem;
    height: 2.75rem;
    box-sizing: border-box;
    color: var(--theme-dark-color);
  }
  .placeholder {
    margin-top: 0.625rem;
  }
  .buttons-panel {
    padding: 0.325rem 0.75rem;
  }
  .typing-row {
    height: 1.5rem;
  }
  .person {
    display: flex;
    align-items: center;
    width: 100%;
  }
  .tag-button {
    display: flex;
    align-items: center;
    justify-self: start;
    height: 2rem;
    padding: 0 0.625rem 0 0.5rem;
    color: var(--theme-content-color);
    background: transparent;
    border: 1px solid transparent;
    border-radius: 1rem;
  }
  .time-value {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 1.75rem;
    padding: 0 0.75rem;
    font-size: 0.8125rem;
    color: var(--theme-content-color);

    &.large {
      height: 2.25rem;
    }
  }
  .remaining {
    padding: 0 0.75rem;
  }
  .row {
    grid-column: 1 / 3;
  }
  .not-selected {
    color: var(--theme-dark-color);
  }
</style>
