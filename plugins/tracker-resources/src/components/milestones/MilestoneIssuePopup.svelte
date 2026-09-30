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
  import type { Doc, DocumentQuery, FindOptions, Mixin, Ref, Space } from '@hcengineering/core'
  import core, { SortingOrder } from '@hcengineering/core'
  import presentation, { ObjectPopup, getClient } from '@hcengineering/presentation'
  import task, { type TimeManaged } from '@hcengineering/task'
  import type { Issue, Milestone, Project } from '@hcengineering/tracker'
  import { Button } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'
  import tracker from '../../plugin'
  import IssueStatusIcon from '../issues/IssueStatusIcon.svelte'

  export let milestone: Milestone | undefined = undefined
  export let space: Ref<Space> | undefined = undefined

  const dispatch = createEventDispatcher()
  let selected: Array<Ref<Issue>> = []

  const hierarchy = getClient().getHierarchy()
  const timeManaged = task.mixin.TimeManaged as Ref<Mixin<Issue & TimeManaged>>

  const isScheduled = (it: Issue): boolean =>
    it.dueDate != null || (hierarchy.hasMixin(it, timeManaged) && hierarchy.as(it, timeManaged).startDate != null)

  // Issues not on this timeline yet: no dates, or (on a milestone) dated but outside the milestone.
  const filter = (it: Doc): boolean =>
    !isScheduled(it as Issue) || (milestone !== undefined && (it as Issue).milestone !== milestone._id)

  // This milestone's issues first.
  function sort<T extends Doc> (a: T, b: T): number {
    const inA = (a as unknown as Issue).milestone === milestone?._id ? 0 : 1
    const inB = (b as unknown as Issue).milestone === milestone?._id ? 0 : 1
    return inA - inB
  }

  const docQuery: DocumentQuery<Issue> =
    milestone !== undefined
      ? { space: milestone.space, milestone: { $in: [milestone._id, null] } }
      : space !== undefined
        ? { space: space as Ref<Project> }
        : {}

  const options: FindOptions<Issue> = {
    lookup: {
      status: [tracker.class.IssueStatus, { category: core.class.StatusCategory }]
    },
    sort: { modifiedOn: SortingOrder.Descending }
  }
</script>

<div class="selectPopup width-40">
  <ObjectPopup
    _class={tracker.class.Issue}
    {docQuery}
    {filter}
    {sort}
    {options}
    category={tracker.completion.IssueCategory}
    multiSelect
    embedded
    placeholder={tracker.string.SelectIssue}
    width={'large'}
    searchMode={'spotlight'}
    on:update={(e) => {
      selected = e.detail
    }}
  >
    <svelte:fragment slot="item" let:item={issue}>
      <div class="flex-center clear-mins w-full h-9">
        {#if issue?.$lookup?.status}
          <div class="icon mr-4 h-8">
            <IssueStatusIcon value={issue.$lookup.status} taskType={issue.kind} space={issue.space} size="small" />
          </div>
        {/if}
        <span class="overflow-label flex-no-shrink mr-3">{issue.identifier}</span>
        <span class="overflow-label w-full content-color">{issue.title}</span>
      </div>
    </svelte:fragment>
  </ObjectPopup>
  <div class="flex-row-reverse p-2">
    <Button
      kind={'primary'}
      label={presentation.string.Add}
      disabled={selected.length === 0}
      on:click={() => {
        dispatch('close', selected)
      }}
    />
  </div>
</div>
