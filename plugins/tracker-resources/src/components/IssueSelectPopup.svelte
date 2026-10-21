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
  import core, { type DocumentQuery, type FindOptions, type Ref, SortingOrder } from '@hcengineering/core'
  import type { IntlString } from '@hcengineering/platform'
  import { ObjectPopup } from '@hcengineering/presentation'
  import type { Issue } from '@hcengineering/tracker'

  import tracker from '../plugin'
  import IssueStatusIcon from './issues/IssueStatusIcon.svelte'

  export let placeholder: IntlString = tracker.string.FindIssue
  export let width: 'medium' | 'large' | 'full' = 'large'
  export let allowDeselect = true
  export let docQuery: DocumentQuery<Issue> = {}
  export let selected: Ref<Issue> | undefined = undefined
  export let ignoreObjects: Ref<Issue>[] = []

  const options: FindOptions<Issue> = {
    lookup: {
      status: [tracker.class.IssueStatus, { category: core.class.StatusCategory }]
    },
    sort: { modifiedOn: SortingOrder.Descending }
  }
</script>

<ObjectPopup
  _class={tracker.class.Issue}
  {options}
  {docQuery}
  {selected}
  category={tracker.completion.IssueCategory}
  multiSelect={false}
  {allowDeselect}
  {placeholder}
  create={undefined}
  {ignoreObjects}
  shadows={true}
  {width}
  searchMode="spotlight"
  on:update
  on:close
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
