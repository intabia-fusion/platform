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
  import type { Ref } from '@hcengineering/core'
  import { getClient } from '@hcengineering/presentation'
  import type { Issue, Milestone } from '@hcengineering/tracker'
  import type { SelectPopupValueType } from '@hcengineering/ui'
  import { Button, IconAdd, SelectPopup, showPopup } from '@hcengineering/ui'
  import tracker from '../../plugin'
  import { scheduleIssueInMilestone } from '../../utils'
  import MilestoneIssuePopup from './MilestoneIssuePopup.svelte'

  export let parent: Milestone

  const client = getClient()

  const items: SelectPopupValueType[] = [
    { id: 'existing', icon: tracker.icon.Issue, label: tracker.string.SelectIssue },
    { id: 'create', icon: IconAdd, label: tracker.string.NewIssue }
  ]

  async function schedule (issue: Issue): Promise<void> {
    await scheduleIssueInMilestone(issue, parent)
  }

  async function scheduleAll (ids: Array<Ref<Issue>>): Promise<void> {
    const issues = await client.findAll(tracker.class.Issue, { _id: { $in: ids } })
    for (const issue of issues) await schedule(issue)
  }

  function selectExisting (): void {
    showPopup(MilestoneIssuePopup, { milestone: parent }, 'top', (selected: Array<Ref<Issue>> | undefined) => {
      if (selected !== undefined && selected.length > 0) void scheduleAll(selected)
    })
  }

  function createNew (): void {
    showPopup(
      tracker.component.CreateIssue,
      {
        space: parent.space,
        milestone: parent._id,
        shouldSaveDraft: false,
        onCreated: async (id: Ref<Issue>) => {
          const issue = await client.findOne(tracker.class.Issue, { _id: id })
          if (issue !== undefined) await schedule(issue)
        }
      },
      'top'
    )
  }

  function openMenu (e: MouseEvent): void {
    showPopup(SelectPopup, { value: items }, e.currentTarget as HTMLElement, (id) => {
      if (id === 'existing') selectExisting()
      if (id === 'create') createNew()
    })
  }
</script>

<Button icon={IconAdd} kind={'ghost'} size={'small'} dataId={'btn-milestone-timeline-add'} on:click={openMenu} />
