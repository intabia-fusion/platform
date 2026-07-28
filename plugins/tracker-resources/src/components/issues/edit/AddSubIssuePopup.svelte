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
  import core, { FindOptions, SortingOrder } from '@hcengineering/core'
  import { ObjectPopup, getClient } from '@hcengineering/presentation'
  import { makeRank } from '@hcengineering/task'
  import { Issue } from '@hcengineering/tracker'
  import { createEventDispatcher } from 'svelte'
  import tracker from '../../../plugin'
  import IssueStatusIcon from '../IssueStatusIcon.svelte'

  export let issue: Issue

  const client = getClient()
  const dispatch = createEventDispatcher()
  const options: FindOptions<Issue> = {
    lookup: {
      status: [tracker.class.IssueStatus, { category: core.class.StatusCategory }]
    },
    sort: { modifiedOn: SortingOrder.Descending }
  }

  // Exclude self, ancestors (would create a cycle) and direct children
  $: ignoreObjects = [
    issue._id,
    ...(issue.parents?.map((p) => p.parentId) ?? []),
    ...(issue.childInfo?.map((c) => c.childId) ?? [])
  ]

  async function onClose ({ detail: selected }: CustomEvent<Issue | undefined | null>): Promise<void> {
    if (selected != null) {
      const lastAttachedIssue = await client.findOne<Issue>(
        tracker.class.Issue,
        { attachedTo: issue._id },
        { sort: { rank: SortingOrder.Descending } }
      )
      await client.update(selected, {
        attachedTo: issue._id,
        rank: makeRank(lastAttachedIssue?.rank, undefined)
      })
    }
    dispatch('close', selected)
  }
</script>

<ObjectPopup
  _class={tracker.class.Issue}
  {options}
  category={tracker.completion.IssueCategory}
  multiSelect={false}
  allowDeselect={false}
  placeholder={tracker.string.AddExistingSubIssue}
  create={undefined}
  {ignoreObjects}
  shadows={true}
  width={'large'}
  searchMode={'spotlight'}
  on:update
  on:close={onClose}
>
  <svelte:fragment slot="item" let:item={subIssue}>
    <div class="flex-center clear-mins w-full h-9">
      {#if subIssue?.$lookup?.status}
        <div class="icon mr-4 h-8">
          <IssueStatusIcon
            value={subIssue.$lookup.status}
            taskType={subIssue.kind}
            space={subIssue.space}
            size="small"
          />
        </div>
      {/if}
      <span class="overflow-label flex-no-shrink mr-3">{subIssue.identifier}</span>
      <span class="overflow-label w-full content-color">{subIssue.title}</span>
    </div>
  </svelte:fragment>
</ObjectPopup>
