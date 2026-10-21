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
  import { SortingOrder } from '@hcengineering/core'
  import { getClient } from '@hcengineering/presentation'
  import { makeRank } from '@hcengineering/task'
  import type { Issue } from '@hcengineering/tracker'
  import { createEventDispatcher } from 'svelte'
  import tracker from '../../../plugin'
  import IssueSelectPopup from '../../IssueSelectPopup.svelte'

  export let issue: Issue

  const client = getClient()
  const dispatch = createEventDispatcher()

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

<IssueSelectPopup
  {ignoreObjects}
  placeholder={tracker.string.AddExistingSubIssue}
  allowDeselect={false}
  on:update
  on:close={onClose}
/>
