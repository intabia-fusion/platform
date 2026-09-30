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
  import { createQuery } from '@hcengineering/presentation'
  import task from '@hcengineering/task'
  import type { Issue, Milestone } from '@hcengineering/tracker'
  import { floorFractionDigits, tooltip } from '@hcengineering/ui'
  import { statusStore } from '@hcengineering/view-resources'
  import tracker from '../../plugin'
  import { milestoneStats } from '../../milestoneUtils'
  import EstimationProgressCircle from '../issues/timereport/EstimationProgressCircle.svelte'
  import TimePresenter from '../issues/timereport/TimePresenter.svelte'

  export let value: Milestone
  export let showTime: boolean = true

  let issues: Issue[] = []

  // One query per row; a stored aggregate would scale further.
  const query = createQuery()
  $: query.query(
    tracker.class.Issue,
    { milestone: value._id },
    (res) => {
      issues = res
    },
    {
      projection: { _id: 1, status: 1, estimation: 1, reportedTime: 1 }
    }
  )

  $: categoryOf = (issue: Issue): 'won' | 'lost' | undefined => {
    const category = $statusStore.byId.get(issue.status)?.category
    return category === task.statusCategory.Won ? 'won' : category === task.statusCategory.Lost ? 'lost' : undefined
  }

  // Own values: parent remainingTime already includes children.
  $: stats = milestoneStats(issues, categoryOf)
  $: ({ done, percent } = stats)
  $: countable = stats.count - stats.canceled
  $: estimation = floorFractionDigits(stats.estimation, 3)
  $: reported = floorFractionDigits(stats.reported, 3)
  $: remaining = floorFractionDigits(stats.remaining, 3)
</script>

{#if issues.length > 0}
  <div class="flex-row-center flex-no-shrink flex-gap-2">
    <div class="flex-row-center flex-gap-1" use:tooltip={{ label: tracker.string.Issues }}>
      <EstimationProgressCircle items={[{ value: done, max: countable }]} />
      <span>{done}/{countable}</span>
      <span class="content-dark-color">{percent}%</span>
    </div>
    {#if showTime && (estimation > 0 || reported > 0)}
      <div class="flex-row-center flex-gap-1" use:tooltip={{ label: tracker.string.ReportedTime }}>
        <TimePresenter value={reported} />
        /
        <TimePresenter value={estimation} />
      </div>
      {#if remaining > 0}
        <div class="flex-row-center content-dark-color" use:tooltip={{ label: tracker.string.RemainingTime }}>
          <TimePresenter value={remaining} />
        </div>
      {/if}
    {/if}
  </div>
{/if}
