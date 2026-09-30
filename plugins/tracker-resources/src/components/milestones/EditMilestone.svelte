<!--
// Copyright © 2023 Hardcore Engineering Inc.
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
  import { AttachmentStyleBoxEditor } from '@hcengineering/attachment-resources'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import type { Milestone } from '@hcengineering/tracker'
  import { Component, EditBox, Label, Switcher } from '@hcengineering/ui'
  import view, { type ViewOptions, type Viewlet } from '@hcengineering/view'
  import { TimelineRangeDropdown, ViewletSettingButton } from '@hcengineering/view-resources'
  import { createEventDispatcher, onMount } from 'svelte'
  import tracker from '../../plugin'
  import QueryIssuesList from '../issues/edit/QueryIssuesList.svelte'

  export let object: Milestone

  const dispatch = createEventDispatcher()
  const client = getClient()

  let oldLabel = ''
  let rawLabel = ''

  async function change<K extends keyof Milestone> (field: K, value: Milestone[K]) {
    await client.update(object, { [field]: value })
  }

  $: if (oldLabel !== object.label) {
    oldLabel = object.label
    rawLabel = object.label
  }

  onMount(() => dispatch('open', { ignoreKeys: ['label', 'description', 'attachments'] }))
  $: descriptionKey = client.getHierarchy().getAttribute(tracker.class.Component, 'description')
  let descriptionBox: AttachmentStyleBoxEditor

  let mode: 'list' | 'timeline' = localStorage.getItem('milestone.issuesMode') === 'timeline' ? 'timeline' : 'list'
  $: localStorage.setItem('milestone.issuesMode', mode)

  let scale = Number(localStorage.getItem('milestone.timelineScale') ?? 1)
  $: localStorage.setItem('milestone.timelineScale', String(scale))

  let viewOptions: ViewOptions | undefined

  let timelineViewlet: Viewlet | undefined
  const viewletQuery = createQuery()
  $: viewletQuery.query(view.class.Viewlet, { _id: tracker.viewlet.MilestoneIssuesTimeline }, (res) => {
    timelineViewlet = res[0]
  })
</script>

<EditBox
  bind:value={rawLabel}
  placeholder={tracker.string.MilestoneNamePlaceholder}
  kind="large-style"
  on:blur={async () => {
    const trimmedLabel = rawLabel.trim()

    if (trimmedLabel.length === 0) {
      rawLabel = oldLabel
    } else if (trimmedLabel !== object.label) {
      await change('label', trimmedLabel)
    }
  }}
/>

<div class="w-full mt-6">
  <AttachmentStyleBoxEditor
    focusIndex={30}
    {object}
    key={{ key: 'description', attr: descriptionKey }}
    bind:this={descriptionBox}
    placeholder={tracker.string.IssueDescriptionPlaceholder}
  />
</div>

<div class="w-full mt-6">
  <QueryIssuesList
    focusIndex={50}
    {object}
    query={{ milestone: object._id }}
    shouldSaveDraft
    hasSubIssues={true}
    viewletId={tracker.viewlet.MilestoneIssuesList}
    createParams={{ milestone: object._id }}
    showList={mode === 'list'}
  >
    <svelte:fragment slot="header">
      <div class="flex-row-center flex-gap-2">
        <Label label={tracker.string.Issues} />
        <Switcher
          name={'milestone-issues-mode'}
          kind={'subtle'}
          selected={mode}
          items={[
            { id: 'list', icon: view.icon.List, tooltip: view.string.List },
            { id: 'timeline', icon: view.icon.Timeline, tooltip: view.string.Timeline }
          ]}
          on:select={(e) => {
            mode = e.detail.id
          }}
        />
        {#if mode === 'timeline'}
          <TimelineRangeDropdown
            value={scale}
            on:change={(e) => {
              scale = e.detail
            }}
          />
          {#if timelineViewlet !== undefined}
            <ViewletSettingButton kind={'tertiary'} viewlet={timelineViewlet} bind:viewOptions />
          {/if}
        {/if}
      </div>
    </svelte:fragment>
  </QueryIssuesList>
  {#if mode === 'timeline' && timelineViewlet !== undefined}
    <div class="timeline">
      <Component
        is={view.component.TimelineView}
        props={{
          _class: tracker.class.Issue,
          query: { milestone: object._id },
          viewlet: timelineViewlet,
          scaleMonths: scale,
          viewOptions,
          range: { startDate: object.startDate ?? object.targetDate, targetDate: object.targetDate }
        }}
      />
    </div>
  {/if}
</div>

<style lang="scss">
  .timeline {
    display: flex;
    flex-direction: column;
    height: 30rem;
    border: 1px solid var(--theme-divider-color);
    border-radius: 0.5rem;
    overflow: hidden;
  }
</style>
