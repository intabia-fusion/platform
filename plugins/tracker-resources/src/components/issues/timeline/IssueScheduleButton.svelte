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
  import type { Issue, Milestone } from '@hcengineering/tracker'
  import { Button } from '@hcengineering/ui'
  import view from '@hcengineering/view'
  import tracker from '../../../plugin'
  import { scheduleIssueInMilestone } from '../../../utils'

  export let value: Issue

  let milestone: Milestone | undefined
  const query = createQuery()
  $: if (value.milestone != null) {
    query.query(tracker.class.Milestone, { _id: value.milestone }, (res) => {
      milestone = res[0]
    })
  } else {
    query.unsubscribe()
    milestone = undefined
  }
</script>

{#if milestone !== undefined}
  <Button
    icon={view.icon.Timeline}
    kind={'ghost'}
    size={'small'}
    showTooltip={{ label: tracker.string.AddToMilestone }}
    on:click={() => {
      if (milestone !== undefined) void scheduleIssueInMilestone(value, milestone)
    }}
  />
{/if}
