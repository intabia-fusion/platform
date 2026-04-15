<!--
// Copyright © 2026 Intabia Fusion
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
  import { Employee } from '@hcengineering/contact'
  import { FindOptions, Ref, SortingOrder } from '@hcengineering/core'
  import presentation, { Card } from '@hcengineering/presentation'
  import { Issue, TimeSpendReport } from '@hcengineering/tracker'
  import { Button, IconAdd, Scroller, showPopup, tableSP } from '@hcengineering/ui'
  import { TableBrowser } from '@hcengineering/view-resources'
  import tracker from '../../../plugin'
  import ParentNamesPresenter from '../ParentNamesPresenter.svelte'
  import PersonPresenter from '@hcengineering/contact-resources/src/components/PersonPresenter.svelte'
  import TimeSpendReportPopup from './TimeSpendReportPopup.svelte'
  import SetParentIssueActionPopup from '../../SetParentIssueActionPopup.svelte'

  export let person: Ref<Employee> | null
  export let ld: number
  export let rd: number

  export function canClose (): boolean {
    return true
  }
  const options: FindOptions<TimeSpendReport> = {
    lookup: {
      attachedTo: tracker.class.Issue
    }
  }

  function addReport (): void {
    showPopup(SetParentIssueActionPopup, { value: [] }, 'top', (issue: Issue | null | undefined) => {
      if (issue == null) return
      // Keep picked day but apply current time-of-day so records read naturally later.
      const now = new Date()
      const d = new Date(ld)
      d.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds())
      showPopup(TimeSpendReportPopup, {
        issue,
        issueId: issue._id,
        issueClass: issue._class,
        space: issue.space,
        assignee: person,
        initialDate: d.valueOf()
      })
    })
  }
</script>

<Card
  label={tracker.string.TimeSpendReports}
  canSave={true}
  on:close
  okAction={() => {}}
  okLabel={presentation.string.Ok}
  on:changeContent
>
  <svelte:fragment slot="header">
    <PersonPresenter value={person} disabled />
  </svelte:fragment>
  <div class="h-full">
    <Scroller fade={tableSP}>
      <TableBrowser
        _class={tracker.class.TimeSpendReport}
        query={{ employee: person, date: { $gte: ld, $lte: rd } }}
        preferredSorting={'date'}
        preferredSortingOrder={SortingOrder.Ascending}
        config={[
          '$lookup.attachedTo',
          '',
          {
            key: '$lookup.attachedTo',
            presenter: ParentNamesPresenter,
            props: { maxWidth: '20rem' },
            label: tracker.string.Title
          },
          'date',
          'description'
        ]}
        {options}
      />
    </Scroller>
  </div>
  <svelte:fragment slot="buttons">
    <Button id="PersonReportsPopupAddButton" icon={IconAdd} size={'large'} on:click={addReport} />
  </svelte:fragment>
</Card>
