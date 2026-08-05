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
  import { Issue, trackerId } from '@hcengineering/tracker'
  import {
    Button,
    IconAdd,
    IconScaleFull,
    Label,
    SelectPopup,
    SelectPopupValueType,
    closeTooltip,
    getCurrentResolvedLocation,
    navigate,
    showPopup
  } from '@hcengineering/ui'
  import { createFilter, restrictionStore, setFilters } from '@hcengineering/view-resources'
  import tracker from '../../../plugin'
  import AddSubIssuePopup from './AddSubIssuePopup.svelte'
  import QueryIssuesList from './QueryIssuesList.svelte'

  export let issue: Issue
  export let shouldSaveDraft: boolean = false

  export let focusIndex = -1

  let size = issue.subIssues

  const dropdownItems: SelectPopupValueType[] = [
    { id: 'create', icon: IconAdd, label: tracker.string.CreateSubIssue },
    { id: 'existing', icon: tracker.icon.Subissue, label: tracker.string.AddExistingSubIssue }
  ]

  function addExistingSubIssue (): void {
    closeTooltip()
    showPopup(AddSubIssuePopup, { issue }, 'top')
  }

  function createSubIssue (): void {
    closeTooltip()
    showPopup(tracker.component.CreateIssue, { space: issue.space, parentIssue: issue, shouldSaveDraft }, 'top')
  }

  let dropdownBtn: HTMLButtonElement

  function openAddMenu (): void {
    closeTooltip()
    showPopup(SelectPopup, { value: dropdownItems }, dropdownBtn, (id) => {
      if (id === 'create') createSubIssue()
      if (id === 'existing') addExistingSubIssue()
    })
  }
</script>

<QueryIssuesList
  object={issue}
  query={{ attachedTo: issue._id }}
  createParams={{ space: issue.space, parentIssue: issue }}
  createLabel={tracker.string.AddSubIssues}
  hasSubIssues={issue.subIssues > 0}
  dropdownItems={$restrictionStore.readonly ? undefined : dropdownItems}
  {focusIndex}
  {shouldSaveDraft}
  on:docs={(evt) => {
    size = evt.detail.length
  }}
  on:dropdown-selected={(evt) => {
    if (evt.detail === 'create') createSubIssue()
    if (evt.detail === 'existing') addExistingSubIssue()
  }}
>
  <svelte:fragment slot="chevron">
    <Label label={tracker.string.SubIssuesList} params={{ subIssues: size }} />
  </svelte:fragment>
  <svelte:fragment slot="buttons">
    {#if !$restrictionStore.disableNavigation}
      <div class="w-1 flex-no-shrink" />
      <Button
        icon={IconScaleFull}
        kind={'ghost'}
        showTooltip={{ label: tracker.string.OpenSubIssues, direction: 'bottom' }}
        on:click={() => {
          const filter = createFilter(tracker.class.Issue, 'attachedTo', [issue._id])
          if (filter !== undefined) {
            closeTooltip()
            const loc = getCurrentResolvedLocation()
            loc.fragment = undefined
            loc.query = undefined
            loc.path[2] = trackerId
            loc.path[3] = issue.space
            loc.path[4] = 'issues'
            navigate(loc)
            setFilters([filter])
          }
        }}
      />
    {/if}
  </svelte:fragment>
  <svelte:fragment slot="buttons-after">
    {#if !$restrictionStore.readonly}
      <Button
        icon={tracker.icon.Subissue}
        kind={'ghost'}
        showTooltip={{ label: tracker.string.AddSubIssues, direction: 'bottom' }}
        bind:input={dropdownBtn}
        on:click={openAddMenu}
      />
    {/if}
  </svelte:fragment>
</QueryIssuesList>
