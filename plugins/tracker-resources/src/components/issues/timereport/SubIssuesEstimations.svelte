<!--
// Copyright © 2022 Hardcore Engineering Inc.
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
  import { createQuery } from '@hcengineering/presentation'
  import { Issue, reduceChildInfoTree } from '@hcengineering/tracker'
  import { Expandable, Spinner } from '@hcengineering/ui'
  import tracker from '../../../plugin'
  import EstimationSubIssueList from './EstimationSubIssueList.svelte'
  import TimePresenter from './TimePresenter.svelte'

  export let issue: Issue

  const subIssuesQuery = createQuery()

  let subIssues: Issue[] | undefined

  $: subIssuesQuery.query(
    tracker.class.Issue,
    { attachedTo: issue._id },
    async (result) => {
      subIssues = result
    },
    {
      sort: { estimation: SortingOrder.Descending }
    }
  )
  $: total = (subIssues ?? []).reduce((a, b) => a + b.estimation, 0)

  $: childInfos = issue.childInfo ?? []
  $: treeResult = reduceChildInfoTree(childInfos, 0, 0)
</script>

{#if subIssues !== undefined}
  {#if subIssues.length > 0}
    <Expandable label={tracker.string.ChildEstimation} contentColor bordered>
      <svelte:fragment slot="title"
        >: <span class="caption-color">
          {#if total < treeResult.totalEstimation}
            <TimePresenter value={total} /> / <TimePresenter value={treeResult.totalEstimation} />
          {:else}
            <TimePresenter value={total} />
          {/if}
        </span></svelte:fragment
      >
      <EstimationSubIssueList issues={subIssues} />
    </Expandable>
  {/if}
{:else}
  <div class="flex-center pt-3">
    <Spinner />
  </div>
{/if}
